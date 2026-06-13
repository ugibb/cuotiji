# PDF 教材预处理 Pipeline

将学而思秘籍等扫描件 PDF 预处理为结构化数据，写入 `PBL_PREP` 数据库 `pre_` 系列表。

技术方案详见：`[02-doc/02-design/085-pdf-preprocessing-pipeline.md](../../02-doc/02-design/085-pdf-preprocessing-pipeline.md)`

## 目录结构

```
04-pipeline/
├── run.sh              # Pipeline 启动脚本（推荐）
├── compare.sh          # OCR 查看 / 技术选型报告
├── preview.sh          # OCR 预览 HTML 生成 / 本地服务
├── .env                # 敏感配置（不提交）
├── .env.example        # 配置模板
├── requirements.txt    # Python 依赖
├── input/              # 原始 PDF 输入目录
├── output/             # 中间产物（按讲次缓存）
│   └── L11_lesson01/
│       ├── pages/      # step1：拆页 PNG
│       ├── images/     # step1：嵌入图片
│       ├── ocr/        # step2：OCR Markdown
│       └── lesson.json # step3：结构化 JSON
└── src/
    ├── main.py         # 入口，编排 step1-5
    ├── step1_split.py  # PDF 拆页 + 图片提取
    ├── step2_ocr.py    # SimpleTex OCR
    ├── step3_parse.py  # DeepSeek 结构解析
    ├── step4_images.py # 图片分类 + QR 解码
    ├── step5_db.py     # 写入数据库
    └── utils/
        ├── config.py   # 配置项
        └── compare.py  # OCR 统计 / 技术选型报告
```

## 环境准备

```bash
cd 03-src/04-pipeline

# 1. 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 2. 安装依赖
pip install -r requirements.txt

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 SIMPLETEX_TOKEN / DEEPSEEK_API_KEY / PREP_DATABASE_URL
```

### 环境变量说明


| 变量                  | 说明                                                 |
| ------------------- | -------------------------------------------------- |
| `SIMPLETEX_TOKEN`   | SimpleTex OCR API Token                            |
| `DEEPSEEK_API_KEY`  | DeepSeek API Key（结构解析）                             |
| `PREP_DATABASE_URL` | MySQL 连接串，如 `mysql://user:pass@host:3306/PBL_PREP` |


## 脚本执行命令

推荐使用 `run.sh`，会自动激活虚拟环境并设置 `PYTHONPATH`。

```bash
# 查看帮助
./run.sh --help

# 处理单个 PDF（默认执行全部步骤 step1~5）
./run.sh -f "input/11级-xxx/第1讲 分数裂项.pdf"

# 批量处理目录（递归，自动跳过「参考答案」）
./run.sh -d input

# 仅执行某一步
./run.sh -f "input/11级-xxx/第1讲 分数裂项.pdf" -s 1
./run.sh -f "input/11级-xxx/第1讲 分数裂项.pdf" -s 2
./run.sh -f "input/11级-xxx/第1讲 分数裂项.pdf" -s 3
./run.sh -f "input/11级-xxx/第1讲 分数裂项.pdf" -s 4
./run.sh -f "input/11级-xxx/第1讲 分数裂项.pdf" -s 5

# 执行连续步骤
./run.sh -f "input/11级-xxx/第1讲 分数裂项.pdf" -s 2-4

# 执行多个不连续步骤
./run.sh -f "input/11级-xxx/第1讲 分数裂项.pdf" -s 1,3,5
```

### 步骤说明


| 步骤  | 说明                       | 输出                                     |
| --- | ------------------------ | -------------------------------------- |
| 1   | PDF 拆页 + 嵌入图片提取          | `output/Lxx_lessonxx/pages/`、`images/` |
| 2   | SimpleTex 逐页 OCR         | `output/Lxx_lessonxx/ocr/page_XX.md`   |
| 3   | DeepSeek 结构解析            | `output/Lxx_lessonxx/lesson.json`      |
| 4   | 图片分类（附图/思维导图/二维码）+ QR 解码 | 内存结果，供 step5 使用                        |
| 5   | 写入 `PBL_PREP` 数据库        | `pre_source_lessons` 等表                |


### 断点续跑

各步骤结果会缓存到 `output/` 目录。跳过已完成的步骤时，后续步骤会自动读取缓存：

```bash
# 例如：step1 已完成，从 OCR 开始
./run.sh -f "input/11级-xxx/第1讲 分数裂项.pdf" -s 2-5

# 仅重跑数据库写入
./run.sh -f "input/11级-xxx/第1讲 分数裂项.pdf" -s 5
```

若缺少前置步骤的输出，会提示类似 `step2 缺少 page_01.md，请先执行 step2`。

## PDF 文件命名要求

Pipeline 从文件路径自动解析元信息，需满足：

- **目录名**：`N级-...`（如 `11级-2022版《学而思秘籍 小学数学思维培养》`）
- **文件名**：`第N讲 名称.pdf`（如 `11级-...第1讲 分数裂项.pdf`）
- 含「参考答案」的 PDF 会自动跳过

输出目录按 `L{level}_lesson{num}` 命名，例如 `L11_lesson01`。

## preview.sh — OCR 可视化验证

扫描 `output/*/ocr/*.md`，生成可直接打开的 `output/preview.html`。

```bash
# 生成 preview.html（双击即可浏览，内容内嵌无需服务器）
./preview.sh

# 启动本地服务（支持 ⌘S 保存修改回 .md 文件）
./preview.sh serve
# → http://127.0.0.1:7788/preview.html
```

OCR 完成后重新执行 `./preview.sh` 即可刷新页面列表。

## compare.sh — OCR 查看与报告

```bash
# 列出已处理课次
./compare.sh --list

# 生成 OCR 输出统计报告 → report/ocr-stats.md
./compare.sh --ocr

# 合并输出指定课次全部 OCR 页到终端
./compare.sh --dump L11_lesson01

# 生成技术选型报告 → report/tech-selection.md（需 results/*.json）
./compare.sh
```

## 直接调用 Python（可选）

不通过 `run.sh` 时，需手动设置环境：

```bash
cd src
export PYTHONPATH="$(pwd):$(pwd)/utils"
python3 main.py -f "../input/11级-xxx/第1讲 分数裂项.pdf"
python3 main.py -d "../input" -s 2-4
python3 -m utils.compare --list
python3 -m utils.compare --ocr
```

