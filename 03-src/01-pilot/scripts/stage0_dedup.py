#!/usr/bin/env python3
"""
Stage 0: PDF 页面去重与空白过滤

四层过滤：
  L1 规则跳过   前N页 + 后M页（共用封面/封底）
  L2 哈希去重   跨文件感知哈希，重复页只处理一次
  L3 像素检测   整页接近空白 → 跳过
  L4 语义过滤   无数学特征词 + 文字极少 → 跳过（text PDF 直提文字，scanned 降级像素）

用法:
    python pilot/scripts/stage0_dedup.py --input pilot/samples/text_pdf/
    python pilot/scripts/stage0_dedup.py --input pilot/samples/text_pdf/ --front 4 --back 2 --verbose
"""

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from typing import Optional

import fitz                          # PyMuPDF（已安装）
from PIL import Image, ImageFilter   # Pillow（已安装）

# ─── 默认参数 ──────────────────────────────────────────────────────────────
FRONT_SKIP_DEFAULT = 4
BACK_SKIP_DEFAULT  = 2
MIN_CHARS          = 30     # text PDF 语义过滤：有效字符下限
MATHPIX_RATE_USD   = 0.004  # 成本估算：$0.004/页

RENDER_DPI = 72   # 像素分析渲染 DPI
HASH_DPI   = 36   # hash 缩略图 DPI（小图速度快，精确度足够）

# ── L3 像素阈值（保守：三个信号同时满足才判断为空白）──────────────────────
BLANK_BRIGHT = 0.995   # 亮像素 (>240) 占比
BLANK_DARK   = 0.001   # 暗像素 (<80)  占比
BLANK_EDGE   = 0.002   # 边缘密度

# ── L4 图片型 PDF 补充阈值（仅用于 image PDF，无法提取文字时）───────────────
# 页面几乎全为中高亮度（无真正的黑色墨迹），大概率是空白答题框页
IMG_PDF_BLANK_BRIGHT = 0.98   # 亮像素 > 此值
IMG_PDF_BLANK_DARK   = 0.002  # 暗像素 < 此值（比 L3 稍宽松，有彩色装饰的空白页）

# ── L4 text PDF 数学内容正则（任意一条命中 → 保留）─────────────────────────
MATH_PATTERNS = [
    r'\d{2,}',
    r'[×÷·=≠≈≤≥∑∫√%‰]',
    r'[=＝]\s*\d',
    r'[+\-*/]\s*\d',
    r'\b(计算|求|证明|解|设|若|答)\s*[:：]?',
    r'(练习|例题|例\s*\d|习题|第\s*\d+\s*题)',
    r'[(（]\s*\d+\s*[）)]',
    r'[A-Za-z]\s*[=＝]\s*[\d(（]',
]
_MATH_RE = re.compile('|'.join(MATH_PATTERNS))


# ─── 工具函数 ──────────────────────────────────────────────────────────────

def render_page(page: fitz.Page, dpi: int) -> Image.Image:
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)


def page_md5(page: fitz.Page, dpi: int = HASH_DPI) -> str:
    """渲染为灰度缩略图后计算 MD5，用于精确重复检测。
    同一向量内容在同一 DPI 下像素完全相同，MD5 一致 = 真正相同页。
    """
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
    return hashlib.md5(pix.samples).hexdigest()


def pixel_stats(img: Image.Image) -> tuple[float, float, float]:
    """返回 (bright_ratio, dark_ratio, edge_ratio)，仅用 Pillow，无需 numpy。"""
    gray  = img.convert('L')
    total = gray.width * gray.height
    hist  = gray.histogram()  # 256 个 bin

    bright = sum(hist[241:]) / total   # pixel > 240（近白）
    dark   = sum(hist[:81])  / total   # pixel < 81 （墨迹）

    edges     = gray.filter(ImageFilter.FIND_EDGES)
    ehist     = edges.histogram()
    edge_ratio = sum(ehist[50:]) / total  # 边缘像素强度 > 50

    return bright, dark, edge_ratio


def extract_text(page: fitz.Page) -> str:
    """提取 PDF 页面内嵌文字（text PDF 有效；scanned 返回空字符串）。"""
    return page.get_text("text").strip()


def has_math(text: str) -> bool:
    return bool(_MATH_RE.search(text))


