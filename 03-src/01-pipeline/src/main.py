"""Pipeline 入口：解析文件名 → 编排 step1-5，支持按步骤执行

输出目录结构：
  output/01-pages/L*_lesson*/          step1: 拆页 PNG
  output/02-ocr/L*_lesson*/            step2: OCR markdown
  output/02-ocr/latex_imgs/L*_lesson*/ step2: 图片（含 VLM 检测裁剪）
  output/03-merge/L*_lesson*/          step3: ocr_merged.md（全讲拼接）
  output/04-json/L*_lesson*/           step4: lesson.json
  output/05-sql/                        step5: L*_lesson*.sql
  (step6: 直写 MySQL pre_ 系列表)
"""
import argparse
import json
import math
import re
import sys
from pathlib import Path

from utils.config import (
    MATERIAL_SET, INPUT_DIR, OUTPUT_DIR, PREP_DATABASE_URL,
    DIR_01_PAGES, DIR_02_OCR, DIR_03_MERGE, DIR_04_JSON, DIR_05_SQL,
)
from utils.logger import setup_logger

logger = setup_logger(__name__)

from step1_split import split_pdf
from step2_ocr import ocr_pages
from step3_merge import merge_pages
from step4_parse import parse_lesson
from step5_sql import generate_sql
from step6_sql_2db import write_lesson

# 文件名正则：匹配 "第N讲 名称.pdf"
_LESSON_RE = re.compile(r"第(\d+)讲\s+(.+)\.pdf$")
# 目录名正则：匹配 "N级-..."
_LEVEL_RE = re.compile(r"^(\d+)级-")
# 跳过参考答案
_SKIP_RE = re.compile(r"参考答案")
_ALL_STEPS = {1, 2, 3, 4, 5, 6}
_DEFAULT_STEPS = {1, 2, 3, 4, 5}


def parse_pdf_meta(pdf_path: Path) -> dict | None:
    """从文件路径提取 level / lesson_num / lesson_name / grade / semester"""
    m_lesson = _LESSON_RE.search(pdf_path.name)
    if not m_lesson or _SKIP_RE.search(pdf_path.name):
        return None

    m_level = _LEVEL_RE.match(pdf_path.parent.name)
    if not m_level:
        return None

    level = int(m_level.group(1))
    lesson_num = int(m_lesson.group(1))
    lesson_name = m_lesson.group(2).strip()
    grade = math.ceil(level / 2)
    semester = 1 if level % 2 == 1 else 2

    return {
        "material_set": MATERIAL_SET,
        "level": level,
        "grade": grade,
        "semester": semester,
        "lesson_num": lesson_num,
        "lesson_name": lesson_name,
        "file_path": str(pdf_path.resolve()),
    }


def parse_steps(spec: str | None) -> set[int]:
    """解析 -s 参数，支持 2 / 2-4 / 1,3；默认返回全部步骤"""
    if not spec:
        return set(_DEFAULT_STEPS)

    steps: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start_s, end_s = part.split("-", 1)
            start, end = int(start_s), int(end_s)
            if start > end:
                start, end = end, start
            steps.update(range(start, end + 1))
        else:
            steps.add(int(part))

    invalid = steps - _ALL_STEPS
    if invalid:
        raise ValueError(f"无效步骤: {sorted(invalid)}，可选 1-6")
    return steps


# ── 按步骤输出目录 ─────────────────────────────────────────────────────────────

def _pages_dir(tag: str) -> Path:
    return OUTPUT_DIR / DIR_01_PAGES / tag


def _ocr_dir(tag: str) -> Path:
    return OUTPUT_DIR / DIR_02_OCR / tag


def _merge_file(tag: str) -> Path:
    return OUTPUT_DIR / DIR_03_MERGE / f"{tag}_merged.md"


def _json_file(tag: str) -> Path:
    return OUTPUT_DIR / DIR_04_JSON / f"{tag}_lesson.json"


def _sql_dir() -> Path:
    return OUTPUT_DIR / DIR_05_SQL


# ── 缓存检测 ───────────────────────────────────────────────────────────────────

def _has_step1(tag: str) -> bool:
    return _pages_dir(tag).is_dir()


def _has_step2(tag: str) -> bool:
    return _ocr_dir(tag).is_dir()


def _has_step3(tag: str) -> bool:
    return _merge_file(tag).exists()


