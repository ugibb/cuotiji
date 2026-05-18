"""
Stage 1 · 文本提取 — PyMuPDF (fitz) 测试
优势：可同时提取嵌入图形（向量图 → SVG）
运行：python tests/stage1_extraction/test_pymupdf.py
"""
import json
import sys
import time
from pathlib import Path

import fitz  # PyMuPDF

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import TEXT_PDF_DIR, FIGURES_DIR
from evaluation.metrics import extraction_metrics

RESULTS_FILE = Path(__file__).parent.parent.parent / "results" / "stage1_pymupdf.json"
EXTRACTED_FIGS_DIR = Path(__file__).parent.parent.parent / "results" / "figures_pymupdf"


def extract_from_pdf(pdf_path: Path, extract_figures: bool = True) -> dict:
    doc = fitz.open(str(pdf_path))
    pages_text = []
    figures = []

    for page_num, page in enumerate(doc):
        pages_text.append(page.get_text())

        if extract_figures:
            img_list = page.get_images(full=True)
            for img_idx, img_info in enumerate(img_list):
                xref = img_info[0]
                base_image = doc.extract_image(xref)
                ext = base_image["ext"]
                img_bytes = base_image["image"]
                fig_name = f"{pdf_path.stem}_p{page_num+1}_img{img_idx+1}.{ext}"
                figures.append({
                    "name": fig_name,
                    "page": page_num + 1,
                    "size_bytes": len(img_bytes),
                    "ext": ext,
                })
                # 保存图形
                EXTRACTED_FIGS_DIR.mkdir(parents=True, exist_ok=True)
                (EXTRACTED_FIGS_DIR / fig_name).write_bytes(img_bytes)

    doc.close()
    return {
        "text": "\n".join(pages_text),
        "figures": figures,
        "page_count": len(pages_text),
    }


def run():
    pdf_files = list(TEXT_PDF_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"[WARN] 未找到 PDF 文件，请将样本放入：{TEXT_PDF_DIR}")
        return

    results = []
    for pdf_path in sorted(pdf_files):
        print(f"  处理: {pdf_path.name}")
        t0 = time.time()
        try:
            data = extract_from_pdf(pdf_path)
            elapsed = time.time() - t0
            result = {
                "file":        pdf_path.name,
                "page_count":  data["page_count"],
                "char_count":  len(data["text"]),
                "figure_count": len(data["figures"]),
                "elapsed_s":   round(elapsed, 2),
                "status":      "ok",
            }
            results.append(result)
            print(f"    字符数: {len(data['text']):,}  图形数: {len(data['figures'])}  耗时: {elapsed:.1f}s")
        except Exception as e:
            results.append({"file": pdf_path.name, "status": "error", "error": str(e)})
            print(f"    [ERROR] {e}")

    ok = [r for r in results if r.get("status") == "ok"]
    summary = {
        "tool": "pymupdf",
        "file_count": len(pdf_files),
        "success_count": len(ok),
        "total_figures_extracted": sum(r.get("figure_count", 0) for r in ok),
        "avg_elapsed_s": round(sum(r["elapsed_s"] for r in ok) / max(len(ok), 1), 2),
        "details": results,
    }

    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_FILE.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n结果已保存: {RESULTS_FILE}")
    print(f"成功: {summary['success_count']}/{summary['file_count']}  提取图形总数: {summary['total_figures_extracted']}")


if __name__ == "__main__":
    run()
