"""
Stage 1 · 文本提取 — pdfplumber 测试
适用：可选中文本的 PDF（非扫描件）
运行：python tests/stage1_extraction/test_pdfplumber.py
"""
import json
import sys
import time
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import TEXT_PDF_DIR, GT_QUESTIONS
from evaluation.metrics import extraction_metrics

RESULTS_FILE = Path(__file__).parent.parent.parent / "results" / "stage1_pdfplumber.json"


def extract_text_from_pdf(pdf_path: Path) -> str:
    pages_text = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            pages_text.append(text)
    return "\n".join(pages_text)


def run():
    pdf_files = list(TEXT_PDF_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"[WARN] 未找到 PDF 文件，请将样本放入：{TEXT_PDF_DIR}")
        return

    # 加载 Ground Truth（如存在）
    gt_map: dict[str, str] = {}
    if GT_QUESTIONS.exists():
        gt_data = json.loads(GT_QUESTIONS.read_text(encoding="utf-8"))
        gt_map = {item["source_file"]: item["raw_text"] for item in gt_data if "raw_text" in item}

    results = []
    for pdf_path in sorted(pdf_files):
        print(f"  处理: {pdf_path.name}")
        t0 = time.time()
        try:
            text = extract_text_from_pdf(pdf_path)
            elapsed = time.time() - t0
            result = {
                "file": pdf_path.name,
                "char_count": len(text),
                "elapsed_s": round(elapsed, 2),
                "status": "ok",
            }
            # 若有对应 Ground Truth，计算准确率
            if pdf_path.name in gt_map:
                m = extraction_metrics(text, gt_map[pdf_path.name])
                result.update(m)
            results.append(result)
            print(f"    字符数: {len(text):,}  耗时: {elapsed:.1f}s")
        except Exception as e:
            results.append({"file": pdf_path.name, "status": "error", "error": str(e)})
            print(f"    [ERROR] {e}")

    # 汇总
    ok_results = [r for r in results if r.get("status") == "ok"]
    summary = {
        "tool": "pdfplumber",
        "file_count": len(pdf_files),
        "success_count": len(ok_results),
        "avg_elapsed_s": round(sum(r["elapsed_s"] for r in ok_results) / max(len(ok_results), 1), 2),
        "details": results,
    }
    if any("line_accuracy" in r for r in ok_results):
        accs = [r["line_accuracy"] for r in ok_results if "line_accuracy" in r]
        summary["avg_line_accuracy"] = round(sum(accs) / len(accs), 4)

    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_FILE.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n结果已保存: {RESULTS_FILE}")
    print(f"成功: {summary['success_count']}/{summary['file_count']}  平均耗时: {summary['avg_elapsed_s']}s")


if __name__ == "__main__":
    run()
