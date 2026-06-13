# PDF 教材预处理技术方案

> 生成于 2026-06-07，基于产品讨论模式
> 来源：学而思秘籍·小学数学思维培养（扫描件 PDF）

---

## 一、背景与目标

将多套教材 PDF 预处理入库，最终写入预处理库（`PBL_PREP`）`pre_` 系列表，审核通过后同步至标准库（`PBL_STD`）驱动学生训练计划。

**目标表映射：**


| 教材内容            | 目标表                   |
| --------------- | --------------------- |
| 每一讲元信息          | `pre_source_lessons`  |
| 知识导引 + 知识点梳理    | `pre_lecture_kp`      |
| 好方法（解题策略）       | `pre_lecture_methods` |
| 例题 + 举一反三 + 探索题 | `pre_questions`       |
| 题目与知识点关联        | `pre_question_kp_map` |


---

## 二、教材结构（以学而思秘籍为例）

```
每讲 PDF
├── 知识导引（本讲学习目标）
├── 知识点梳理（知识点列表）
└── 好方法 1..n
    ├── 例题（题干 + 附图 + 分析思维导图 + 完整解析）
    └── 举一反三 1..m（题干 + 附图 + 答案二维码）
└── 探索知识巅峰（1-2 道挑战题，结构同举一反三）
```

**PDF 类型：扫描件（全图片），含数学公式，需 LaTeX 识别**

---

## 三、整体 Pipeline 架构

```
原始 PDF
  │
  ├─① PyMuPDF
  │     ├─ 按页拆分为图片（300 DPI PNG）
  │     └─ 提取嵌入图片（附图 / 思维导图 / 二维码）
  │
  ├─② OCR + LaTeX 识别（见方案选择）
  │     └─ 输出：带 LaTeX 的 Markdown / JSON（每页）
  │
  ├─③ 大模型 API（结构解析，推荐 DeepSeek-V3 / Qwen-Max）
  │     ├─ Prompt：按「知识导引/知识点/好方法/举一反三/探索题」分段
  │     └─ 输出：结构化 JSON（字段对应 pre_ 表）
  │
  ├─④ 图片分类 + CDN 上传
  │     ├─ 附图 → 关联至对应题目
  │     ├─ 思维导图 → 关联至例题解析
  │     └─ 二维码 → pyzbar 解码，保存原始 URL + 图片 URL
  │
  └─⑤ 写入 PBL_PREP 数据库
        ├─ pre_source_lessons（讲次索引）
        ├─ pre_lecture_kp（知识点）
        ├─ pre_lecture_methods（好方法）
        └─ pre_questions（题目，review_status = 'pending'）
```

---

## 四、OCR 方案选择

### 数学 OCR + LaTeX 工具横向对比

> Mathpix API 目前未对外开放，以下为可用替代方案全览。

