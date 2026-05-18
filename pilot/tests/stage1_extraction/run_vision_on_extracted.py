"""
S1 快速验证：对 PyMuPDF 已提取的 JPEG 直接跑 Claude Vision
避免重复做 PDF→图片的转换，速度更快。
运行：python tests/stage1_extraction/run_vision_on_extracted.py
"""
import base64
import json
import sys
import time
from pathlib import Path

import anthropic

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import ANTHROPIC_API_KEY, MODELS

FIGURES_DIR = Path(__file__).parent.parent.parent / "results" / "figures_pymupdf"
RESULTS_FILE = Path(__file__).parent.parent.parent / "results" / "stage1_vision_quick.json"
MODEL = MODELS["claude_haiku"]
MAX_PAGES = 3   # 只测前3页，控制成本

PROMPT = """你是小学奥数教材 OCR 助手。请将图片中所有文字和数学公式完整提取出来。
要求：
1. 数学公式用 LaTeX（行内 $...$，独立公式 $$...$$）
2. 保留题号、段落结构
3. 只输出提取内容，不加说明"""


def run():
    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.startswith("请填"):
        print("[ERROR] 请先在 pilot/.env 中填入 ANTHROPIC_API_KEY")
        return

    # 取按页码排序的前 MAX_PAGES 张图片
    all_imgs = sorted(FIGURES_DIR.glob("*.jpeg")) + sorted(FIGURES_DIR.glob("*.png"))
    test_imgs = all_imgs[:MAX_PAGES]
    if not test_imgs:
        print(f"[WARN] 未找到图片，请先运行 test_pymupdf.py")
        return

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    results = []
    total_input_tok = total_output_tok = 0

    for img_path in test_imgs:
        print(f"  处理: {img_path.name}")
        img_b64 = base64.standard_b64encode(img_path.read_bytes()).decode()
        media_type = "image/jpeg" if img_path.suffix == ".jpeg" else "image/png"
        t0 = time.time()
        try:
            msg = client.messages.create(
                model=MODEL,
                max_tokens=2048,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": img_b64}},
                        {"type": "text", "text": PROMPT},
                    ],
                }],
            )
            text = msg.content[0].text
            in_tok  = msg.usage.input_tokens
            out_tok = msg.usage.output_tokens
            total_input_tok  += in_tok
            total_output_tok += out_tok
            elapsed = time.time() - t0

            formula_count = text.count("$") // 2
            cost = (in_tok / 1e6 * 0.80) + (out_tok / 1e6 * 4.0)

            results.append({
                "image": img_path.name,
                "char_count": len(text),
                "formula_count": formula_count,
                "input_tokens": in_tok,
                "output_tokens": out_tok,
                "cost_usd": round(cost, 5),
                "elapsed_s": round(elapsed, 2),
                "text_preview": text[:400],
            })
            print(f"    字符: {len(text)}  公式: {formula_count}  tokens: {in_tok}+{out_tok}  成本: ${cost:.5f}  耗时: {elapsed:.1f}s")
            print(f"    预览: {text[:120].replace(chr(10), ' ')}")
            time.sleep(0.3)
        except Exception as e:
            results.append({"image": img_path.name, "error": str(e)})
            print(f"    [ERROR] {e}")

    total_cost = (total_input_tok / 1e6 * 0.80) + (total_output_tok / 1e6 * 4.0)
    avg_cost_per_page = total_cost / max(len(results), 1)
    # 推算：32页/讲义 × 全量约4000讲义（估算）
    estimated_full = round(avg_cost_per_page * 32 * 4000, 0)

    summary = {
        "model": MODEL,
        "pages_tested": len(test_imgs),
        "total_cost_usd": round(total_cost, 5),
        "avg_cost_per_page_usd": round(avg_cost_per_page, 5),
        "estimated_full_pipeline_usd": estimated_full,
        "details": results,
    }

    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_FILE.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n{'='*50}")
    print(f"测试完成：{len(test_imgs)} 页")
    print(f"本次成本：${total_cost:.5f}")
    print(f"每页均价：${avg_cost_per_page:.5f}")
    print(f"推算全量：~${estimated_full}")
    print(f"结果已保存：{RESULTS_FILE}")


if __name__ == "__main__":
    run()
