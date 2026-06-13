"""Step 2: 逐页 OCR + 图片区域检测，结果缓存到 output_dir/ + 02-ocr/latex_imgs/{lesson}/"""
import json
import re
import time
from pathlib import Path

from PIL import Image

from utils.config import OCR_PROVIDER, DIR_LATEX_IMGS, BBOX_CROP_PADDING
from utils.logger import setup_logger

logger = setup_logger(__name__)

# 第一批：页眉页脚、APP 推广、无效节标题
#
# _MD_STRIP_LINES      — 整行精确匹配（strip 后完全相等），命中则整行删除
_MD_STRIP_LINES: tuple[str, ...] = (
    "APP 扫码观看知识点典题精讲",
    "学习笔记",
)

# _MD_STRIP_PATTERNS   — 整行正则匹配（fullmatch），用于含动态数字的模板行
_MD_STRIP_PATTERNS: tuple[re.Pattern, ...] = (
    re.compile(r"第\s*\d+\s*讲\s+\S+.*"),          # "第 1 讲 分数裂项"
    re.compile(r"学而思秘籍\s+小学数学思维培养\s+\d+\s*级"),  # "学而思秘籍 小学数学思维培养 11 级"
)

#
# _MD_STRIP_SUBSTRINGS — 行内子串替换，只删除子串本身，保留行内其余内容
_MD_STRIP_SUBSTRINGS: tuple[str, ...] = (
    "拍照批改 秒判对错",
    "学习笔记",
    "APP 扫码观看知识点典题精讲",
    "APP 扫码看讲解",
    "按照导图一步一步",
    "按照号圈一步一步",
    "寻找解题思路。",
    "按照导图一步一步寻找解题思路。",
)


def _clean_markdown(text: str) -> str:
    """
    清洗 OCR markdown：
    1. 删除精确匹配 _MD_STRIP_LINES 的整行
    2. 删除正则匹配 _MD_STRIP_PATTERNS 的整行（含动态数字的模板行）
    3. 从每行中移除 _MD_STRIP_SUBSTRINGS 中的子串
    4. 合并连续空行为单个空行
    """
    lines = text.splitlines()

    result: list[str] = []
    prev_blank = False
    for ln in lines:
        stripped = ln.strip()
        if stripped in _MD_STRIP_LINES:
            continue
        if any(p.fullmatch(stripped) for p in _MD_STRIP_PATTERNS):
            continue
        for sub in _MD_STRIP_SUBSTRINGS:
            ln = ln.replace(sub, "")
        ln = ln.rstrip()
        blank = not ln.strip()
        if blank and prev_blank:
            continue
        result.append(ln)
        prev_blank = blank
    return "\n".join(result)


def _get_provider():
    if OCR_PROVIDER == "simpletex":
        from simpletex import ocr_page
    else:
        from qwen_vl import ocr_page
    return ocr_page


def _crop_and_save(page_path: str, bbox_norm: list[float], out_path: Path) -> bool:
    """从整页 PNG 按归一化坐标裁剪图片区域并保存，返回是否成功。"""
    try:
        img = Image.open(page_path)
        w, h = img.size
        x1, y1, x2, y2 = bbox_norm
        # 四边各扩 BBOX_CROP_PADDING，防止 VLM bbox 边缘略有收缩导致内容缺失
        p = BBOX_CROP_PADDING
        x1 = max(0.0, x1 - p)
        y1 = max(0.0, y1 - p)
        x2 = min(1.0, x2 + p)
        y2 = min(1.0, y2 + p)
        box = (int(x1 * w), int(y1 * h), int(x2 * w), int(y2 * h))
        if box[2] <= box[0] or box[3] <= box[1]:
            logger.warning("  bbox 无效（宽或高为零）: %s", bbox_norm)
            return False
        img.crop(box).save(str(out_path), format="PNG")
        return True
    except Exception as e:
        logger.warning("  裁剪失败 %s: %s", out_path.name, e)
        return False


