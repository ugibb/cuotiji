import os
from pathlib import Path
from dotenv import load_dotenv

# ── 路径根 ───────────────────────────────────────────────────────────────────
_UTILS_DIR = Path(__file__).resolve().parent
_SRC_DIR = _UTILS_DIR.parent
_PIPELINE_ROOT = _SRC_DIR.parent          # 03-src/01-pipeline

load_dotenv(_PIPELINE_ROOT / ".env")

# ── Pipeline 路径 ─────────────────────────────────────────────────────────────
INPUT_DIR   = _PIPELINE_ROOT / "input"
OUTPUT_DIR  = _PIPELINE_ROOT / "output"
LOG_DIR     = _PIPELINE_ROOT / "log"

REPORT_DIR  = OUTPUT_DIR / "report"
RESULTS_DIR = OUTPUT_DIR / "results"

# ── 分步顶级输出目录（相对于 OUTPUT_DIR）──────────────────────────────────────
DIR_01_PAGES  = Path("01-pages")   # step1: 拆页 PNG
DIR_02_OCR    = Path("02-ocr")     # step2: OCR md + imgs
DIR_03_MERGE  = Path("03-merge")   # step3: 全讲拼接 Markdown
DIR_04_JSON   = Path("04-json")    # step4: lesson.json
DIR_05_SQL    = Path("05-sql")     # step5: INSERT SQL

# ── 每讲输出子目录（相对于各步骤的 lesson 目录）──────────────────────────────
DIR_IMGS       = Path("imgs")       # 旧版图片子目录（已废弃，仅保留向后兼容）
DIR_LATEX_IMGS = Path("latex_imgs") # 裁切图聚合目录（在 02-ocr/ 下，按讲次分层）


FILE_OCR_MERGED  = Path("ocr_merged.md")   # step3 构造的全讲拼接文本，供人工查阅
FILE_OCR_LOG     = Path("step2_ocr.log")

KNOWLEDGE_DIR = _PIPELINE_ROOT.parent.parent / "02-doc" / "02-design" / "03-knowledge-graph"
SKILLS_JSON = KNOWLEDGE_DIR / "skills.json"
MODULES_JSON = KNOWLEDGE_DIR / "modules-topics.json"

# ── 敏感配置（从 .env 加载）──────────────────────────────────────────────────
SIMPLETEX_TOKEN = os.getenv("SIMPLETEX_TOKEN", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
PREP_DATABASE_URL = os.getenv("PREP_DATABASE_URL", "")
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
MATHPIX_APP_ID = os.getenv("MATHPIX_APP_ID", "")
MATHPIX_APP_KEY = os.getenv("MATHPIX_APP_KEY", "")

SILICONFLOW_API_KEY = os.getenv("SILICONFLOW_API_KEY", "")
ZHIPU_API_KEY = os.getenv("ZHIPU_API_KEY", "")
DOUBAO_API_KEY = os.getenv("DOUBAO_API_KEY", "")
ERNIE_API_KEY = os.getenv("ERNIE_API_KEY", "")
STEPFUN_API_KEY = os.getenv("STEPFUN_API_KEY", "")
MOONSHOT_API_KEY = os.getenv("MOONSHOT_API_KEY", "")

# ── OCR Provider 路由 ─────────────────────────────────────────────────────────
# 可选值：qwen（默认）| simpletex
OCR_PROVIDER = os.getenv("OCR_PROVIDER", "qwen")

# ── API 端点与模型 ────────────────────────────────────────────────────────────
SIMPLETEX_BASE_URL = "https://server.simpletex.cn/api"

DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
QWEN_MODEL = "qwen-vl-max"

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"

SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1"
ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4"
DOUBAO_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
ERNIE_BASE_URL = "https://qianfan.baidubce.com/v2"
STEPFUN_BASE_URL = "https://api.stepfun.com/v1"
MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1"

MODELS = {
    "claude_haiku": "claude-haiku-4-5-20251001",
    "claude_sonnet": "claude-sonnet-4-6",
    "deepseek_v3": "deepseek-chat",
    "qwen_turbo": "qwen-turbo",
    "gpt4o": "gpt-4o",
    "gpt4o_mini": "gpt-4o-mini",
}

# ── Pipeline 业务配置 ─────────────────────────────────────────────────────────
MATERIAL_SET = "学而思秘籍2022"
PAGE_DPI = 300

# ── step3: DeepSeek 解析参数 ──────────────────────────────────────────────────
PARSE_TEMPERATURE = 0.1
DEEPSEEK_TIMEOUT = 120

# ── step4: 图片分类阈值 ───────────────────────────────────────────────────────
MINDMAP_AREA_THRESHOLD = 300_000
MINDMAP_RATIO_MIN = 0.4
MINDMAP_RATIO_MAX = 3.0

# ── Qwen VL OCR 参数 ──────────────────────────────────────────────────────────
QWEN_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5MB — Qwen API 实测上限约 8-10MB，留余量
QWEN_TIMEOUT = 120
QWEN_JPEG_QUALITY_INIT = 85

# ── 图片裁剪参数 ──────────────────────────────────────────────────────────────
# VLM 返回的 bbox 边缘可能略有收缩，向外扩展一定比例避免四边缺失
BBOX_CROP_PADDING = 0.01   # 归一化坐标单位，四边各扩 1%

# ── SimpleTex OCR 参数 ────────────────────────────────────────────────────────
SIMPLETEX_RETRY_DELAYS = [3, 6, 12]
SIMPLETEX_TIMEOUT = 45

# ── step5: 数据库写入常量 ─────────────────────────────────────────────────────
DB_INIT_STAGE = "ocr_done"
DB_DONE_STAGE = "db_written"
SOURCE_FILE_TYPE = "pdf"
SOURCE_IS_SCANNED = True
QUESTION_TYPE_DEFAULT = "open"
QUESTION_REVIEW_STATUS_DEFAULT = "pending"

# ── 评估阈值 ─────────────────────────────────────────────────────────────────
MIN_ACCEPTABLE_TOP1 = 0.75
MIN_ACCEPTABLE_TOP3 = 0.90
MAX_LOW_CONF_RATE = 0.20
MIN_LATEX_VALID_RATE = 0.90
MIN_TIKZ_SIMPLE_RATE = 0.70
