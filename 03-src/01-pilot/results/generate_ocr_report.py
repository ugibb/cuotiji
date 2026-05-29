"""
生成 Stage 1 OCR 技术预研对比报告
运行：python results/generate_ocr_report.py
输出：results/stage1_ocr_report.html
"""
import base64
import json
from pathlib import Path

BASE = Path(__file__).parent

# ── 模型配置（按厂商分组，颜色区分平台）─────────────────────────
MODELS = [
    # 基准（专业 OCR 服务）
    {"key": "mathpix",        "label": "MathPix",          "platform": "MathPix",      "color": "#2c3e50", "json": "stage1_mathpix.json",                         "note": "专业 OCR 服务，整文档处理基准"},
    # 阿里
    {"key": "qwen_vl_max",    "label": "Qwen-VL-Max",     "platform": "DashScope",    "color": "#8e44ad", "json": "stage1_qwen_vl_p26.json",                    "note": "阿里旗舰多模态"},
    {"key": "qwen3_vl_8b",    "label": "Qwen3-VL-8B",     "platform": "SiliconFlow",  "color": "#9b59b6", "json": "stage1_siliconflow_qwen3_vl_8b.json",         "note": "开源 8B VL"},
    {"key": "qwen3_vl_30b",   "label": "Qwen3-VL-30B",    "platform": "SiliconFlow",  "color": "#6c3483", "json": "stage1_siliconflow_qwen3_vl_30b.json",        "note": "开源 30B MoE VL"},
    {"key": "qwen3_vl_32b",   "label": "Qwen3-VL-32B",    "platform": "SiliconFlow",  "color": "#4a235a", "json": "stage1_siliconflow_qwen3_vl_32b.json",        "note": "开源 32B VL"},
    # DeepSeek
    {"key": "deepseek_ocr",   "label": "DeepSeek-OCR",    "platform": "SiliconFlow",  "color": "#e74c3c", "json": "stage1_siliconflow_deepseek_ocr.json",        "note": "DeepSeek 专用 OCR"},
    # 智谱
    {"key": "zhipu_glm4v",    "label": "GLM-4V-Flash",    "platform": "智谱AI",       "color": "#1a5276", "json": "stage1_zhipu_glm4v.json",                     "note": "智谱旗舰视觉，免费额度"},
    {"key": "glm_4_5v",       "label": "GLM-4.5V",        "platform": "SiliconFlow",  "color": "#2471a3", "json": "stage1_siliconflow_glm_4_5v.json",            "note": "智谱 GLM 4.5 视觉版"},
    # 月之暗面
    {"key": "kimi_direct",    "label": "Kimi Vision",     "platform": "Moonshot",     "color": "#117a65", "json": "stage1_moonshot_kimi.json",                   "note": "Kimi 官方直连"},
    {"key": "kimi_k2_5",      "label": "Kimi-K2.5",       "platform": "SiliconFlow",  "color": "#148f77", "json": "stage1_siliconflow_kimi_k2_5.json",           "note": "Kimi K2.5（硅基）"},
    {"key": "kimi_k2_6",      "label": "Kimi-K2.6",       "platform": "SiliconFlow",  "color": "#0e6655", "json": "stage1_siliconflow_kimi_k2_6.json",           "note": "Kimi K2.6（硅基）"},
    # 百度
    {"key": "ernie_vl",       "label": "ERNIE-4.5-VL",    "platform": "百度文心",     "color": "#d35400", "json": "stage1_ernie_vl.json",                        "note": "百度文心视觉版"},
    # 阶跃
    {"key": "stepfun_1v",     "label": "Step-1V-8k",      "platform": "阶跃星辰",     "color": "#27ae60", "json": "stage1_stepfun_1v.json",                      "note": "阶跃星辰多模态"},
    # 字节豆包
    {"key": "doubao_vision",  "label": "Doubao Seed-1.6V","platform": "火山方舟",     "color": "#e67e22", "json": "stage1_doubao_vision.json",                   "note": "豆包视觉旗舰 Seed 1.6"},
]

IMG_NAME = "12级-2022版《学而思秘籍 小学数学思维培养》第1讲 数形结合_p26_img1.jpeg"
IMG_PATH = BASE / "figures_pymupdf" / IMG_NAME
TARGET   = "第1讲 数形结合_p26"