def effective_chars(text: str) -> int:
    """去掉空白、换行后的有效字符数。"""
    return len(re.sub(r'\s+', '', text))


# ─── 页面分类 ──────────────────────────────────────────────────────────────

def classify_page(
    page:         fitz.Page,
    page_num:     int,          # 1-indexed
    total_pages:  int,
    front_skip:   int,
    back_skip:    int,
    seen_hashes:  dict,         # hash → "pdf_stem:page_num"
    pdf_label:    str,
) -> dict:
    """
    对单页做四层判断，返回 record dict。
    seen_hashes 会在函数内被修改（登记本页哈希）。
    """
    record = {
        "pdf":     pdf_label,
        "page":    page_num,
        "verdict": "process",
        "layer":   None,
        "reason":  None,
        "text_len": 0,
        "bright":  0.0,
        "dark":    0.0,
        "edge":    0.0,
        "hash":    None,
    }

    # ── L1 规则跳过 ────────────────────────────────────────────────────────
    if page_num <= front_skip:
        record["verdict"] = "skip"
        record["layer"]   = "rule_front"
        record["reason"]  = f"front_{front_skip}"
        return record

    if page_num > total_pages - back_skip:
        record["verdict"] = "skip"
        record["layer"]   = "rule_back"
        record["reason"]  = f"back_{back_skip}"
        return record

    # ── L2 精确哈希去重（MD5，无误报）────────────────────────────────────
    h = page_md5(page)
    record["hash"] = h[:8]   # 记录前8位便于阅读

    if h in seen_hashes:
        record["verdict"] = "skip"
        record["layer"]   = "hash_dup"
        record["reason"]  = f"dup_of:{seen_hashes[h]}"
        return record

    seen_hashes[h] = f"{pdf_label}:p{page_num}"

    # ── L3 像素空白检测（保守，三信号同时达标）────────────────────────────
    img = render_page(page, RENDER_DPI)
    bright, dark, edge = pixel_stats(img)
    record["bright"] = round(bright, 4)
    record["dark"]   = round(dark, 4)
    record["edge"]   = round(edge, 4)

    if bright > BLANK_BRIGHT and dark < BLANK_DARK and edge < BLANK_EDGE:
        record["verdict"] = "skip"
        record["layer"]   = "blank"
        record["reason"]  = f"bright={bright:.3f},dark={dark:.4f},edge={edge:.4f}"
        return record

    # ── L4 语义过滤 ────────────────────────────────────────────────────────
    text    = extract_text(page)
    n_chars = effective_chars(text)
    record["text_len"] = n_chars

    if n_chars > 0:
        # text PDF：有嵌入文字，用正则精确判断
        if not has_math(text) and n_chars < MIN_CHARS:
            record["verdict"] = "skip"
            record["layer"]   = "semantic_text"
            record["reason"]  = f"no_math,chars={n_chars},preview={text[:40].replace(chr(10),' ')!r}"
            return record
    else:
        # image PDF（如扫描件）：无法提取文字，用像素密度作兜底
        # 条件：亮度极高 + 暗像素极少 → 无实际墨迹内容（空白答题框页）
        # 注意：彩色装饰文字也是 mid-bright，不算 dark；但有题目内容的页暗像素必 > 0.002
        if bright > IMG_PDF_BLANK_BRIGHT and dark < IMG_PDF_BLANK_DARK:
            record["verdict"] = "skip"
            record["layer"]   = "semantic_pixel"
            record["reason"]  = f"image_pdf_low_ink,bright={bright:.3f},dark={dark:.4f}"
            return record

    return record


# ─── 单份 PDF 处理 ────────────────────────────────────────────────────────

def process_pdf(
    pdf_path:   Path,
    front_skip: int,
    back_skip:  int,
    seen_hashes: dict,
    verbose:    bool = False,
) -> list[dict]:
    doc   = fitz.open(str(pdf_path))
    total = doc.page_count
    label = pdf_path.stem
    records = []

    if verbose:
        print(f"\n  [{label[:40]}]  {total} 页")

    for i in range(total):
        page    = doc[i]
        page_num = i + 1
        rec = classify_page(page, page_num, total, front_skip, back_skip, seen_hashes, label)
        records.append(rec)

        if verbose:
            icon = "✓" if rec["verdict"] == "process" else "✗"
            tag  = rec["layer"] or ""
            print(f"    p{page_num:03d} {icon} {tag:20s} {rec['reason'] or ''}")

    doc.close()
    return records


