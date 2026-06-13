# Pipeline 方案 A1 实现方案：SimpleTex + DeepSeek

> 生成于 2026-06-08
> 前置文档：[085-pdf-preprocessing-pipeline.md](085-pdf-preprocessing-pipeline.md)

---

## 一、目录结构

```text
03-src/
└── 04-pipeline/              ← 新建，独立 Python 工程
    ├── config.py             # API Key、DB 连接串配置
    ├── main.py               # 入口：单文件或批量目录处理
    ├── step1_split.py        # PDF 拆页（PNG）+ 嵌入图片提取（含坐标）
    ├── step2_ocr.py          # SimpleTex API 调用，返回 LaTeX Markdown
    ├── step3_parse.py        # DeepSeek-V3 结构解析，输出 JSON
    ├── step4_images.py       # 图片分类（附图/思维导图/二维码）+ 本地存储 + QR 解码
    ├── step5_db.py           # 写入 PBL_PREP pre_ 系列表
    └── requirements.txt
```

---

## 二、教材目录与文件名规律

实际目录结构（已确认）：

```text
OK-【学而思秘籍】2022版《学而思秘籍 小学数学思维培养》1-12级/
  1级-2022版《学而思秘籍 小学数学思维培养》/
    1级-2022版《学而思秘籍 小学数学思维培养》-参考答案.pdf   ← 跳过
    1级-2022版《学而思秘籍 小学数学思维培养》第1讲 推理比较.pdf
    1级-2022版《学而思秘籍 小学数学思维培养》第2讲 线角初步.pdf
    ...（共约 20 讲）
  2级-2022版《学而思秘籍 小学数学思维培养》/
    ...
  ...
  12级-2022版《学而思秘籍 小学数学思维培养》/
    ...
  练习题/   ← 本期跳过
  讲义/     ← 本期跳过
```

**文件名解析规则（正则自动提取）：**


| 字段            | 来源  | 正则 / 推导                                |
| ------------- | --- | -------------------------------------- |
| `level`       | 目录名 | `^(\d+)级-`                             |
| `lesson_num`  | 文件名 | `第(\d+)讲`                              |
| `lesson_name` | 文件名 | `第\d+讲\s+(.+)\.pdf$`                   |
| `grade`       | 推导  | `ceil(level / 2)` → 1-2级=1年级，3-4级=2年级… |
| `semester`    | 推导  | `level % 2 == 1` → 1（上），else → 2（下）    |


**跳过规则：** 文件名含 `参考答案` 的 PDF 直接跳过。

---

## 三、每个 PDF 的数据流

```text
原始 PDF（一讲）
  ↓ step1
  page_01.png … page_N.png         ← 300 DPI 全页图
  img_p02_0.png … img_pXX_n.png    ← 嵌入图片 + 页内坐标记录

  ↓ step2（逐页送 SimpleTex）
  page_01_latex.md … page_N_latex.md   ← LaTeX + 中文混排 Markdown

  ↓ step3（全讲合并送 DeepSeek-V3 一次）
  lesson.json  ← 结构化 JSON，字段对应 pre_ 表

  ↓ step4
  图片本地保存 → 相对路径回填到 lesson.json 各题 image_path 字段
  QR 码 → pyzbar 解码 → answer_qr_url 字段

  ↓ step5
  写库：pre_source_lessons / pre_lecture_kp / pre_lecture_methods / pre_questions
```

---

## 四、DeepSeek 解析输出的 JSON 结构

```json
{
  "lesson": {
    "lesson_name": "第3讲 植树问题",
    "knowledge_guide": "...",
    "kp_list": [
      { "seq": 1, "title": "两端都种", "content_latex": "..." }
    ],
    "methods": [
      {
        "seq": 1,
        "title": "好方法1：线段法",
        "example": {
          "stem_latex": "...",
          "image_placeholder": "img_p03_0",
          "solution_latex": "...",
          "mindmap_placeholder": "img_p03_1"
        },
        "practices": [
          {
            "seq": 1,
            "stem_latex": "...",
            "image_placeholder": "img_p04_0",
            "answer_qr_placeholder": "img_p04_1"
          }
        ]
      }
    ],
    "challenges": [
      { "seq": 1, "stem_latex": "...", "image_placeholder": "img_p06_0" }
    ]
  }
}
```

---

## 五、关键实现决策


| 决策点            | 选择                                        | 理由                                                   |
| -------------- | ----------------------------------------- | ---------------------------------------------------- |
| SimpleTex 调用粒度 | **按整页**送入                                 | 避免手动切割，SimpleTex 内置 layout 检测                        |
| DeepSeek 调用粒度  | **全讲合并**（所有页拼一次）                          | 一讲约 10-20 页，上下文不超限，结构更完整                             |
| 图片归属判断         | 坐标就近匹配题目文字块                               | PyMuPDF 提供精确坐标                                       |
| 断点续处理          | `pre_source_lessons.stage` 字段驱动           | `ocr_done` / `parsed` / `images_done` / `db_written` |
| 数据库连接          | Python `psycopg2` 直连，同一实例 PBL_PREP Schema | 与 PBL_STD 同实例，`search_path` 区分                       |
| 图片存储           | **本地文件路径**（预处理阶段）                         | pipeline 无 CDN 依赖；审核通过同步 PBL_STD 时再上传 CDN            |


---

## 六、运行方式

```bash
# 处理单个 PDF（手动指定元信息）
python main.py --file "学而思秘籍/1级/3年级/第05讲_植树问题.pdf"

# 批量处理整个 level 目录（自动解析 grade/lesson_num）
python main.py --dir "学而思秘籍/1级/" --material "学而思秘籍" --level 1
```

---

## 七、已确认事项


| #   | 问题           | 确认结果                            |
| --- | ------------ | ------------------------------- |
| 1   | 图片是否必须云端地址   | **否**，本地路径；同步 PBL_STD 时再上 CDN   |
| 2   | PBL_PREP 数据库 | **同一 PostgreSQL 实例，不同 Schema**  |
| 3   | PDF 文件名规律    | **有规律**，目录层级：`级/年级/第XX讲_名称.pdf` |


---

## 八、依赖清单

```text
PyMuPDF==1.24.5
Pillow==10.3.0
pyzbar==0.1.9
requests==2.32.3
psycopg2-binary==2.9.9
python-dotenv==1.0.1
```