def load_model_data(cfg: dict) -> dict:
    path = BASE / cfg["json"]
    if not path.exists():
        return {"error": "文件不存在"}
    d = json.loads(path.read_text(encoding="utf-8"))
    details = d.get("details", [])
    matched = [x for x in details if TARGET in x.get("image", "")]
    if not matched:
        matched = details[:1]  # fallback to first
    if not matched:
        return {"error": "无匹配数据"}
    r = matched[0]
    if "error" in r:
        return {"error": r["error"]}
    return {
        "text":          r.get("text_preview", ""),
        "char_count":    r.get("char_count", 0),
        "formula_count": r.get("formula_count", 0),
        "elapsed_s":     r.get("elapsed_s", 0),
        "cost_usd":      r.get("cost_usd", 0),
        "input_tokens":  r.get("input_tokens", 0),
        "output_tokens": r.get("output_tokens", 0),
    }


def img_to_b64(path: Path) -> str:
    if not path.exists():
        return ""
    return base64.standard_b64encode(path.read_bytes()).decode()


def escape_js(s: str) -> str:
    return (s.replace("\\", "\\\\")
             .replace("`", "\\`")
             .replace("$", "\\$"))


def build_model_data_js(models_data: list) -> str:
    entries = []
    for cfg, data in models_data:
        text = data.get("text", "")
        entry = {
            "key":      cfg["key"],
            "label":    cfg["label"],
            "platform": cfg["platform"],
            "color":    cfg["color"],
            "note":     cfg["note"],
            "error":    data.get("error"),
            "text":     text,
            "chars":    data.get("char_count", 0),
            "formulas": data.get("formula_count", 0),
            "elapsed":  data.get("elapsed_s", 0),
            "cost_usd": data.get("cost_usd", 0),
            "in_tok":   data.get("input_tokens", 0),
            "out_tok":  data.get("output_tokens", 0),
        }
        entries.append(entry)
    return "const MODELS = " + json.dumps(entries, ensure_ascii=False) + ";"


HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stage 1 · OCR 技术预研对比报告</title>

<!-- MathJax 3 -->
<script>
MathJax = {
  tex: {
    inlineMath: [['$', '$']],
    displayMath: [['$$', '$$']],
    processEscapes: true,
  },
  options: { skipHtmlTags: ['script','noscript','style','textarea','pre','code'] }
};
</script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>

<style>
*, *::before, *::after { box-sizing: border-box; }

:root {
  --bg:       #f5f6fa;
  --surface:  #ffffff;
  --border:   #e1e4ea;
  --text:     #1a1d27;
  --muted:    #6b7280;
  --radius:   10px;
  --shadow:   0 2px 12px rgba(0,0,0,.07);
}

body {
  margin: 0;
  padding: 24px 20px 60px;
  background: var(--bg);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif;
  color: var(--text);
  font-size: 14px;
  line-height: 1.6;
}

header {
  max-width: 1400px;
  margin: 0 auto 28px;
}

header h1 {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 6px;
  color: var(--text);
}

header p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.layout {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 20px;
  align-items: start;
}

/* ── 左栏：原图 ───────────────────────────────── */
.sidebar {
  position: sticky;
  top: 20px;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.card-title {
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  background: #fafbfc;
}

.original-img {
  width: 100%;
  display: block;
}

.img-meta {
  padding: 10px 14px;
  font-size: 12px;
  color: var(--muted);
  border-top: 1px solid var(--border);
  background: #fafbfc;
  word-break: break-all;
}

/* ── 右栏：模型对比 ──────────────────────────── */
.models-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

/* ── 模型卡片 ───────────────────────────────── */
.model-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.model-header {
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 10px;
}

.model-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.model-name {
  font-weight: 700;
  font-size: 15px;
}

.model-platform {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--bg);
  color: var(--muted);
  font-weight: 500;
}

.model-note {
  font-size: 11px;
  color: var(--muted);
  margin-left: auto;
}

.model-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid var(--border);
  background: #fafbfc;
}

.stat {
  padding: 8px 14px;
  border-right: 1px solid var(--border);
  text-align: center;
}
.stat:last-child { border-right: none; }

.stat-val {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.2;
}

.stat-lbl {
  font-size: 10px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .05em;
  margin-top: 2px;
}

/* ── tab 切换 ──────────────────────────────── */
.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.tab-btn {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  transition: color .15s, border-color .15s;
  margin-bottom: -1px;
}

.tab-btn:hover { color: var(--text); }

.tab-btn.active {
  color: var(--text);
  border-bottom-color: currentColor;
}

.tab-panel {
  display: none;
  padding: 14px 16px;
  min-height: 200px;
}

.tab-panel.active { display: block; }

/* 原始文本面板 */
.raw-text {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  color: #374151;
  background: #f9fafb;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  margin: 0;
}

/* 渲染面板 */
.rendered {
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--text);
}

.rendered .MJX-TEX { font-size: 1em; }