def _has_step4(tag: str) -> bool:
    return _json_file(tag).exists()


# ── 缓存加载 ───────────────────────────────────────────────────────────────────

def _require_dir(path: Path, step: int, hint: str):
    if not path.exists():
        raise FileNotFoundError(f"step{step} 缺少前置输出: {path}（{hint}）")


def load_split_result(tag: str) -> dict:
    """从 01-pages 目录恢复 step1 结果"""
    pages_d = _pages_dir(tag)
    _require_dir(pages_d, 1, "请先执行 step1")

    pages = []
    for page_path in sorted(pages_d.glob("page_*.png")):
        pnum = int(page_path.stem.split("_")[1])
        pages.append({"page_num": pnum, "path": str(page_path)})

    return {"pages": pages}


def load_ocr_result(tag: str) -> tuple[list[dict], list[dict]]:
    """从 02-ocr 目录扫描所有已缓存页面，不依赖 step1 页面列表"""
    ocr_d = _ocr_dir(tag)
    _require_dir(ocr_d, 2, "请先执行 step2")

    results = []
    all_extracted = []
    for cache_md in sorted(ocr_d.glob("page_*.md")):
        pnum = int(cache_md.stem.split("_")[1])
        results.append({
            "page_num": pnum,
            "path": "",
            "markdown": cache_md.read_text(encoding="utf-8"),
        })
        cache_imgs = ocr_d / f"page_{pnum:02d}_images.json"
        if cache_imgs.exists():
            all_extracted.extend(json.loads(cache_imgs.read_text(encoding="utf-8")))

    # logger.info("step2: [缓存] 加载 %d 页  images=%d", len(results), len(all_extracted))
    return results, all_extracted


def load_lesson_json(tag: str) -> dict:
    """从 04-json 目录恢复 step4 结果"""
    cache_path = _json_file(tag)
    if not cache_path.exists():
        raise FileNotFoundError(f"step4 缺少 {cache_path.name}，请先执行 step4")
    return json.loads(cache_path.read_text(encoding="utf-8"))


# ── 核心处理流程 ───────────────────────────────────────────────────────────────

def process_pdf(pdf_path: Path, steps: set[int]):
    meta = parse_pdf_meta(pdf_path)
    if not meta:
        logger.debug("[skip] %s", pdf_path.name)
        return

    tag = f"L{meta['level']:02d}_lesson{meta['lesson_num']:02d}"

    pages_out  = _pages_dir(tag)
    ocr_out    = _ocr_dir(tag)
    merge_file = _merge_file(tag)
    json_file  = _json_file(tag)
    sql_out   = _sql_dir()

    # logger.info("=" * 60)
    # logger.info(" PDF 名称：[%s] %s", tag, meta["lesson_name"])
    # logger.info("  目标步骤: %s", ", ".join(f"step{n}" for n in sorted(steps)))
    # logger.info("=" * 60)

    split_result = None
    ocr_result = None
    extracted_images: list[dict] = []
    lesson = None

    # ── step1：拆页 ──────────────────────────────────────────────────────────
    needs_split = bool(steps & {1, 2, 3, 4, 5})
    if needs_split:
        if 1 in steps or not _has_step1(tag):
            label = "step1" if 1 in steps else "step1 [自动触发]"
            split_result = split_pdf(str(pdf_path), pages_out)
        else:
            logger.debug("step1: [已完成该PDF的「步骤一：PDF-->PNG」 执行，跳过]")
            split_result = load_split_result(tag)

    # ── step2：OCR + VLM 图片检测裁剪 ───────────────────────────────────────
    needs_ocr = bool(steps & {2, 3, 4, 5, 6})
    if needs_ocr:
        if 2 in steps or (not _has_step2(tag) and bool(steps & {3, 4, 5})):
            label = "step2" if 2 in steps else "step2 [自动触发]"
            # logger.info("%s: OCR (%d 页)...", label, len(split_result["pages"]))
            ocr_result, extracted_images = ocr_pages(split_result["pages"], ocr_out)
        elif _has_step2(tag):
            logger.debug("step2: [已完成该PDF的「步骤二：OCR-->Markdown」 执行，跳过]")
            ocr_result, extracted_images = load_ocr_result(tag)
        else:
            raise FileNotFoundError(f"step2 缺少前置输出: {ocr_out}（请先执行 step2）")

    # ── step3：拼接全讲 Markdown ─────────────────────────────────────────────
    needs_merge = bool(steps & {3, 4, 5})
    if needs_merge:
        if 3 in steps or not _has_step3(tag):
            label = "step3" if 3 in steps else "step3 [自动触发]"
            logger.info("%s: 拼接全讲 Markdown...", label)
            merge_pages(ocr_result, merge_file)
        else:
            logger.debug("step3: [已完成该PDF的「步骤三：Markdown-->全讲拼接」 执行，跳过]")

    # ── step4：DeepSeek 结构解析 ─────────────────────────────────────────────
    needs_parse = bool(steps & {4, 5, 6})
    if needs_parse:
        if 4 in steps or (not _has_step4(tag) and 5 in steps):
            label = "step4" if 4 in steps else "step4 [自动触发]"
            # logger.info("%s: DeepSeek 结构解析...", label)
            lesson = parse_lesson(ocr_result, extracted_images, json_file)
        elif _has_step4(tag):
            logger.debug("step4: [已完成该PDF的「步骤四：全讲拼接-->DeepSeek结构解析」 执行，跳过]")
            lesson = load_lesson_json(tag)
        else:
            raise FileNotFoundError(f"step4 缺少 {_json_file(tag).name}，请先执行 step4")

    # ── step5：生成 SQL ──────────────────────────────────────────────────────
    if 5 in steps:
        generate_sql(meta, lesson, extracted_images, sql_out, tag)

    # ── step6：写入数据库 ─────────────────────────────────────────────────────
    if 6 in steps:
        if not PREP_DATABASE_URL:
            raise RuntimeError("PREP_DATABASE_URL 未配置")
        img_map = {img["placeholder"]: img["path"] for img in extracted_images}
        write_lesson(meta, lesson, img_map)


