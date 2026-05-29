"""
Stage 1 · 硅基流动 (SiliconFlow) 开源视觉模型 OCR 测试
支持模型：DeepSeek-VL2 / InternVL2-8B / Qwen2-VL-7B
运行：python tests/stage1_extraction/test_siliconflow_vision.py [--model MODEL] [--image IMAGE]

例：
  python tests/stage1_extraction/test_siliconflow_vision.py
  python tests/stage1_extraction/test_siliconflow_vision.py --model Qwen/Qwen2-VL-7B-Instruct
  python tests/stage1_extraction/test_siliconflow_vision.py --image figures_pymupdf/page_001.jpeg
"""
import argparse
import base64
import json
import sys
import time
from pathlib import Path

from openai import OpenAI

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import SILICONFLOW_API_KEY, SILICONFLOW_BASE_URL

FIGURES_DIR  = Path(__file__).parent.parent.parent / "results" / "figures_pymupdf"
RESULTS_DIR  = Path(__file__).parent.parent.parent / "results"

# 硅基流动上可用的视觉模型（2026-05 实测可用，¥/百万 tokens）
MODELS = {
    "deepseek-ocr":    {
        "id":        "deepseek-ai/DeepSeek-OCR",
        "price_in":  1.0,   # 实际价格以官网为准
        "price_out": 2.0,
    },
    "paddle-ocr":      {
        "id":        "PaddlePaddle/PaddleOCR-VL-1.5",
        "price_in":  0.5,
        "price_out": 0.5,
    },
    "qwen3-vl-8b":     {
        "id":        "Qwen/Qwen3-VL-8B-Instruct",
        "price_in":  0.5,
        "price_out": 0.5,
    },
    "qwen3-vl-32b":    {
        "id":        "Qwen/Qwen3-VL-32B-Instruct",
        "price_in":  1.5,
        "price_out": 1.5,
    },
}

CNY_TO_USD = 0.138

PROMPT = """你是小学奥数教材 OCR 助手。请将图片中所有文字和数学公式完整提取出来。
要求：
1. 数学公式用 LaTeX（行内 $...$，独立公式 $$...$$）
2. 保留题号、段落结构
3. 只输出提取内容，不加说明"""


def _encode_image(img_path: Path) -> tuple[str, str]:
    img_b64 = base64.standard_b64encode(img_path.read_bytes()).decode()
    media   = "image/jpeg" if img_path.suffix in (".jpeg", ".jpg") else "image/png"
    return img_b64, media


def test_model(client: OpenAI, model_key: str, test_imgs: list[Path]) -> dict:
    meta   = MODELS[model_key]
    model_id = meta["id"]
    price_in  = meta["price_in"]
    price_out = meta["price_out"]

    results   = []
    total_in = total_out = 0

    for img_path in test_imgs:
        print(f"  [{model_key}] 处理: {img_path.name}")
        img_b64, media = _encode_image(img_path)
        t0 = time.time()
        try:
            resp = client.chat.completions.create(
                model=model_id,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image_url",
                         "image_url": {"url": f"data:{media};base64,{img_b64}"}},
                        {"type": "text", "text": PROMPT},
                    ],
                }],
                max_tokens=2048,
            )
            text    = resp.choices[0].message.content or ""
            in_tok  = resp.usage.prompt_tokens     if resp.usage else 0
            out_tok = resp.usage.completion_tokens if resp.usage else 0
            total_in  += in_tok
            total_out += out_tok
            elapsed   = time.time() - t0

            cost_cny = (in_tok / 1_000_000 * price_in) + (out_tok / 1_000_000 * price_out)
            cost_usd = cost_cny * CNY_TO_USD
            formula_count = text.count("$") // 2

            results.append({
                "image":          img_path.name,
                "char_count":     len(text),
                "formula_count":  formula_count,
                "input_tokens":   in_tok,
                "output_tokens":  out_tok,
                "cost_cny":       round(cost_cny, 6),
                "cost_usd":       round(cost_usd, 6),
                "elapsed_s":      round(elapsed, 2),
                "text_preview":   text[:400],
            })
            print(f"    字符: {len(text)}  公式: {formula_count}  tokens: {in_tok}+{out_tok}"
                  f"  成本: ¥{cost_cny:.5f}(${cost_usd:.5f})  耗时: {elapsed:.1f}s")
            print(f"    预览: {text[:120].replace(chr(10), ' ')}")
            time.sleep(0.3)
        except Exception as e:
            results.append({"image": img_path.name, "error": str(e)})
            print(f"    [ERROR] {e}")

    total_cny = (total_in / 1_000_000 * price_in) + (total_out / 1_000_000 * price_out)
    total_usd = total_cny * CNY_TO_USD
    avg_usd   = total_usd / max(len(results), 1)
    return {
        "model":                     model_id,
        "model_key":                 model_key,
        "pages_tested":              len(test_imgs),
        "total_cost_cny":            round(total_cny, 6),
        "total_cost_usd":            round(total_usd, 6),
        "avg_cost_per_page_usd":     round(avg_usd, 6),
        "estimated_full_pipeline_usd": round(avg_usd * 32 * 4000, 0),
        "details":                   results,
    }