# ─── 汇总报告 ─────────────────────────────────────────────────────────────

def build_report(all_records: list[dict], elapsed: float) -> dict:
    total   = len(all_records)
    process = [r for r in all_records if r["verdict"] == "process"]
    skip    = [r for r in all_records if r["verdict"] == "skip"]

    layers  = {}
    for r in skip:
        k = r.get("layer") or "unknown"
        layers[k] = layers.get(k, 0) + 1

    savings_usd = len(skip) * MATHPIX_RATE_USD

    return {
        "total_pages":  total,
        "to_process":   len(process),
        "skipped":      len(skip),
        "skip_rate":    round(len(skip) / max(total, 1), 3),
        "breakdown":    layers,
        "savings_usd":  round(savings_usd, 4),
        "elapsed_s":    round(elapsed, 2),
    }


def print_summary(report: dict) -> None:
    total = report["total_pages"]
    proc  = report["to_process"]
    skip  = report["skipped"]
    bd    = report["breakdown"]

    print(f"\n{'='*55}")
    print(f"  总页数:      {total}")
    print(f"  待处理:      {proc}   ({proc/max(total,1)*100:.1f}%)")
    print(f"  跳过:        {skip}   ({skip/max(total,1)*100:.1f}%)")
    print(f"  {'─'*45}")
    for layer, cnt in bd.items():
        print(f"    {layer:<20s} {cnt:>4d} 页")
    print(f"  {'─'*45}")
    print(f"  节省费用:    ${report['savings_usd']:.4f}  ({skip} 页 × ${MATHPIX_RATE_USD})")
    print(f"  耗时:        {report['elapsed_s']} s")
    print(f"{'='*55}")


# ─── 主流程 ──────────────────────────────────────────────────────────────

def run(
    input_path:  Path,
    output_dir:  Path,
    front_skip:  int,
    back_skip:   int,
    verbose:     bool,
) -> None:
    # 收集 PDF 文件
    if input_path.is_dir():
        pdfs = sorted(input_path.glob("*.pdf")) + sorted(input_path.glob("*.PDF"))
    else:
        pdfs = [input_path]

    if not pdfs:
        print(f"[ERROR] 未找到 PDF 文件：{input_path}")
        sys.exit(1)

    print(f"找到 {len(pdfs)} 份 PDF，前{front_skip}页+后{back_skip}页规则跳过")

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "pages_manifest.jsonl"
    report_path   = output_dir / "stage0_report.json"

    seen_hashes: dict[str, str] = {}
    all_records: list[dict]     = []

    t0 = time.time()
    for pdf_path in pdfs:
        records = process_pdf(pdf_path, front_skip, back_skip, seen_hashes, verbose)
        all_records.extend(records)

    elapsed = time.time() - t0

    # 写 manifest（只含待处理页）
    with manifest_path.open("w", encoding="utf-8") as f:
        for r in all_records:
            if r["verdict"] == "process":
                f.write(json.dumps({"pdf": r["pdf"], "page": r["page"]}, ensure_ascii=False) + "\n")

    # 写完整报告
    report = build_report(all_records, elapsed)
    report["details"] = all_records
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print_summary(report)
    print(f"\n  Manifest → {manifest_path}")
    print(f"  报告     → {report_path}")


# ─── CLI ────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Stage 0: PDF 页面去重与空白过滤")
    p.add_argument("--input",   required=True,  help="PDF 文件或目录")
    p.add_argument("--output",  default=None,   help="输出目录（默认 pilot/results/）")
    p.add_argument("--front",   type=int, default=FRONT_SKIP_DEFAULT, help=f"跳过前N页（默认{FRONT_SKIP_DEFAULT}）")
    p.add_argument("--back",    type=int, default=BACK_SKIP_DEFAULT,  help=f"跳过后M页（默认{BACK_SKIP_DEFAULT}）")
    p.add_argument("--verbose", action="store_true", help="逐页打印判断结果")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"[ERROR] 路径不存在：{input_path}")
        sys.exit(1)

    # 默认输出到 pilot/results/（相对脚本位置向上两级）
    if args.output:
        output_dir = Path(args.output)
    else:
        output_dir = Path(__file__).parent.parent / "results"

    run(input_path, output_dir, args.front, args.back, args.verbose)
