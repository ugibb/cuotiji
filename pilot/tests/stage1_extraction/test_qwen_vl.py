"""
Stage 1 · Qwen-VL-Max Vision OCR 测试
使用 DashScope OpenAI 兼容接口
运行：python tests/stage1_extraction/test_qwen_vl.py
"""
import base64
import json
import sys
import time
from pathlib import Path

from openai import OpenAI

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import DASHSCOPE_API_KEY

FIGURES_DIR  = Path(__file__).parent.parent.parent / "results" / "figures_pymupdf"
RESULTS_FILE = Path(__file__).parent.parent.parent / "results" / "stage1_qwen_vl.json"
MODEL        = "qwen-vl-max"
MAX_PAGES    = 3

PROMPT = """你是小学奥数教材 OCR 助手。请将图片中所有文字和数学公式完整提取出来。
要求：
1. 数学公式用 LaTeX（行内 $...$，独立公式 $$...$$）
2. 保留题号、段落结构
3. 只输出提取内容，不加说明"""

# 价格（元/千 tokens，2024 定价）
PRICE_IN  = 0.012   # ¥/1K input tokens
PRICE_OUT = 0.12    # ¥/1K output tokens
CNY_TO_USD = 0.138


def run():
    if not DASHSCOPE_API_KEY:
        print("[SKIP] 未配置 DASHSCOPE_API_KEY")
        return

    all_imgs = sorted(FIGURES_DIR.glob("*.jpeg")) + sorted(FIGURES_DIR.glob("*.png"))
    test_imgs = all_imgs[:MAX_PAGES]
    if not test_imgs:
        print(f"[WARN] 未找到图片，请先运行 test_pymupdf.py")
        return

    client = OpenAI(
        api_key=DASHSCOPE_API_KEY,
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    )

    results = []
    total_in = total_out = 0

    for img_path in test_imgs:
        print(f"  处理: {img_path.name}")
        img_b64  = base64.standard_b64encode(img_path.read_bytes()).decode()
        media    = "image/jpeg" if img_path.suffix == ".jpeg" else "image/png"
        t0 = time.time()
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image_url",
                         "image_url": {"url": f"data:{media};base64,{img_b64}"}},
                        {"type": "text", "text": PROMPT},
                    ],
                }],
            )
            text    = resp.choices[0].message.content
            in_tok  = resp.usage.prompt_tokens
            out_tok = resp.usage.completion_tokens
            total_in  += in_tok
            total_out += out_tok
            elapsed = time.time() - t0

            cost_cny = (in_tok / 1000 * PRICE_IN) + (out_tok / 1000 * PRICE_OUT)
            cost_usd = cost_cny * CNY_TO_USD
            formula_count = text.count("$") // 2

            results.append({
                "image": img_path.name,
                "char_count": len(text),
                "formula_count": formula_count,
                "input_tokens": in_tok,
                "output_tokens": out_tok,
                "cost_cny": round(cost_cny, 5),
                "cost_usd": round(cost_usd, 5),
                "elapsed_s": round(elapsed, 2),
                "text_preview": text[:400],
            })
            print(f"    字符: {len(text)}  公式: {formula_count}  tokens: {in_tok}+{out_tok}"
                  f"  成本: ¥{cost_cny:.4f}(${cost_usd:.5f})  耗时: {elapsed:.1f}s")
            print(f"    预览: {text[:120].replace(chr(10), ' ')}")
            time.sleep(0.5)
        except Exception as e:
            results.append({"image": img_path.name, "error": str(e)})
            print(f"    [ERROR] {e}")

    total_cost_cny = (total_in / 1000 * PRICE_IN) + (total_out / 1000 * PRICE_OUT)
    total_cost_usd = total_cost_cny * CNY_TO_USD
    avg_usd = total_cost_usd / max(len(results), 1)
    estimated_full = round(avg_usd * 32 * 4000, 0)

    summary = {
        "model": MODEL,
        "pages_tested": len(test_imgs),
        "total_cost_cny": round(total_cost_cny, 5),
        "total_cost_usd": round(total_cost_usd, 5),
        "avg_cost_per_page_usd": round(avg_usd, 5),
        "estimated_full_pipeline_usd": estimated_full,
        "details": results,
    }

    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_FILE.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n{'='*50}")
    print(f"测试完成：{len(test_imgs)} 页  模型：{MODEL}")
    print(f"本次成本：¥{total_cost_cny:.4f} / ${total_cost_usd:.5f}")
    print(f"推算全量：~${estimated_full}")
    print(f"结果已保存：{RESULTS_FILE}")


if __name__ == "__main__":
    run()
