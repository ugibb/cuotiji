"""Step 4: DeepSeek-V3 将全讲 OCR 文本解析为结构化 JSON"""
import json
from pathlib import Path

from deepseek import build_lesson_parse_prompt, chat_json
from utils.config import PARSE_TEMPERATURE
from utils.logger import setup_logger

logger = setup_logger(__name__)

_SYSTEM_PROMPT = build_lesson_parse_prompt()


def parse_lesson(ocr_pages: list[dict], images: list[dict], output_path: Path) -> dict:
    """
    将全讲所有页的 OCR Markdown 合并，交给 DeepSeek-V3 解析。
    结果缓存到 output_path（完整文件路径，如 04-json/L07_lesson10_lesson.json）。
    """
    cache_path = output_path
    if cache_path.exists():
        logger.info("step4: lesson.json已存在，跳过 %s", cache_path)
        return json.loads(cache_path.read_text(encoding="utf-8"))

    image_index = "\n".join(
        f"  {img['placeholder']}: 第{img['page_num']}页第{img['img_idx']+1}张图"
        for img in images
    )
    pages_text = "\n\n---\n\n".join(
        f"[第{p['page_num']}页]\n{p['markdown']}" for p in ocr_pages
    )
    user_content = f"图片占位符列表：\n{image_index}\n\n各页内容：\n\n{pages_text}"

    content, usage = chat_json(_SYSTEM_PROMPT, user_content, temperature=PARSE_TEMPERATURE)
    lesson = json.loads(content)

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(lesson, ensure_ascii=False, indent=2), encoding="utf-8")
    # %：格式化占位符开始
    # 04：最小宽度 4，不足时用 0 在左边补齐
    # .1：保留 1 位小数
    # f：按浮点数输出
    logger.info(
        "step4: 拼接md-->LLM结构化成JSON完成 (%d 页) ：deepseek/%s  | time=%04.1fs  | tokens(in=%d out=%d total=%d)  | methods/exercises=%d/%d",
        len(ocr_pages),
        usage["model"],
        usage["elapsed"],
        usage["prompt_tokens"],
        usage["completion_tokens"],
        usage["total_tokens"],
        len(lesson.get("methods", [])),
        len(lesson.get("exercises", [])),
    )
    return lesson
