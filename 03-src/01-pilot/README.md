# 奥数 Pipeline · 技术预研

> 目标：通过小规模样本测试，确定每个 Pipeline Stage 的最优模型和工具，输出有数据支撑的技术选型报告。
> 预计工期：7个工作日

---

## 预研范围

| 预研方向 | 对比选项 | 核心指标 |
|---------|---------|---------|
| S1 PDF/文本提取 | pdfplumber vs PyMuPDF vs MathPix vs Claude Vision | 文字准确率、公式识别率、图形检出率 |
| S2 题目分割 | DeepSeek-V3 vs Claude Haiku vs Qwen-Turbo | 题目边界 F1、子题识别率 |
| S3 Skill 标注 | DeepSeek-V3 vs Claude Sonnet | Top-1/Top-3 准确率、置信度校准 |
| S4 LaTeX 标准化 | DeepSeek-V3 vs Claude Haiku | LaTeX 语法有效率、数学表达准确率 |
| S5 几何图形 | Claude Vision / GPT-4o Vision TikZ 生成 | 简单图形成功率、SVG 渲染通过率 |

---

## 7日执行计划

```
Day 1  环境搭建 + 样本准备
       ├── 安装依赖（pip install -r requirements.txt）
       ├── 配置 .env（各模型 API Key）
       ├── 从每套材料各抽样 3-5 个文件放入 samples/
       └── 人工标注 Ground Truth（100道题 + 30个几何图形）

Day 2  S1 文本提取测试
       ├── 文字版 PDF：python tests/stage1_extraction/test_pdfplumber.py
       ├──            python tests/stage1_extraction/test_pymupdf.py
       └── 扫描版 PDF：python tests/stage1_extraction/test_mathpix.py
                       python tests/stage1_extraction/test_claude_vision.py

Day 3  S5 几何图形测试
       ├── python tests/stage5_geometry/test_figure_extract.py
       ├── python tests/stage5_geometry/test_tikz_gen.py
       └── python tests/stage5_geometry/test_svg_render.py

Day 4  S2 题目分割测试
       ├── python tests/stage2_segmentation/test_deepseek.py
       ├── python tests/stage2_segmentation/test_claude_haiku.py
       └── python tests/stage2_segmentation/test_qwen_turbo.py

Day 5  S3 Skill 标注测试（最关键）
       ├── python tests/stage3_tagging/test_deepseek_v3.py
       └── python tests/stage3_tagging/test_claude_sonnet.py

Day 6  S4 LaTeX 标准化测试
       ├── python tests/stage4_latex/test_deepseek_v3.py
       └── python tests/stage4_latex/test_claude_haiku.py

Day 7  汇总评估 + 技术选型
       └── python evaluation/compare.py   → report/tech-selection.md
```

---

## 目录结构

```
pilot/
├── samples/
│   ├── text_pdf/              # 可选中文本 PDF（每套材料 3-5 个文件）
│   ├── scanned_pdf/           # 扫描版 PDF
│   ├── word_files/            # Word 文档
│   └── ground_truth/
│       ├── questions.json     # 人工标注：正确题目分割（100道）
│       ├── skills.json        # 人工标注：正确 Skill 映射
│       ├── latex.json         # 人工标注：标准 LaTeX 表达式（100条）
│       └── figures/           # 几何图形样本（30个）
│           ├── fig_001.png
│           └── fig_001.tikz   # 参考 TikZ（用于评分）
│
├── tests/
│   ├── stage1_extraction/     # Day 2
│   ├── stage2_segmentation/   # Day 4
│   ├── stage3_tagging/        # Day 5
│   ├── stage4_latex/          # Day 6
│   └── stage5_geometry/       # Day 3
│
├── evaluation/
│   ├── metrics.py             # 评估指标计算函数
│   └── compare.py             # 汇总对比报告生成
│
├── report/
│   └── tech-selection.md      # Day 7 输出的最终选型报告
│
├── config.py                  # API Keys + 路径配置
├── requirements.txt
└── .env                       # 不提交 git
```

---

## 用户配合项（Ground Truth 标注）

| 任务 | 数量 | 预计时间 |
|------|------|---------|
| 从样本文件中挑选 100 道题（覆盖各年级/各模块） | 100题 | ~2小时 |
| 确认每道题正确的 Skill ID（对照 skills.json） | 100题 | ~3小时 |
| 挑选 30 个几何图形（20简单+10复杂），做类型标注 | 30个 | ~1小时 |

Ground Truth 格式参见 `samples/ground_truth/` 下的模板文件。

---

## 最终输出

`report/tech-selection.md` 包含：
- 各 Stage 模型对比数据表
- 成本 × 准确率矩阵
- 最终技术选型决策
- 全量 Pipeline 成本预测
