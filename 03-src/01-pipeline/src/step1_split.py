"""Step 1: PDF 拆页

pages → output_dir/page_XX.png（直接写入，无子目录）
"""
import fitz
from pathlib import Path
from utils.config import PAGE_DPI, MATERIAL_SET
from utils.logger import setup_logger
from utils.book_profiles import get_profile

logger = setup_logger(__name__)


def split_pdf(pdf_path: str, output_dir: Path) -> dict:
    """
    拆分 PDF 为页面 PNG，自动应用当前教材的 BookProfile。

    Returns:
        {"pages": [{"page_num": 1, "path": "...page_01.png"}]}
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    profile = get_profile(MATERIAL_SET)
    scale = PAGE_DPI / 72
    mat = fitz.Matrix(scale, scale)

    pages = []
    doc = fitz.open(pdf_path)
    total = len(doc)
    # 1-based 有效页范围：丢弃头部和尾部
    first_valid = profile.skip_head + 1
    last_valid = total - profile.skip_tail
    logger.info(
        "step1: 拆页 共 %d 页  有效范围 [%d, %d]  output_dir=%s",
        total, first_valid, last_valid, output_dir,
    )
    try:
        for page in doc:
            pnum = page.number + 1
            if pnum < first_valid or pnum > last_valid:
                continue
            page_path = output_dir / f"page_{pnum:02d}.png"
            if not page_path.exists():
                pix = page.get_pixmap(matrix=mat)
                pix.save(str(page_path))
            pages.append({"page_num": pnum, "path": str(page_path)})
    finally:
        doc.close()

    # logger.info("step1: 完成  pages=%d（丢弃头%d尾%d）", len(pages), profile.skip_head, profile.skip_tail)
    return {"pages": pages}
