"""
Stage 1 · 文本提取 — Claude Haiku Vision 测试
适用：扫描版 PDF（逐页转图片后调用 Vision）
运行：python tests/stage1_extraction/test_claude_vision.py
"""
import base64
import json
import sys
import time
from pathlib import Path

import anthropic
import fitz  # PyMuPDF 用于 PDF → PNG

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import SCANNED_PDF_DIR, ANTHROPIC_API_KEY, MODELS

RESULTS_FILE = Path(__file__).parent.parent.parent / "results" / "stage1_claude_vision.json"
MODEL = MODELS["claude_haiku"]
MAX_PAGES_PER_FILE = 5      # 控制成本：每文件最多处理5页

PROMPT = """你是数学教材 OCR 助手。请将图片中的所有文字和数学公式完整提取出来。
要求：
1. 数学公式用 LaTeX 格式输出（行内用 $...$ 包裹，独立公式用 $$...$$ 包裹）
2. 保留原始排版结构（题号、段落换行）
3. 如有表格，用 Markdown 表格格式输出
4. 只输出提取的文本内容，不要添加任何说明"""


def pdf_page_to_base64(pdf_path: Path, page_num: int, dpi: int = 150) -> str:
    doc = fitz.open(str(pdf_path))
    page = doc[page_num]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    img_bytes = pix.tobytes("png")
    doc.close()
    return base64.standard_b64encode(img_bytes).decode()


def extract_page_with_claude(client: anthropic.Anthropic, img_b64: str) -> tuple[str, int, int]:
    msg = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img_b64}},
                {"type": "text", "text": PROMPT},
            ],
        }],
    )
    text = msg.content[0].text
    return text, msg.usage.input_tokens, msg.usage.output_tokens


def run():
    if not ANTHROPIC_API_KEY:
        print("[SKIP] 未配置 ANTHROPIC_API_KEY")
        return

    pdf_files = list(SCANNED_PDF_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"[WARN] 未找到扫描 PDF，请将样本放入：{SCANNED_PDF_DIR}")
        return

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    results = []

    for pdf_path in sorted(pdf_files[:3]):      # 控制成本：最多3个文件
        print(f"  处理: {pdf_path.name}")
        doc = fitz.open(str(pdf_path))
        total_pages = min(len(doc), MAX_PAGES_PER_FILE)
        doc.close()

        pages_text = []
        total_input_tokens = 0
        total_output_tokens = 0
        t0 = time.time()

        for page_num in range(total_pages):
            try:
                img_b64 = pdf_page_to_base64(pdf_path, page_num)
                text, in_tok, out_tok = extract_page_with_claude(client, img_b64)
                pages_text.append(text)
                total_input_tokens += in_tok
                total_output_tokens += out_tok
                print(f"    P{page_num+1}: {len(text)}字  tokens: {in_tok}in/{out_tok}out")
                time.sleep(0.5)     # 避免触发限流
            except Exception as e:
                pages_text.append(f"[ERROR page {page_num+1}: {e}]")
                print(f"    P{page_num+1} [ERROR]: {e}")

        elapsed = time.time() - t0
        full_text = "\n\n".join(pages_text)
        formula_count = full_text.count("$") // 2

        # 成本计算（Haiku 价格：$0.80/M input, $4/M output）
        cost_usd = (total_input_tokens / 1_000_000 * 0.80) + (total_output_tokens / 1_000_000 * 4.0)

        results.append({
            "file": pdf_path.name,
            "pages_processed": total_pages,
            "char_count": len(full_text),
            "formula_count": formula_count,
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens,
            "cost_usd": round(cost_usd, 4),
            "elapsed_s": round(elapsed, 2),
            "status": "ok",
            "preview": full_text[:300],
        })
        print(f"    完成: {len(full_text):,}字  公式: {formula_count}  成本: ${cost_usd:.4f}  耗时: {elapsed:.0f}s")

    ok = [r for r in results if r.get("status") == "ok"]
    total_cost = sum(r.get("cost_usd", 0) for r in ok)

    # 推算全量成本（基于样本平均）
    if ok:
        avg_cost_per_page = total_cost / sum(r["pages_processed"] for r in ok)
        # 假设全量约 5000 页扫描件
        estimated_total = round(avg_cost_per_page * 5000, 2)
    else:
        estimated_total = 0

    summary = {
        "tool": "claude_haiku_vision",
        "model": MODEL,
        "file_count": len(pdf_files),
        "tested_count": len(pdf_files[:3]),
        "success_count": len(ok),
        "total_cost_usd": round(total_cost, 4),
        "estimated_full_cost_usd": estimated_total,
        "details": results,
    }

    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_FILE.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n结果已保存: {RESULTS_FILE}")
    print(f"样本成本: ${total_cost:.4f}  推算全量成本: ~${estimated_total}")


if __name__ == "__main__":
    run()
