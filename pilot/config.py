import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ── 项目根路径 ──────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
SAMPLES_DIR = BASE_DIR / "samples"
GROUND_TRUTH_DIR = SAMPLES_DIR / "ground_truth"
REPORT_DIR = BASE_DIR / "report"

# ── API Keys ────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY    = os.getenv("OPENAI_API_KEY", "")       # GPT-4o 备选
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")    # Qwen
MATHPIX_APP_ID    = os.getenv("MATHPIX_APP_ID", "")
MATHPIX_APP_KEY   = os.getenv("MATHPIX_APP_KEY", "")

# DeepSeek 使用 OpenAI 兼容接口
DEEPSEEK_API_KEY  = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"

# 硅基流动（SiliconFlow）— 托管开源视觉模型
SILICONFLOW_API_KEY  = os.getenv("SILICONFLOW_API_KEY", "")
SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1"

# 智谱AI  open.bigmodel.cn
ZHIPU_API_KEY  = os.getenv("ZHIPU_API_KEY", "")
ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4"

# 字节豆包（火山方舟）  console.volcengine.com/ark
DOUBAO_API_KEY  = os.getenv("DOUBAO_API_KEY", "")
DOUBAO_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

# 百度文心  qianfan.baidubce.com
ERNIE_API_KEY  = os.getenv("ERNIE_API_KEY", "")
ERNIE_BASE_URL = "https://qianfan.baidubce.com/v2"

# 阶跃星辰  platform.stepfun.com
STEPFUN_API_KEY  = os.getenv("STEPFUN_API_KEY", "")
STEPFUN_BASE_URL = "https://api.stepfun.com/v1"

# 月之暗面 Kimi（直连）  platform.moonshot.cn
MOONSHOT_API_KEY  = os.getenv("MOONSHOT_API_KEY", "")
MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1"

# ── 模型名称 ────────────────────────────────────────────────
MODELS = {
    "claude_haiku":  "claude-haiku-4-5-20251001",
    "claude_sonnet": "claude-sonnet-4-6",
    "deepseek_v3":   "deepseek-chat",           # DeepSeek-V3
    "qwen_turbo":    "qwen-turbo",
    "gpt4o":         "gpt-4o",
    "gpt4o_mini":    "gpt-4o-mini",
}

# ── 样本文件路径 ────────────────────────────────────────────
TEXT_PDF_DIR    = SAMPLES_DIR / "text_pdf"
SCANNED_PDF_DIR = SAMPLES_DIR / "scanned_pdf"
WORD_DIR        = SAMPLES_DIR / "word_files"
FIGURES_DIR     = GROUND_TRUTH_DIR / "figures"

# ── Ground Truth 文件 ───────────────────────────────────────
GT_QUESTIONS = GROUND_TRUTH_DIR / "questions.json"   # 100道题分割
GT_SKILLS    = GROUND_TRUTH_DIR / "skills.json"      # Skill 映射
GT_LATEX     = GROUND_TRUTH_DIR / "latex.json"       # LaTeX 标准化

# ── 知识体系参考文件 ─────────────────────────────────────────
KNOWLEDGE_DIR = BASE_DIR.parent / "02-doc" / "02-design" / "03-knowledge-graph"
SKILLS_JSON   = KNOWLEDGE_DIR / "skills.json"
MODULES_JSON  = KNOWLEDGE_DIR / "modules-topics.json"

# ── 评估阈值 ────────────────────────────────────────────────
MIN_ACCEPTABLE_TOP1    = 0.75    # Stage 3：Top-1 准确率最低要求
MIN_ACCEPTABLE_TOP3    = 0.90    # Stage 3：Top-3 准确率最低要求
MAX_LOW_CONF_RATE      = 0.20    # Stage 3：低置信度(<0.7)比例上限
MIN_LATEX_VALID_RATE   = 0.90    # Stage 4：LaTeX 语法有效率最低要求
MIN_TIKZ_SIMPLE_RATE   = 0.70    # Stage 5：简单图形 TikZ 成功率最低要求
