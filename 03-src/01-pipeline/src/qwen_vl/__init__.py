"""Qwen-VL-Max OCR provider — 整页文档识别（中文+LaTeX混排）+ 图片区域检测"""
import base64
import io
import json
import time

from utils.config import (
    DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL, QWEN_MODEL,
    QWEN_MAX_IMAGE_BYTES, QWEN_TIMEOUT, QWEN_JPEG_QUALITY_INIT,
)
from utils.logger import setup_logger

logger = setup_logger(__name__)


_PROMPT = (
    "请识别这张教材图片，以 JSON 格式输出：\n"
    '{"markdown":"...","images":[{"idx":0,"bbox_norm":[0.1,0.2,0.5,0.4],"type":"figure"}]}\n'
    "(images 仅包含题目附图/图表，思维导图和二维码不裁剪、不列出)\n\n"
    "规则：\n"
    "1. markdown：识别所有文字，数学公式用 LaTeX（行内 $...$，独立行 $$...$$），\n"
    "   保持从上到下阅读顺序；遇到题目附图/图表时，\n"
    "   在对应位置嵌入占位符 ![](img_N)，N 从 0 递增；\n"
    "   思维导图、二维码直接忽略，不嵌入占位符、不计入 images\n"
    "2. images：列出所有 ![](img_N) 对应区域（仅题目附图/图表，不含思维导图和二维码）\n"
    "   - idx 与占位符中的 N 一致\n"
    "   - bbox_norm：归一化坐标 [x1,y1,x2,y2]，值域 0~1，原点在图片左上角\n"
    '   - type："figure"\n'
    "3. 无非文字图片时 images 为 []\n"
    "4. 页码（单独出现的数字，如页脚/页眉处的 1、2、3…）直接忽略，不输出到 markdown\n"
    "5. 只输出 JSON，不要 markdown 代码块或其他说明"
)

_MAX_BYTES = QWEN_MAX_IMAGE_BYTES


def _load_image_bytes(image_path: str) -> tuple[bytes, str]:
    """返回 (压缩后字节, mime_type)。超过 5MB 时自动缩小并转 JPEG。"""
    import os
    from PIL import Image

    raw_size = os.path.getsize(image_path)
    if raw_size <= _MAX_BYTES:
        ext = image_path.rsplit(".", 1)[-1].lower()
        mime = "image/png" if ext == "png" else "image/jpeg"
        with open(image_path, "rb") as f:
            return f.read(), mime

    img = Image.open(image_path).convert("RGB")
    quality = QWEN_JPEG_QUALITY_INIT
    scale = 1.0
    while True:
        w = int(img.width * scale)
        h = int(img.height * scale)
        resized = img.resize((w, h), Image.LANCZOS) if scale < 1.0 else img
        buf = io.BytesIO()
        resized.save(buf, format="JPEG", quality=quality)
        data = buf.getvalue()
        if len(data) <= _MAX_BYTES or (quality <= 60 and scale <= 0.5):
            return data, "image/jpeg"
        if quality > 65:
            quality -= 10
        else:
            scale *= 0.75


def _image_to_base64(image_path: str) -> tuple[str, str]:
    """返回 (base64_string, mime_type)。"""
    data, mime = _load_image_bytes(image_path)
    return base64.b64encode(data).decode("ascii"), mime


def _parse_response(raw: str) -> tuple[str, list[dict]]:
    """
    解析 VLM 返回的 JSON。
    失败时退化为纯文本 OCR（无图片检测），保证 pipeline 不中断。
    """
    text = raw.strip()
    # 去掉可能的 ```json ... ``` 包裹
    if text.startswith("```"):
        lines = text.split("\n")
        end = -1 if lines[-1].strip() == "```" else len(lines)
        text = "\n".join(lines[1:end])
    try:
        obj = json.loads(text)
        markdown = obj.get("markdown", "")
        images = obj.get("images", [])
        if not isinstance(images, list):
            images = []
        return markdown, images
    except (json.JSONDecodeError, ValueError):
        logger.warning("Qwen VL 未返回有效 JSON，退化为纯文本 OCR（无图片区域）")
        return raw.strip(), []


def ocr_page(image_path: str) -> tuple[str, str, list[dict], dict]:
    """
    调用 Qwen-VL-Max 对整页图片 OCR，同时检测图片区域。

    返回:
        (endpoint, markdown_text, detected_images, token_usage)
        token_usage: {"prompt_tokens": int, "completion_tokens": int, "total_tokens": int}
    """
    if not DASHSCOPE_API_KEY:
        logger.error("  DASHSCOPE_API_KEY 未配置，跳过 Qwen OCR")
        return "qwen/error", "", [], {}

    try:
        from openai import OpenAI
    except ImportError:
        logger.error("  缺少 openai 包，请 pip install openai")
        return "qwen/error", "", [], {}

    client = OpenAI(api_key=DASHSCOPE_API_KEY, base_url=DASHSCOPE_BASE_URL)

    b64, mime = _image_to_base64(image_path)

    t0 = time.time()
    try:
        resp = client.chat.completions.create(
            model=QWEN_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    {"type": "text", "text": _PROMPT},
                ],
            }],
            timeout=QWEN_TIMEOUT,
        )
        elapsed = time.time() - t0
        raw = resp.choices[0].message.content or ""
        markdown, detected = _parse_response(raw)

        usage = resp.usage
        token_usage = {
            "prompt_tokens":     getattr(usage, "prompt_tokens",     0) if usage else 0,
            "completion_tokens": getattr(usage, "completion_tokens", 0) if usage else 0,
            "total_tokens":      getattr(usage, "total_tokens",      0) if usage else 0,
        }
        return f"qwen/{QWEN_MODEL}", markdown, detected, token_usage

    except Exception as e:
        elapsed = time.time() - t0
        logger.warning("  Qwen OCR 失败 (%.1fs): %s", elapsed, e)
        return "qwen/error", "", [], {}