def ocr_pages(pages: list[dict], output_dir: Path) -> tuple[list[dict], list[dict]]:
    """
    对 step1 返回的 pages 逐页 OCR，同时由 VLM 检测并裁剪图片区域。

    图片以 Mathpix 风格嵌入 markdown：![](imgs/img_pXX_N.png)
    图片文件保存到 02-ocr/latex_imgs/{lesson}/，OCR 缓存到 output_dir/。

    Args:
        pages:      step1 返回的 pages 列表
        output_dir: 02-ocr/L*/ 目录

    Returns:
        (ocr_results, extracted_images)
        ocr_results:      [{"page_num", "path", "markdown"}]
        extracted_images: [{"placeholder", "page_num", "img_idx", "path", "type"}]
    """
    lesson_tag = output_dir.name                                  # e.g. L11_lesson01
    ocr_dir  = output_dir
    imgs_dir = output_dir.parent / DIR_LATEX_IMGS / lesson_tag   # 02-ocr/latex_imgs/{lesson}/
    # 原始 OCR 备份目录：output/02-ocr/00-bak/<lesson>/
    bak_dir  = output_dir.parent / "00-bak" / lesson_tag
    ocr_dir.mkdir(parents=True, exist_ok=True)
    imgs_dir.mkdir(parents=True, exist_ok=True)
    bak_dir.mkdir(parents=True, exist_ok=True)

    logger.info("=" * 60)
    logger.info("开始 step2 : 共%d页",  len(pages))
    # logger.info("  provider=%s", OCR_PROVIDER)
    logger.info("  output_dir=%s", output_dir)
    logger.info("=" * 60)

    ocr_page = _get_provider()

    ocr_results: list[dict] = []
    all_extracted: list[dict] = []
    total_in = total_out = total_tok = 0

    for page in pages:
        pnum = page["page_num"]
        cache_md = ocr_dir / f"page_{pnum:02d}.md"
        cache_imgs = ocr_dir / f"page_{pnum:02d}_images.json"

        if cache_md.exists() and cache_md.stat().st_size > 0:
            markdown = cache_md.read_text(encoding="utf-8")
            extracted = (
                json.loads(cache_imgs.read_text(encoding="utf-8"))
                if cache_imgs.exists()
                else []
            )
            logger.info("page %02d  step2: OCR的md文件已存在，跳过 mdLen=%d  imgsCount=%d", pnum, len(markdown), len(extracted))
        else:
            _t0 = time.time()
            endpoint, markdown, detected, usage = ocr_page(page["path"])
            total_in  += usage.get("prompt_tokens",     0)
            total_out += usage.get("completion_tokens", 0)
            total_tok += usage.get("total_tokens",      0)

            extracted: list[dict] = []
            for det in detected:
                idx = det.get("idx", 0)
                placeholder = f"img_p{pnum:02d}_{idx}"
                img_path = imgs_dir / f"{placeholder}.png"

                if not img_path.exists():
                    ok = _crop_and_save(page["path"], det["bbox_norm"], img_path)
                    if not ok:
                        continue

                # output 根相对路径，逐页/合并两种预览模式均可直接加载
                rel = f"02-ocr/latex_imgs/{lesson_tag}/{placeholder}.png"
                markdown = markdown.replace(f"![](img_{idx})", f"![]({rel})")
                extracted.append({
                    "placeholder": placeholder,
                    "page_num": pnum,
                    "img_idx": idx,
                    "path": str(img_path),
                    "type": det.get("type", "figure"),
                })

            # 保存原始 OCR 结果供核对（output/02-ocr/00-bak/<lesson>/）
            raw_md = bak_dir / f"page_{pnum:02d}_raw.md"
            raw_md.write_text(markdown, encoding="utf-8")
            markdown = _clean_markdown(markdown)
            cache_md.write_text(markdown, encoding="utf-8")
            cache_imgs.write_text(json.dumps(extracted, ensure_ascii=False, indent=2), encoding="utf-8")
            logger.info(
                "OCR 完成：endpoint=%s | time=%04.1fs | tokens(in=%d out=%d total=%d) | imgsCount/mdLen==%d/%d",
                endpoint,
                time.time() - _t0,
                usage.get("prompt_tokens", 0),
                usage.get("completion_tokens", 0),
                usage.get("total_tokens", 0),
                len(extracted),
                len(markdown),
            )

        ocr_results.append({"page_num": pnum, "path": page["path"], "markdown": markdown})
        all_extracted.extend(extracted)

    logger.info(
        "step2 完成  OCR 识别总图片数=%d  tokens累计(in=%d out=%d total=%d)",
        len(all_extracted), total_in, total_out, total_tok,
    )
    return ocr_results, all_extracted