def collect_pdfs(target: Path) -> list[Path]:
    if target.is_file():
        return [target]
    pdfs = sorted(target.rglob("*.pdf"))
    return [p for p in pdfs if not _SKIP_RE.search(p.name)]


def main():
    parser = argparse.ArgumentParser(
        description="学而思秘籍 PDF 预处理 Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
步骤说明:
  1  PDF 拆页            → output/01-pages/L*/
  2  OCR + 图片裁剪      → output/02-ocr/L*/ + 02-ocr/latex_imgs/L*/
  3  拼接全讲 Markdown   → output/03-merge/L*/ocr_merged.md
  4  DeepSeek 结构解析   → output/04-json/L*_lesson.json
  5  生成 SQL            → output/05-sql/L*.sql
  6  写入数据库          → pre_ 系列表（pymysql 直写）

示例:
  %(prog)s -s 1                                     # 仅拆页
  %(prog)s -f input/11级-xxx/第1讲 名称.pdf          # 全流程（step1-5）
  %(prog)s -f input/.../第1讲 名称.pdf -s 2          # 仅 OCR
  %(prog)s -f input/.../第1讲 名称.pdf -s 2-4        # step2~4
  %(prog)s -f input/.../第1讲 名称.pdf -s 6          # 仅写库（需 step2+4 缓存）
  %(prog)s -d input                                  # 批量处理
        """,
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("-f", dest="file", type=Path, help="处理单个 PDF")
    group.add_argument("-d", dest="dir", type=Path, help="批量处理目录（递归），默认 input/")
    parser.add_argument(
        "-s",
        dest="step",
        type=str,
        default=None,
        help="指定执行步骤，如 2 / 2-4 / 1,3；默认执行全部步骤",
    )
    args = parser.parse_args()

    try:
        steps = parse_steps(args.step)
    except ValueError as e:
        logger.error("%s", e)
        sys.exit(1)

    target = args.file or args.dir or INPUT_DIR
    if not target.exists():
        logger.error("输入路径不存在: %s", target)
        sys.exit(1)
    pdfs = collect_pdfs(target)

    if not pdfs:
        logger.warning("未找到任何 PDF 文件")
        sys.exit(1)

    logger.info("共找到 %d 个讲次 PDF", len(pdfs))
    for i, pdf in enumerate(pdfs, 1):
        logger.info("[%d/%d] 启动 PDF 处理: %s", i, len(pdfs), pdf.name)
        try:
            process_pdf(pdf, steps)
        except Exception as e:
            logger.error("%s: %s", pdf.name, e)
            continue

    logger.info("全部完成。")


if __name__ == "__main__":
    main()
