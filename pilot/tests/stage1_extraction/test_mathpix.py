"""
Stage 1 · 文本提取 — MathPix API 测试
适用：扫描版 PDF（含数学公式）
前置：需在 .env 配置 MATHPIX_APP_ID / MATHPIX_APP_KEY
运行：python tests/stage1_extraction/test_mathpix.py
"""
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import SCANNED_PDF_DIR, MATHPIX_APP_ID, MATHPIX_APP_KEY

RESULTS_FILE = Path(__file__).parent.parent.parent / "results" / "stage1_mathpix.json"
MATHPIX_PDF_URL = "https://api.mathpix.com/v3/pdf"
MATHPIX_PDF_STATUS_URL = "https://api.mathpix.com/v3/pdf/{pdf_id}"
MATHPIX_PDF_RESULT_URL = "https://api.mathpix.com/v3/pdf/{pdf_id}.mmd"  # Mathpix Markdown


def submit_pdf(pdf_path: Path) -> str | None:
    headers = {
        "app_id": MATHPIX_APP_ID,
        "app_key": MATHPIX_APP_KEY,
    }
    options = {
        "conversion_formats": {"mmd": True},
        "math_inline_delimiters": ["$", "$"],
        "math_display_delimiters": ["$$", "$$"],
        "enable_spell_check": False,
    }
    with open(pdf_path, "rb") as f:
        resp = requests.post(
            MATHPIX_PDF_URL,
            headers=headers,
            files={"file": (pdf_path.name, f, "application/pdf")},
            data={"options_json": json.dumps(options)},
            timeout=60,
        )
    if resp.status_code != 200:
        print(f"    [ERROR] 提交失败: {resp.status_code} {resp.text[:200]}")
        return None
    return resp.json().get("pdf_id")


def poll_until_done(pdf_id: str, timeout_s: int = 300) -> bool:
    url = MATHPIX_PDF_STATUS_URL.format(pdf_id=pdf_id)
    headers = {"app_id": MATHPIX_APP_ID, "app_key": MATHPIX_APP_KEY}
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        resp = requests.get(url, headers=headers, timeout=10)
        data = resp.json()
        status = data.get("status", "")
        if status == "completed":
            return True
        if status == "error":
            print(f"    [ERROR] MathPix 处理失败: {data.get('error')}")
            return False
        print(f"    状态: {status}，等待...")
        time.sleep(5)
    return False


def fetch_result(pdf_id: str) -> str:
    url = MATHPIX_PDF_RESULT_URL.format(pdf_id=pdf_id)
    headers = {"app_id": MATHPIX_APP_ID, "app_key": MATHPIX_APP_KEY}
    resp = requests.get(url, headers=headers, timeout=30)
    return resp.text


def run():
    if not MATHPIX_APP_ID or not MATHPIX_APP_KEY:
        print("[SKIP] 未配置 MATHPIX_APP_ID / MATHPIX_APP_KEY，跳过测试。")
        return

    pdf_files = list(SCANNED_PDF_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"[WARN] 未找到扫描 PDF，请将样本放入：{SCANNED_PDF_DIR}")
        return

    results = []
    for pdf_path in sorted(pdf_files[:5]):      # 控制成本：最多测试5个文件
        print(f"  提交: {pdf_path.name}")
        t0 = time.time()
        try:
            pdf_id = submit_pdf(pdf_path)
            if not pdf_id:
                results.append({"file": pdf_path.name, "status": "submit_failed"})
                continue
            print(f"    pdf_id={pdf_id}，轮询中...")
            if not poll_until_done(pdf_id):
                results.append({"file": pdf_path.name, "status": "processing_failed", "pdf_id": pdf_id})
                continue
            text = fetch_result(pdf_id)
            elapsed = time.time() - t0
            # 统计 LaTeX 公式数量（简单启发式）
            formula_count = text.count("$") // 2
            results.append({
                "file": pdf_path.name,
                "pdf_id": pdf_id,
                "char_count": len(text),
                "formula_count": formula_count,
                "elapsed_s": round(elapsed, 2),
                "status": "ok",
                "preview": text[:300],
            })
            print(f"    字符数: {len(text):,}  公式数: {formula_count}  耗时: {elapsed:.0f}s")
        except Exception as e:
            results.append({"file": pdf_path.name, "status": "error", "error": str(e)})
            print(f"    [ERROR] {e}")

    ok = [r for r in results if r.get("status") == "ok"]
    summary = {
        "tool": "mathpix",
        "file_count": len(pdf_files),
        "tested_count": len(pdf_files[:5]),
        "success_count": len(ok),
        "avg_formula_count": round(sum(r.get("formula_count", 0) for r in ok) / max(len(ok), 1)),
        "avg_elapsed_s": round(sum(r.get("elapsed_s", 0) for r in ok) / max(len(ok), 1), 2),
        "estimated_cost_usd": round(len(pdf_files) * 0.004 * 10, 2),  # 假设平均10页/文件
        "details": results,
    }

    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_FILE.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n结果已保存: {RESULTS_FILE}")
    print(f"预估全量成本: ${summary['estimated_cost_usd']}")


if __name__ == "__main__":
    run()