def run(model_keys: list[str], test_imgs: list[Path]) -> None:
    if not SILICONFLOW_API_KEY:
        print("[SKIP] 未配置 SILICONFLOW_API_KEY，请在 .env 中填写")
        return

    client = OpenAI(api_key=SILICONFLOW_API_KEY, base_url=SILICONFLOW_BASE_URL)

    all_summaries = {}
    for key in model_keys:
        if key not in MODELS:
            print(f"[WARN] 未知模型 key: {key}，跳过")
            continue
        print(f"\n{'='*50}")
        print(f"模型: {MODELS[key]['id']}")
        summary = test_model(client, key, test_imgs)
        all_summaries[key] = summary

        result_file = RESULTS_DIR / f"stage1_siliconflow_{key.replace('-', '_')}.json"
        result_file.parent.mkdir(parents=True, exist_ok=True)
        result_file.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"结果已保存: {result_file}")

    # 横向对比汇总
    if len(all_summaries) > 1:
        compare_file = RESULTS_DIR / "stage1_siliconflow_compare.json"
        compare_file.write_text(
            json.dumps(all_summaries, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"\n横向对比已保存: {compare_file}")
        print(f"\n{'='*50}")
        print(f"{'模型':<25} {'平均成本/页(USD)':<20} {'推算全量($)'}")
        for key, s in all_summaries.items():
            print(f"  {key:<23} ${s['avg_cost_per_page_usd']:<18.6f} ~${s['estimated_full_pipeline_usd']}")


def _parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model", default="all",
        help="模型 key：deepseek-vl2 / internvl2-8b / qwen2-vl-7b / all（默认）"
    )
    parser.add_argument(
        "--image", default=None,
        help="指定单张图片路径（相对 results/figures_pymupdf/ 或绝对路径），不填则取前3张"
    )
    parser.add_argument("--max-pages", type=int, default=3)
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()

    if args.image:
        img_path = Path(args.image)
        if not img_path.is_absolute():
            img_path = FIGURES_DIR / args.image
        if not img_path.exists():
            print(f"[ERROR] 图片不存在: {img_path}")
            sys.exit(1)
        test_imgs = [img_path]
    else:
        all_imgs  = sorted(FIGURES_DIR.glob("*.jpeg")) + sorted(FIGURES_DIR.glob("*.png"))
        test_imgs = all_imgs[: args.max_pages]
        if not test_imgs:
            print("[WARN] 未找到图片，请先运行 test_pymupdf.py")
            sys.exit(1)

    if args.model == "all":
        model_keys = list(MODELS.keys())
    else:
        model_keys = [args.model]

    run(model_keys, test_imgs)
