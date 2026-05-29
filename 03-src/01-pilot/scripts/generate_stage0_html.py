#!/usr/bin/env python3
"""
生成 Stage 0 预处理效果 HTML 报告
逐页展示：保留（绿框）/ 跳过（彩色遮罩 + 原因标签）
用法: python pilot/scripts/generate_stage0_html.py
"""

import base64
import json
import sys
import time
from io import BytesIO
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

# ─── 路径配置 ──────────────────────────────────────────────────────────────
SCRIPT_DIR  = Path(__file__).parent
PILOT_DIR   = SCRIPT_DIR.parent
PDF_DIR     = PILOT_DIR / "samples" / "text_pdf"
RESULTS_DIR = PILOT_DIR / "results"
REPORT_JSON = RESULTS_DIR / "stage0_report.json"
OUTPUT_HTML = RESULTS_DIR / "stage0_preview.html"

THUMB_DPI   = 36   # 缩略图渲染 DPI（A4 → ~310×424px，2x 够清晰）
DISPLAY_W   = 140  # HTML 显示宽度（px）

# ─── 各层颜色与标签 ────────────────────────────────────────────────────────
LAYER_META = {
    "rule_front":     {"color": "#F39C12", "bg": "#FEF9E7", "label": "封面页",  "icon": "📄"},
    "rule_back":      {"color": "#E67E22", "bg": "#FEF5E7", "label": "封底页",  "icon": "📄"},
    "hash_dup":       {"color": "#8E44AD", "bg": "#F5EEF8", "label": "重复页",  "icon": "♻️"},
    "blank":          {"color": "#7F8C8D", "bg": "#F2F3F4", "label": "空白页",  "icon": "⬜"},
    "semantic_text":  {"color": "#2980B9", "bg": "#EBF5FB", "label": "无内容",  "icon": "🔤"},
    "semantic_pixel": {"color": "#2980B9", "bg": "#EBF5FB", "label": "无内容",  "icon": "🔤"},
    "process":        {"color": "#27AE60", "bg": "#EAFAF1", "label": "保留",    "icon": "✅"},
}

OVERLAY_ALPHA = 140   # 跳过页面遮罩透明度（0-255）


# ─── 缩略图生成 ────────────────────────────────────────────────────────────

def render_thumb(page: fitz.Page, dpi: int = THUMB_DPI) -> Image.Image:
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)


def apply_skip_overlay(img: Image.Image, layer: str) -> Image.Image:
    """在跳过页面上叠加半透明彩色遮罩。"""
    meta   = LAYER_META.get(layer, LAYER_META["blank"])
    color  = meta["color"].lstrip("#")
    r, g, b = int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16)

    overlay = Image.new("RGBA", img.size, (r, g, b, OVERLAY_ALPHA))
    base    = img.convert("RGBA")
    # 先将图片转为低饱和度（灰色调）再叠色
    gray    = img.convert("L").convert("RGB")
    gray_a  = gray.convert("RGBA")
    result  = Image.alpha_composite(gray_a, overlay)
    return result.convert("RGB")


def img_to_b64(img: Image.Image, quality: int = 72) -> str:
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


# ─── HTML 构建 ─────────────────────────────────────────────────────────────

CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
       background: #F4F6F8; color: #2C3E50; }