/* 错误状态 */
.error-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: #fff5f5;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #dc2626;
  font-size: 12px;
  margin: 8px 0;
}

/* ── 横向汇总表 ─────────────────────────────── */
.summary-section {
  max-width: 1400px;
  margin: 24px auto 0;
}

.summary-section h2 {
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow);
  font-size: 13px;
}

th {
  background: #fafbfc;
  padding: 10px 14px;
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .04em;
  border-bottom: 1px solid var(--border);
}

td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

tr:last-child td { border-bottom: none; }
tr:hover td { background: #f9fafb; }

.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
}

.cost-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cost-bar-inner {
  height: 6px;
  border-radius: 3px;
  background: currentColor;
  opacity: .7;
  min-width: 2px;
}

.quality-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.q-good  { background: #dcfce7; color: #15803d; }
.q-warn  { background: #fef9c3; color: #92400e; }
.q-fail  { background: #fee2e2; color: #dc2626; }

@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .sidebar { position: static; }
  .models-grid { grid-template-columns: 1fr; }
}
</style>
</head>
<body>

<header>
  <h1>Stage 1 · OCR 模型技术预研对比报告</h1>
  <p>测试素材：《学而思秘籍 小学数学思维培养》12级 · 第1讲 数形结合 · p26 &nbsp;|&nbsp; 测试日期：2026-05-18</p>
</header>

<div class="layout">

  <!-- 左栏：原始图片 -->
  <aside class="sidebar">
    <div class="card">
      <div class="card-title">原始测试图片</div>
      <img class="original-img" id="origImg" src="" alt="原始图片">
      <div class="img-meta" id="imgMeta">加载中…</div>
    </div>
  </aside>

  <!-- 右栏：模型卡片 -->
  <main class="models-grid" id="modelsGrid"></main>

</div>

<!-- 汇总表 -->
<div class="summary-section">
  <h2>横向对比汇总</h2>
  <table id="summaryTable">
    <thead>
      <tr>
        <th>模型</th>
        <th>平台</th>
        <th>字符数</th>
        <th>公式数</th>
        <th>耗时</th>
        <th>成本 / 页</th>
        <th>推算全量成本</th>
        <th>质量评估</th>
      </tr>
    </thead>
    <tbody id="summaryBody"></tbody>
  </table>
</div>

<!-- ── 数据注入（由 generate_ocr_report.py 替换） ── -->
<script>
__MODELS_DATA__
</script>

<script>
const IMG_B64 = "__IMG_B64__";

// ── 渲染原图 ─────────────────────────────────────────────
const origImg  = document.getElementById('origImg');
const imgMeta  = document.getElementById('imgMeta');
if (IMG_B64) {
  origImg.src = 'data:image/jpeg;base64,' + IMG_B64;
  imgMeta.textContent = '第1讲 数形结合_p26_img1.jpeg';
} else {
  origImg.style.display = 'none';
  imgMeta.textContent = '图片未找到';
}

// ── 质量评级 ─────────────────────────────────────────────
function qualityBadge(m) {
  if (m.error)       return ['fail',  '识别失败'];
  if (m.chars < 100) return ['warn',  '内容缺失'];
  if (m.formulas < 3) return ['warn', '公式偏少'];
  return ['good', '正常'];
}

// ── 格式化 ───────────────────────────────────────────────
function fmtCost(usd) {
  if (!usd) return '—';
  if (usd < 0.001) return `$${(usd*1000).toFixed(3)}‰`;
  return `$${usd.toFixed(5)}`;
}

function fmtFull(usd) {
  if (!usd) return '—';
  return `~$${Math.round(usd * 32 * 4000)}`;
}

// ── 构建模型卡片 ─────────────────────────────────────────
function buildCard(m) {
  const [qClass, qLabel] = qualityBadge(m);
  const card = document.createElement('div');
  card.className = 'model-card';

  card.innerHTML = `
    <div class="model-header">
      <div class="model-dot" style="background:${m.color}"></div>
      <span class="model-name">${m.label}</span>
      <span class="model-platform">${m.platform}</span>
      <span class="model-note">${m.note}</span>
    </div>

    <div class="model-stats">
      <div class="stat">
        <div class="stat-val">${m.chars || '—'}</div>
        <div class="stat-lbl">字符数</div>
      </div>
      <div class="stat">
        <div class="stat-val">${m.formulas || '—'}</div>
        <div class="stat-lbl">公式数</div>
      </div>
      <div class="stat">
        <div class="stat-val">${m.elapsed ? m.elapsed + 's' : '—'}</div>
        <div class="stat-lbl">耗时</div>
      </div>
      <div class="stat">
        <div class="stat-val" style="font-size:13px">${fmtCost(m.cost_usd)}</div>
        <div class="stat-lbl">成本/页</div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn active" data-tab="raw-${m.key}">原始文本</button>
      <button class="tab-btn" data-tab="rendered-${m.key}">LaTeX 渲染</button>
    </div>

    <div class="tab-panel active" id="raw-${m.key}">
      ${m.error
        ? `<div class="error-badge">⚠ ${m.error}</div>`
        : `<pre class="raw-text">${escapeHtml(m.text)}</pre>`
      }
    </div>

    <div class="tab-panel" id="rendered-${m.key}">
      ${m.error
        ? `<div class="error-badge">⚠ ${m.error}</div>`
        : `<div class="rendered" id="render-${m.key}">${escapeHtml(m.text)}</div>`
      }
    </div>
  `;
  return card;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── 渲染 markdown-like 换行 ──────────────────────────────
function mdToHtml(s) {
  return escapeHtml(s)
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

// ── 构建汇总表行 ─────────────────────────────────────────
function buildTableRow(m) {
  const [qClass, qLabel] = qualityBadge(m);
  const maxCost = Math.max(...MODELS.filter(x=>!x.error).map(x=>x.cost_usd||0));
  const barW = maxCost > 0 ? Math.round((m.cost_usd||0) / maxCost * 100) : 0;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>
      <span style="display:inline-flex;align-items:center;gap:7px">
        <span style="width:8px;height:8px;border-radius:50%;background:${m.color};display:inline-block"></span>
        <strong>${m.label}</strong>
      </span>
    </td>
    <td>${m.platform}</td>
    <td>${m.error ? '—' : m.chars}</td>
    <td>${m.error ? '—' : m.formulas}</td>
    <td>${m.error ? '—' : (m.elapsed ? m.elapsed + ' s' : '—')}</td>
    <td>
      <div class="cost-bar" style="color:${m.color}">
        <div class="cost-bar-inner" style="width:${barW}px"></div>
        <span>${fmtCost(m.cost_usd)}</span>
      </div>
    </td>
    <td>${fmtFull(m.cost_usd)}</td>
    <td><span class="quality-badge q-${qClass}">${qLabel}</span></td>
  `;
  return tr;
}

// ── Tab 切换事件委托 ─────────────────────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  const tabId = btn.dataset.tab;
  const card  = btn.closest('.model-card');
  card.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  card.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  card.querySelector(`#${tabId}`).classList.add('active');

  // 如果切换到渲染面板，替换内容为 HTML 并触发 MathJax
  if (tabId.startsWith('rendered-')) {
    const key = tabId.replace('rendered-', '');
    const m = MODELS.find(x => x.key === key);
    const el = document.getElementById(`render-${key}`);
    if (m && el && !el.dataset.rendered) {
      el.dataset.rendered = '1';
      const lines = m.text.split('\n');
      el.innerHTML = lines.map(l => {
        if (!l.trim()) return '<br>';
        // markdown 图片 ![alt](url) → <img>
        l = l.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
          `<img src="${url}" alt="${alt}" style="max-width:100%;border-radius:4px;margin:4px 0;display:block">`
        );
        // \section*{...} → 小标题
        l = l.replace(/\\section\*\{([^}]+)\}/g, '<strong>$1</strong>');
        // <|begin_of_box|>...<|end_of_box|> → 去掉特殊 token
        l = l.replace(/<\|begin_of_box\|>([\s\S]*?)<\|end_of_box\|>/g, '$1');
        return `<p style="margin:.3em 0">${l}</p>`;
      }).join('');
      if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([el]);
      }
    }
  }
});

// ── 主渲染 ───────────────────────────────────────────────
const grid = document.getElementById('modelsGrid');
const tbody = document.getElementById('summaryBody');

MODELS.forEach(m => {
  grid.appendChild(buildCard(m));
  tbody.appendChild(buildTableRow(m));
});
</script>
</body>
</html>
"""


def generate():
    # 收集模型数据
    models_data = []
    for cfg in MODELS:
        data = load_model_data(cfg)
        models_data.append((cfg, data))

    # 注入模型数据 JS
    models_js = build_model_data_js(models_data)

    # 图片 base64
    img_b64 = img_to_b64(IMG_PATH)

    html = HTML_TEMPLATE
    html = html.replace("__MODELS_DATA__", models_js)
    html = html.replace('"__IMG_B64__"', f'`{img_b64}`' if img_b64 else '""')

    out_path = BASE / "stage1_ocr_report.html"
    out_path.write_text(html, encoding="utf-8")
    print(f"报告已生成：{out_path}")
    return out_path


if __name__ == "__main__":
    generate()
