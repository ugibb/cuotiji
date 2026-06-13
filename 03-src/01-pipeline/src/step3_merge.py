"""Step 3: 将 step2 逐页 OCR Markdown 拼接为全讲单一文档，写入 output/03-merge/<tag>_merged.md"""
from pathlib import Path

from utils.logger import setup_logger

logger = setup_logger(__name__)


def merge_pages(ocr_pages: list[dict], out_path: Path) -> Path:
    """
    将所有页面的 OCR Markdown 按页码顺序拼接，写入 out_path。

    Args:
        ocr_pages: step2 返回的 [{"page_num", "path", "markdown"}]
        out_path:  目标文件路径，如 output/03-merge/L11_lesson01_merged.md

    Returns:
        out_path
    """
    # if out_path.exists():
    #     logger.debug("step3: 合并md文件已存在，跳过 mdLen=%d  pages=%d → %s", len(pages_text), len(ocr_pages), out_path)
    #     return out_path

    out_path.parent.mkdir(parents=True, exist_ok=True)
    pages_text = "\n\n---\n\n".join(
        f"[第{p['page_num']}页]\n{p['markdown']}" for p in ocr_pages
    )
    out_path.write_text(pages_text, encoding="utf-8")
    logger.info(
        "step3: 拼接完成  pages=%d  chars=%d  → %s",
        len(ocr_pages), len(pages_text), out_path,
    )
    return out_path