|工具|类型|中文支持|数学 LaTeX|费用|入口|
|---|---|---|---|---|---|
|~~Mathpix API~~|付费 API|良好|⭐⭐⭐⭐⭐|~$10/1000页|暂不可用|
|**SimpleTex**|付费 API 🇨🇳|⭐⭐⭐⭐⭐|⭐⭐⭐⭐⭐|按量，有免费额度|[simpletex.cn](https://simpletex.cn/)|
|**Qwen-VL-Max**（通义千问）|付费 API 🇨🇳|⭐⭐⭐⭐⭐|⭐⭐⭐⭐|按 token 计费，有免费额度|[dashscope.aliyun.com](https://dashscope.aliyun.com/)|
|**GLM-4V**（智谱 AI）|付费 API 🇨🇳|⭐⭐⭐⭐⭐|⭐⭐⭐⭐|按 token，GLM-4V-Flash 免费|[open.bigmodel.cn](https://open.bigmodel.cn/)|
|**Pix2Text**|开源本地|⭐⭐⭐⭐⭐|⭐⭐⭐⭐|免费|[github: breezedeus/Pix2Text](https://github.com/breezedeus/Pix2Text)|
|**Texify**|开源本地|⭐⭐|⭐⭐⭐⭐⭐|免费（GPU 可选）|[github: VikParuchuri/texify](https://github.com/VikParuchuri/texify)|
|**GOT-OCR 2.0**|开源本地|⭐⭐⭐⭐⭐|⭐⭐⭐⭐|免费（需 GPU）|[github: Ucas-HaoranWei/GOT-OCR2.0](https://github.com/Ucas-HaoranWei/GOT-OCR2.0)|
|**Nougat**（Meta）|开源本地|⭐⭐|⭐⭐⭐⭐⭐|免费（需 GPU）|[github: facebookresearch/nougat](https://github.com/facebookresearch/nougat)|

### 推荐替代方案详解

#### 方案 A1：SimpleTex + DeepSeek（首选替代 Mathpix）

- **定位**：SimpleTex 专为中文数学场景设计，DeepSeek-V3 做结构解析，全链路国内服务
- **输入**：每页 PNG 图片
- **输出**：SimpleTex 返回 LaTeX + 文字；DeepSeek-V3 解析为 `pre_` 表 JSON
- **费用**：SimpleTex 有免费额度；DeepSeek-V3 ~¥0.27/1M tokens，极低
- **优势**：国内网络无障碍，中文数学识别精度高，API 文档完整

#### 方案 A2：Pix2Text + DeepSeek（免费首选）

```bash
pip install pix2text
```

- **定位**：Pix2Text 做 OCR + LaTeX，DeepSeek-V3 做结构解析，零 API 费用（OCR 侧）
- **输出**：LaTeX + 普通文字混合 Markdown → DeepSeek 解析为 JSON
- **无需 GPU**：CPU 可运行（速度慢），有 GPU 更快
- **适用**：本地处理、无 API 费用预算时优先使用

#### 方案 B：Qwen-VL-Max 一体化（视觉理解，简单快速）

- **工具**：通义千问 Qwen-VL-Max（阿里云 DashScope）
- **输入**：每页 PNG
- **输出**：直接输出结构化 JSON（OCR + 解析一次完成）
- **费用**：按 token 计费，有免费额度，[dashscope.aliyun.com](https://dashscope.aliyun.com/)
- **优势**：一个 API 完成所有步骤，中文理解强，Prompt 可直接对应 `pre_` 表字段
- **备选**：GLM-4V（智谱 AI），GLM-4V-Flash 有免费额度，[open.bigmodel.cn](https://open.bigmodel.cn/)

#### 方案 C：GOT-OCR 2.0 + DeepSeek（免费，需 GPU）

- **支持**：中文 + 数学 LaTeX，2024 年新模型，效果接近 Mathpix
- **硬件**：GPU 推荐（RTX 3090 16GB+）
- **结构解析**：DeepSeek-V3 API（极低成本）
- **适用**：长期批量处理多套教材

### 推荐策略

> **第一步**：先用 **Pix2Text + DeepSeek-V3**（免费/极低成本）跑 2-3 个讲次，对比 LaTeX 输出质量。
>
> **第二步**：若数学公式精度不达标，切换 **SimpleTex + DeepSeek-V3**（全国产付费方案）。
>
> **视觉一体化**：若想最简接入，用 **Qwen-VL-Max** 一次调用完成 OCR + 结构解析。
>
> **长期**：量大时评估 **GOT-OCR 2.0** 本地部署降低边际成本。

---

## 五、图片处理细节

### 5.1 附图提取与关联

- PyMuPDF 按页提取所有嵌入图片，记录图片在页面中的坐标
- 通过坐标与题目文字块的相对位置，判断图片归属（属于哪道题）
- 上传腾讯云 COS / 阿里云 OSS，返回 URL
- URL 写入 `pre_questions.stem_raw`（JSON 格式内嵌）

### 5.2 二维码处理（举一反三答案）

```python
import pyzbar.pyzbar as pyzbar
from PIL import Image

def decode_qr(img_path):
    img = Image.open(img_path)
    decoded = pyzbar.decode(img)
    return decoded[0].data.decode('utf-8') if decoded else None
```

- 能解码：保存原始答案 URL，后续爬取答案页
- 无法解码（图片模糊）：保存二维码图片 URL，人工处理队列标记

### 5.3 思维导图

- 例题解析部分的思维导图图片直接存 CDN
- URL 写入 `pre_lecture_methods` 的 summary 字段或新增 `diagram_url` 字段

---

## 六、几何图辅助线方案

### 来源分类


| 题型         | 辅助线图来源               |
| ---------- | -------------------- |
| 例题         | 教材扫描图中已有解析图 → 直接提取存图 |
| 举一反三 / 探索题 | 无现成图 → AI 离线生成       |


### AI 离线生成流程（举一反三）

```
题目文字 + 原始几何图
  ↓ DeepSeek-V3 / Qwen-Max API
  输出：TikZ 代码（含辅助线绘制指令）
  ↓ Python pdflatex / tectonic 编译
  输出：PNG 图片
  ↓ 上传 CDN
  URL 写入 knl_question_solutions.diagram_url（建议新增字段）
```

**TikZ 生成 Prompt 示例：**

```
根据以下几何题目，生成包含辅助线的 TikZ 代码，
辅助线用虚线标注，并用 \node 标注关键点字母。
题目：{题干}
原图描述：{图形要素}
```

> 注：此步骤在**人工审核阶段**触发，非实时生成。
> 学生查看解析时直接加载预生成的 CDN 图片 URL。

---

## 七、数据库写入字段映射

### pre_source_lessons


| 字段                       | 来源                                    |
| ------------------------ | ------------------------------------- |
| material_set             | 固定值：`学而思秘籍`                           |
| grade / level / semester | 文件目录层级解析                              |
| lesson_num / lesson_name | PDF 文件名解析                             |
| file_path                | 原始文件路径                                |
| is_scanned               | `true`                                |
| stage                    | `ocr_pending` → `parsed` → `reviewed` |


### pre_questions


| 字段            | 来源                                               |
| ------------- | ------------------------------------------------ |
| stem_raw      | OCR 识别的原始题干文字                                    |
| stem_latex    | SimpleTex / Qwen-VL / Pix2Text 输出的 LaTeX         |
| answer_raw    | 二维码 URL 或空（待补充）                                  |
| solution_raw  | 例题解析文字（举一反三为空）                                   |
| options       | 选择题 JSONB，填空/解答题为 null                           |
| skill_ids_ai  | DeepSeek / Qwen 结构解析时推断的知识点 ID                   |
| review_status | 初始值：`pending`                                    |
| question_type | `example`（例题）/ `practice`（举一反三）/ `challenge`（探索） |


---

## 八、分批处理策略


| 批次  | 内容                                     | 状态     |
| --- | -------------------------------------- | ------ |
| 第一批 | 能完整提取的字段：题干、附图、知识点、讲次结构                | ✅ 优先完成 |
| 第二批 | 二维码答案爬取 + 回填 answer_raw / answer_latex | 待排期    |
| 第三批 | 举一反三几何题辅助线 AI 生成 + diagram_url 回填      | 待排期    |


---

## 九、同步闸门（预处理库 → 标准库）

```sql
-- 满足以下条件才可同步到 knl_questions
WHERE review_status = 'approved'
  AND stem_latex IS NOT NULL
```

审核工具建议：内部后台页面，逐题展示 OCR 结果 + 原始扫描图对比，支持一键批准/驳回/编辑。

---

## 十、技术选型汇总


|模块|工具|类型|注册 / 文档入口|API Key 申请|
|---|---|---|---|---|
|PDF 拆页 + 图片提取|PyMuPDF（`fitz`）|开源免费|[pymupdf.readthedocs.io](https://pymupdf.readthedocs.io/)|无需|
|数学 OCR + LaTeX|SimpleTex|付费，有免费额度|[simpletex.cn](https://simpletex.cn/)|[simpletex.cn/api](https://simpletex.cn/api)|
|数学 OCR + LaTeX（本地）|Pix2Text|开源免费|[github: breezedeus/Pix2Text](https://github.com/breezedeus/Pix2Text)|无需|
|结构解析|DeepSeek-V3|付费（极低）|[platform.deepseek.com](https://platform.deepseek.com/)|[platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)|
|结构解析备选|Qwen-Max（通义千问）|付费，有免费额度|[dashscope.aliyun.com](https://dashscope.aliyun.com/)|[dashscope.aliyun.com/apiKey](https://dashscope.aliyun.com/apiKey)|
|视觉一体化|Qwen-VL-Max（通义千问）|付费，有免费额度|[dashscope.aliyun.com](https://dashscope.aliyun.com/)|[dashscope.aliyun.com/apiKey](https://dashscope.aliyun.com/apiKey)|
|视觉一体化备选|GLM-4V（智谱 AI）|付费，Flash 版免费|[open.bigmodel.cn](https://open.bigmodel.cn/)|[open.bigmodel.cn/usercenter/apikeys](https://open.bigmodel.cn/usercenter/apikeys)|
|本地 OCR 替代|GOT-OCR 2.0|开源免费|[github: Ucas-HaoranWei/GOT-OCR2.0](https://github.com/Ucas-HaoranWei/GOT-OCR2.0)|无需|
|二维码解码|pyzbar|开源免费|[github: NaturalHistoryMuseum/pyzbar](https://github.com/NaturalHistoryMuseum/pyzbar)|无需|
|图片存储（推荐）|腾讯云 COS|付费|[cloud.tencent.com/product/cos](https://cloud.tencent.com/product/cos)|[console.cloud.tencent.com/cam/capi](https://console.cloud.tencent.com/cam/capi)|
|图片存储（备选）|阿里云 OSS|付费|[aliyun.com/product/oss](https://www.aliyun.com/product/oss)|[ram.console.aliyun.com/manage/ak](https://ram.console.aliyun.com/manage/ak)|
|几何图编译|tectonic（轻量 LaTeX 引擎）|开源免费|[tectonic-typesetting.github.io](https://tectonic-typesetting.github.io/)|无需|
|运行语言|Python 3.10+|—|[python.org/downloads](https://www.python.org/downloads/)|无需|


