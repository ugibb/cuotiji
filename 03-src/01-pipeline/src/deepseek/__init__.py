"""DeepSeek provider — chat completions（JSON mode）+ task prompts"""
import json
import time
from pathlib import Path

import requests

from utils.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, DEEPSEEK_TIMEOUT

_CHAT_URL = f"{DEEPSEEK_BASE_URL}/v1/chat/completions"
_HEADERS = {
    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
    "Content-Type": "application/json",
}

# ── Step 4 Prompt：教材讲次结构化解析 ─────────────────────────────────────────
_TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "templates"
_SCHEMA_FILE   = _TEMPLATES_DIR / "lesson-json-schema.json"

_LESSON_PARSE_RULES = """
规则：
1. type 可选值：example（典题精讲）/ practice（举一反三）/ hard_practice（挑战自我）/ challenge（探索知识巅峰）
2. question_type 可选值：填空题 / 选择题 / 判断题 / 计算题 / 解答题 / 证明题 / 作图题
3. method_seq：example / practice / hard_practice 填关联的好方法序号；challenge 填 null
4. stem_parts：所有题型统一用数组，单问题也填一个元素
5. answer_latex：example 和 challenge 填参考答案；practice 和 hard_practice 填 null
6. solution 子对象：仅 example 类型有；其他类型无此字段
7. stem_parts 每个子题含独立 images 字段（子题附图）：填写该子题题干中出现的图片占位符，无图则填 []；solution.images（解题附图）：填写解题过程中出现的辅助图片占位符，无图则填 []；exercises 层不设独立 images 字段；两类图片不得混用
8. placeholder：填写图片占位符名称（如 img_p03_0），不得捏造不存在的名称
9. 答案二维码图片放入对应子题的 stem_parts[j].images[]，desc 注明"答案二维码"，无单独字段
10. 若 kp_seq 无法确定，填 null
11. 数学公式必须用 $（行内）或 $$（独立块）包裹，不得输出裸 LaTeX；
    字段名含 latex 字样不意味着可省略包裹符，纯公式字段同样必须保留 $ 或 $$；
    严格还原 OCR 原文的数学模式：原文 $...$ 保持 $...$，原文 $$...$$ 保持 $$...$$，禁止互相转换；
    普通文字原样输出，不加 $
12. 只输出 JSON，不要 markdown 代码块标记"""


def build_lesson_parse_prompt() -> str:
    """从 templates/lesson-json-schema.json 加载 schema，构建 step4 system prompt。"""
    schema = json.loads(_SCHEMA_FILE.read_text(encoding="utf-8"))
    schema.pop("_meta", None)
    schema_str = json.dumps(schema, ensure_ascii=False, indent=2)
    return (
        "你是一名教材内容结构化专家。\n"
        "用户将提供小学数学思维培养教材（学而思秘籍）的一讲 OCR 文本（含 LaTeX 公式）。\n"
        "请严格按照以下 JSON 结构输出，不要添加任何解释文字：\n\n"
        + schema_str
        + "\n"
        + _LESSON_PARSE_RULES
    )


# ── 通用 chat JSON 调用 ────────────────────────────────────────────────────────

def chat_json(
    system_prompt: str,
    user_content: str,
    temperature: float = 0.1,
    model: str = DEEPSEEK_MODEL,
) -> tuple[str, dict]:
    """
    以 JSON mode 调用 DeepSeek chat completions。

    返回:
        (content_str, token_usage)
        token_usage: {"model": str, "elapsed": float,
                      "prompt_tokens": int, "completion_tokens": int, "total_tokens": int}
    """
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY 未配置")

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_content},
        ],
        "response_format": {"type": "json_object"},
        "temperature": temperature,
    }

    t0 = time.time()
    resp = requests.post(_CHAT_URL, headers=_HEADERS, json=payload, timeout=DEEPSEEK_TIMEOUT)
    elapsed = time.time() - t0
    resp.raise_for_status()

    body = resp.json()
    content = body["choices"][0]["message"]["content"]

    raw_usage = body.get("usage", {})
    token_usage = {
        "model":             model,
        "elapsed":           elapsed,
        "prompt_tokens":     raw_usage.get("prompt_tokens",     0),
        "completion_tokens": raw_usage.get("completion_tokens", 0),
        "total_tokens":      raw_usage.get("total_tokens",      0),
    }
    return content, token_usage