.header { background: linear-gradient(135deg,#1A252F,#2C3E50);
          color:#fff; padding:28px 40px; }
.header h1 { font-size:22px; font-weight:600; margin-bottom:6px; }
.header .sub { opacity:.7; font-size:13px; }
.summary { display:flex; gap:16px; padding:20px 40px; flex-wrap:wrap; }
.stat-card { background:#fff; border-radius:10px; padding:16px 22px;
             box-shadow:0 1px 4px rgba(0,0,0,.08); min-width:130px; }
.stat-card .val { font-size:28px; font-weight:700; line-height:1; }
.stat-card .lbl { font-size:12px; color:#7F8C8D; margin-top:4px; }
.legend { display:flex; gap:10px; padding:0 40px 16px; flex-wrap:wrap; }
.legend-item { display:flex; align-items:center; gap:6px;
               background:#fff; border-radius:20px; padding:5px 12px;
               font-size:12px; box-shadow:0 1px 3px rgba(0,0,0,.07); }
.legend-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
.pdf-section { background:#fff; margin:0 40px 24px;
               border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,.07);
               overflow:hidden; }
.pdf-header { padding:16px 22px; border-bottom:1px solid #ECF0F1;
              display:flex; align-items:center; justify-content:space-between; }
.pdf-title { font-size:14px; font-weight:600; }
.pdf-stats { font-size:12px; color:#7F8C8D; display:flex; gap:12px; }
.pdf-stats span { display:flex; align-items:center; gap:4px; }
.pages-grid { display:flex; flex-wrap:wrap; gap:10px; padding:16px 22px; }
.page-card { position:relative; flex-shrink:0; }
.page-card img { display:block; border-radius:4px;
                 border:2px solid transparent; transition:transform .15s; }
.page-card:hover img { transform:scale(1.05); z-index:10;
                       box-shadow:0 4px 20px rgba(0,0,0,.2); }
.page-card.process img { border-color:#27AE60; }
.page-card.skip img   { border-color:var(--layer-color); }
.page-num { position:absolute; bottom:0; left:0; right:0;
            text-align:center; font-size:10px; font-weight:600;
            padding:2px 0; border-radius:0 0 3px 3px; color:#fff;
            background:rgba(0,0,0,.45); }
.skip-badge { position:absolute; top:4px; left:4px; right:4px;
              text-align:center; font-size:10px; font-weight:700;
              padding:3px 6px; border-radius:4px; color:#fff;
              background:var(--layer-color); opacity:.92; }
.page-card.process .skip-badge { display:none; }
.tooltip { position:absolute; bottom:calc(100% + 6px); left:50%;
           transform:translateX(-50%); background:#1A252F; color:#fff;
           font-size:11px; padding:5px 8px; border-radius:5px;
           white-space:nowrap; opacity:0; pointer-events:none;
           transition:opacity .15s; z-index:20; max-width:240px;
           word-break:break-all; white-space:normal; text-align:left; }
.page-card:hover .tooltip { opacity:1; }
"""

def build_legend_html() -> str:
    items = []
    for layer, meta in LAYER_META.items():
        if layer == "semantic_text":
            continue   # 合并显示
        items.append(
            f'<div class="legend-item">'
            f'<div class="legend-dot" style="background:{meta["color"]}"></div>'
            f'{meta["icon"]} {meta["label"]}</div>'
        )
    return '<div class="legend">' + "".join(items) + "</div>"


def build_page_card(page_rec: dict, img_b64: str) -> str:
    layer   = page_rec.get("layer") or "process"
    verdict = page_rec["verdict"]
    meta    = LAYER_META.get(layer, LAYER_META["process"])
    pn      = page_rec["page"]
    reason  = page_rec.get("reason") or ""

    css_class = verdict  # "process" or "skip"
    color     = meta["color"]
    label     = meta["label"]
    icon      = meta["icon"]

    # tooltip 内容
    if verdict == "process":
        tip = f"p{pn} · 保留处理"
    else:
        tip = f"p{pn} · 跳过 [{label}]<br>{reason}"

    badge = "" if verdict == "process" else (
        f'<div class="skip-badge">{icon} {label}</div>'
    )
    tooltip = f'<div class="tooltip">{tip}</div>'

    return (
        f'<div class="page-card {css_class}" style="--layer-color:{color};">'
        f'<img src="data:image/jpeg;base64,{img_b64}" width="{DISPLAY_W}">'
        f'{badge}'
        f'<div class="page-num">p{pn}</div>'
        f'{tooltip}'
        f'</div>'
    )


def build_pdf_section(pdf_stem: str, records: list[dict], pdf_dir: Path) -> str:
    # 找到 PDF 文件
    pdf_path = pdf_dir / f"{pdf_stem}.pdf"
    if not pdf_path.exists():
        return f'<div class="pdf-section"><p>未找到：{pdf_stem}</p></div>'

    doc      = fitz.open(str(pdf_path))
    total    = len(records)
    n_skip   = sum(1 for r in records if r["verdict"] == "skip")
    n_proc   = total - n_skip
    layers_cnt: dict[str, int] = {}
    for r in records:
        if r["verdict"] == "skip" and r.get("layer"):
            layers_cnt[r["layer"]] = layers_cnt.get(r["layer"], 0) + 1

    layer_badges = " ".join(
        f'<span style="color:{LAYER_META.get(k, LAYER_META["blank"])["color"]}">'
        f'{LAYER_META.get(k, LAYER_META["blank"])["icon"]} {LAYER_META.get(k, LAYER_META["blank"])["label"]} ×{v}'
        f'</span>'
        for k, v in layers_cnt.items()
    )

    short_name = pdf_stem.split("》")[-1].strip() if "》" in pdf_stem else pdf_stem[-30:]

    header = (
        f'<div class="pdf-header">'
        f'<div class="pdf-title">{short_name}</div>'
        f'<div class="pdf-stats">'
        f'<span>共 {total} 页</span>'
        f'<span style="color:#27AE60">✅ 保留 {n_proc}</span>'
        f'<span style="color:#E74C3C">✗ 跳过 {n_skip}</span>'
        f'{layer_badges}'
        f'</div>'
        f'</div>'
    )

    cards = []
    for rec in records:
        page   = doc[rec["page"] - 1]
        thumb  = render_thumb(page)
        if rec["verdict"] == "skip":
            thumb = apply_skip_overlay(thumb, rec.get("layer") or "blank")
        b64 = img_to_b64(thumb)
        cards.append(build_page_card(rec, b64))

    doc.close()

    grid = '<div class="pages-grid">' + "".join(cards) + "</div>"
    return f'<div class="pdf-section">{header}{grid}</div>'


# ─── 主流程 ───────────────────────────────────────────────────────────────

def run() -> None:
    if not REPORT_JSON.exists():
        print(f"[ERROR] 未找到报告：{REPORT_JSON}")
        print("请先运行: python pilot/scripts/stage0_dedup.py --input pilot/samples/text_pdf/")
        sys.exit(1)

    report = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
    details = report.get("details", [])

    # 按 PDF 分组
    from collections import defaultdict, OrderedDict
    groups: dict[str, list] = OrderedDict()
    for rec in details:
        pdf = rec["pdf"]
        if pdf not in groups:
            groups[pdf] = []
        groups[pdf].append(rec)

    print(f"生成报告：{len(groups)} 份 PDF，共 {report['total_pages']} 页")

    # ── 汇总卡片 ─────────────────────────────────────────────────────────
    total   = report["total_pages"]
    n_proc  = report["to_process"]
    n_skip  = report["skipped"]
    rate    = report["skip_rate"]
    savings = report["savings_usd"]
    elapsed = report.get("elapsed_s", 0)

    breakdown = report.get("breakdown", {})
    bd_html = "".join(
        f'<div class="stat-card">'
        f'<div class="val" style="color:{LAYER_META.get(k, LAYER_META["blank"])["color"]}">{v}</div>'
        f'<div class="lbl">{LAYER_META.get(k, LAYER_META["blank"])["icon"]} {LAYER_META.get(k, LAYER_META["blank"])["label"]}层</div>'
        f'</div>'
        for k, v in breakdown.items()
    )

    summary_html = f"""
    <div class="summary">
      <div class="stat-card">
        <div class="val">{total}</div><div class="lbl">总页数</div>
      </div>
      <div class="stat-card">
        <div class="val" style="color:#27AE60">{n_proc}</div>
        <div class="lbl">✅ 保留（送 MathPix）</div>
      </div>
      <div class="stat-card">
        <div class="val" style="color:#E74C3C">{n_skip}</div>
        <div class="lbl">✗ 跳过（{rate*100:.0f}%）</div>
      </div>
      <div class="stat-card">
        <div class="val" style="color:#2ECC71">${savings:.4f}</div>
        <div class="lbl">💰 节省费用（USD）</div>
      </div>
      <div class="stat-card">
        <div class="val" style="color:#7F8C8D">{elapsed}s</div>
        <div class="lbl">⏱ 处理耗时</div>
      </div>
      {bd_html}
    </div>"""

    # ── 各 PDF 章节 ─────────────────────────────────────────────────────
    sections = []
    for i, (pdf_stem, records) in enumerate(groups.items(), 1):
        print(f"  [{i}/{len(groups)}] 渲染：{pdf_stem[-35:]}")
        sections.append(build_pdf_section(pdf_stem, records, PDF_DIR))

    # ── 拼 HTML ──────────────────────────────────────────────────────────
    legend_html = build_legend_html()

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stage 0 预处理效果 · PDF 去重与空白过滤</title>
<style>{CSS}</style>
</head>
<body>
<div class="header">
  <h1>Stage 0 · 预处理效果展示</h1>
  <div class="sub">PDF 去重 &amp; 空白过滤 · 绿框 = 保留（送 MathPix）· 彩色遮罩 = 跳过</div>
</div>
{summary_html}
{legend_html}
{''.join(sections)}
<div style="height:40px"></div>
</body>
</html>"""

    OUTPUT_HTML.write_text(html, encoding="utf-8")
    size_kb = OUTPUT_HTML.stat().st_size / 1024
    print(f"\n✅ 报告已生成：{OUTPUT_HTML}")
    print(f"   文件大小：{size_kb:.0f} KB")


if __name__ == "__main__":
    t0 = time.time()
    run()
    print(f"   总耗时：{time.time()-t0:.1f}s")
