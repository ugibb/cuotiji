# 奥数知识体系与题库 · 完整架构设计

> 版本：v1.0 · 日期：2026-05-15

---

## 一、两套系统分离部署（版权隔离）

```text
┌──────────────────────────────────────────────────────────────┐
│  【预处理系统】  内网/本地部署，含版权原材料，不对外              │
│                                                              │
│  原始材料 (31GB PDF/Word)                                     │
│       ↓ Pipeline                                             │
│  材料暂存库（含原文内容）                                       │
│  ├─ source_lessons（讲义索引）                                │
│  ├─ staging_questions（AI提取的原始题目）                      │
│  └─ material_topics（各材料自有知识分类）                       │
│       ↓ 人工审核                                              │
│  审核通过 → 自动 sync API ──────────────────────────────────┐ │
└────────────────────────────────────────────────────────────┼─┘
                                                             ↓
┌──────────────────────────────────────────────────────────────┐
│  【标准库系统】  生产服务器，无版权风险，供学生端应用               │
│                                                              │
│  knowledge_modules / topics / skills                         │
│  questions + question_skill_map（LaTeX重写，无原文）           │
│  学生数据：mastery / milestones / plan / wrong answers        │
└──────────────────────────────────────────────────────────────┘
```

**版权隔离原则：同步只传 LaTeX 内容，不传原文截图或摘录。**

---

## 二、原型屏幕 → 数据需求对照


| 屏幕 ID            | 页面名    | 核心数据需求                                        |
| ---------------- | ------ | --------------------------------------------- |
| s-setup          | 初始设置   | grade, exam_date, goal_type, competition_name |
| s-intake         | AI 问卷  | 4题前测（学习经历/弱点/时间/信心） → onboarding_answers      |
| s-assessment     | 诊断测试   | 15道题按 topic 均衡抽取，结果写 assessment_results       |
| s-report         | 能力报告   | 雷达图（Topic粒度，6维）+ AI校正对话                       |
| s-plan-preview   | 计划预览   | 里程碑列表 M1/M2/M3 + 日期范围 + 每日时长                  |
| s-home           | 首页执行态  | 倒计时 + 当前里程碑进度 + 今日任务 + 训练日历                   |
| s-detail         | 项目进度看板 | 里程碑进度条 + 知识点热力图（Skill 粒度）                     |
| s-retro          | 里程碑复盘  | 成就卡 + AI 3问 + 打卡率 + 分数前后对比                    |
| s-chapter→camera | 拍照上传   | 选 topic → 拍照批改                                |
| s-wrong/correct  | 批改结果   | 根因诊断 → skill_map 更新                           |


---

## 三、标准库系统数据库表结构

### 3.1 标准知识体系（静态骨架，从 skills.json 导入）

```sql
-- 七大模块
CREATE TABLE knowledge_modules (
  id              VARCHAR(4)  PRIMARY KEY,   -- M1~M7
  name            VARCHAR(50) NOT NULL,
  description     TEXT,
  exam_weight     SMALLINT,                  -- 升学考权重 1-5
  olympiad_weight SMALLINT                   -- 竞赛权重 1-5
);

-- 主题节点（35个，每模块 4-8 个）
CREATE TABLE knowledge_topics (
  id          VARCHAR(8)  PRIMARY KEY,       -- T1_1
  module_id   VARCHAR(4)  NOT NULL REFERENCES knowledge_modules(id),
  name        VARCHAR(50) NOT NULL,
  description TEXT,
  grade_start SMALLINT,
  grade_end   SMALLINT,
  difficulty  SMALLINT
);

-- 技能节点（85个，最小学习单元）
CREATE TABLE knowledge_skills (
  id            VARCHAR(10) PRIMARY KEY,     -- S1_1_1
  topic_id      VARCHAR(8)  NOT NULL REFERENCES knowledge_topics(id),
  name          VARCHAR(60) NOT NULL,
  grade_start   SMALLINT,
  grade_end     SMALLINT,
  difficulty    SMALLINT,
  prerequisites VARCHAR(10)[],               -- 前置 Skill IDs
  error_types   TEXT[]                        -- 常见错误分类
);
```

### 3.2 标准题库（LaTeX 重写，无版权风险）

```sql
CREATE TABLE questions (
  id              VARCHAR(50) PRIMARY KEY,   -- Q_juyi_4G_0023
  source_material VARCHAR(20) NOT NULL,      -- 来源（内部追溯用）
  grade           SMALLINT    NOT NULL,
  difficulty      SMALLINT    NOT NULL,      -- 1-5
  stem_latex      TEXT        NOT NULL,
  answer_latex    TEXT,
  solution_latex  TEXT,
  error_hints     TEXT[],
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 题目 ↔ 技能 多对多（一道题可跨多个 Skill）
CREATE TABLE question_skill_map (
  question_id  VARCHAR(50) NOT NULL REFERENCES questions(id),
  skill_id     VARCHAR(10) NOT NULL REFERENCES knowledge_skills(id),
  is_primary   BOOLEAN     DEFAULT true,
  confidence   NUMERIC(4,2),
  PRIMARY KEY (question_id, skill_id)
);
```

### 3.3 用户与项目设置（扩展现有表）

```sql
-- sprint_plans 新增字段
ALTER TABLE sprint_plans ADD COLUMN competition_name VARCHAR(100); -- 华杯小学组
ALTER TABLE sprint_plans ADD COLUMN goal_type        VARCHAR(20);  -- entry|award|top
ALTER TABLE sprint_plans ADD COLUMN target_score     INT;
ALTER TABLE sprint_plans ADD COLUMN overall_score    INT;          -- 诊断综合分 0-100
ALTER TABLE sprint_plans ADD COLUMN overall_level    VARCHAR(20);  -- 初级|中级|高级
ALTER TABLE sprint_plans ADD COLUMN total_days       INT;          -- 计划总天数
ALTER TABLE sprint_plans ADD COLUMN daily_minutes    INT;          -- 每日时长（分钟）

-- students 新增入学问卷答案
ALTER TABLE students ADD COLUMN onboarding_answers JSONB;
-- {
--   "prior_years": "1-2年",
--   "weak_areas": "整除/余数/数论",
--   "weekly_hours": "3-5小时",
--   "confidence": "有一点基础，需要系统强化"
-- }
```

### 3.4 诊断测试（新增）

```sql
-- 诊断测试会话（入学 15 题测试）
CREATE TABLE assessment_sessions (
  id             SERIAL      PRIMARY KEY,
  student_id     INT         NOT NULL REFERENCES students(id),
  sprint_plan_id INT         REFERENCES sprint_plans(id),
  question_count INT         DEFAULT 15,
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  overall_score  INT,
  overall_level  VARCHAR(20)
);

-- 每道诊断题答题结果
CREATE TABLE assessment_results (
  id                       SERIAL      PRIMARY KEY,
  session_id               INT         NOT NULL REFERENCES assessment_sessions(id),
  question_id              VARCHAR(50) REFERENCES questions(id),
  skill_id                 VARCHAR(10) NOT NULL REFERENCES knowledge_skills(id),
  student_answer           VARCHAR(10),
  correct_answer           VARCHAR(10),
  is_correct               BOOLEAN,
  topic_score_contribution NUMERIC(5,2)
);
```

### 3.5 里程碑（新增 — 原型核心概念）

```sql
-- 每个冲刺计划包含 2-4 个里程碑（M1/M2/M3…）
CREATE TABLE milestones (
  id              SERIAL       PRIMARY KEY,
  sprint_plan_id  INT          NOT NULL REFERENCES sprint_plans(id),
  seq             SMALLINT     NOT NULL,          -- 1=M1, 2=M2, 3=M3
  name            VARCHAR(100) NOT NULL,          -- "整除与余数"
  focus_topic_ids VARCHAR(8)[],
  focus_skill_ids VARCHAR(10)[],
  start_date      DATE         NOT NULL,
  end_date        DATE         NOT NULL,
  duration_days   INT,
  score_before    INT,                            -- 初始诊断分
  score_target    INT,                            -- 目标分（如 45→75）
  score_after     INT,                            -- 复盘实际分
  status          VARCHAR(20)  DEFAULT 'pending', -- pending|in_progress|completed
  completed_at    TIMESTAMPTZ,
  UNIQUE (sprint_plan_id, seq)
);

-- 里程碑复盘（对应 s-retro 页面）
CREATE TABLE milestone_retros (
  id                   SERIAL      PRIMARY KEY,
  milestone_id         INT         NOT NULL UNIQUE REFERENCES milestones(id),
  checkin_days         INT,
  task_completion_rate NUMERIC(4,2),              -- 任务完成率 0-1
  score_before         INT,
  score_after          INT,
  q1_memorable_topic   TEXT,                      -- Q1：印象最深的题/知识点
  q2_mastery_rating    SMALLINT,                  -- Q2：自评 1-4（4成/5-6成/7-8成/9成+）
  q3_next_feeling      VARCHAR(50),               -- Q3：进入下阶段心情
  achievement_sent     BOOLEAN     DEFAULT false, -- 成就卡是否已推送家长
  created_at           TIMESTAMPTZ DEFAULT now()
);
```

### 3.6 学生能力画像（扩展）

```sql
-- student_skill_mastery 新增分数追踪
ALTER TABLE student_skill_mastery ADD COLUMN initial_score INT;  -- 诊断初始分
ALTER TABLE student_skill_mastery ADD COLUMN target_score  INT;  -- 里程碑目标分
ALTER TABLE student_skill_mastery ADD COLUMN current_score INT;  -- 当前实时分

-- student_topic_score（原型雷达图是 Topic 粒度，新增）
CREATE TABLE student_topic_score (
  student_id INT        NOT NULL REFERENCES students(id),
  topic_id   VARCHAR(8) NOT NULL REFERENCES knowledge_topics(id),
  score      INT,                                 -- 0-100
  trend      SMALLINT,                            -- +1上升 / 0持平 / -1下降
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (student_id, topic_id)
);
```

### 3.7 训练计划（扩展）

```sql
-- training_plans 关联里程碑
ALTER TABLE training_plans ADD COLUMN milestone_id INT REFERENCES milestones(id);

-- 每日任务最小单元（知识体系驱动）
CREATE TABLE training_plan_items (
  id           SERIAL      PRIMARY KEY,
  plan_id      INT         NOT NULL REFERENCES training_plans(id),
  skill_id     VARCHAR(10) NOT NULL REFERENCES knowledge_skills(id),
  question_id  VARCHAR(50) REFERENCES questions(id),
  item_type    VARCHAR(20),  -- new_practice|review|challenge|weak_repair
  order_num    SMALLINT,
  completed    BOOLEAN     DEFAULT false,
  completed_at TIMESTAMPTZ
);
```

### 3.8 错题与根因

```sql
-- 错题挂钩 Skill（根因诊断后写入）
CREATE TABLE wrong_answer_skill_map (
  problem_id      INT         NOT NULL REFERENCES problems(id),
  skill_id        VARCHAR(10) NOT NULL REFERENCES knowledge_skills(id),
  root_cause_type VARCHAR(30), -- knowledge_gap|understanding_bias|calculation_slip|reading_error
  diagnosed_at    TIMESTAMPTZ,
  PRIMARY KEY (problem_id, skill_id)
);
```

---

## 四、知识体系与学生端功能的映射关系

```text
knowledge_topics / skills
        │
        ├──[assessment_results]─────► 诊断测试
        │   抽题：每 topic 抽 2-3 道     结果 → student_topic_score
        │
        ├──[milestones]─────────────► 里程碑规划
        │   弱 topic → M1 重点突破        中等 → M2 强化
        │   按 topic_score 排序           强 topic → M3 冲刺
        │
        ├──[student_skill_mastery]──► 能力画像热力图
        │   Skill 节点颜色 = mastery      Topic 雷达图 = topic_score
        │
        ├──[training_plan_items]────► 今日任务
        │   mastery=0/1 → 新练习          遗忘曲线到期 → 复习
        │   按 grade 筛题目               弱项 → weak_repair
        │
        └──[wrong_answer_skill_map]─► 错题集
            根因诊断后写入                触发 mastery 降级
                                         自动插入 weak_repair 任务

反馈回路：错题根因 → mastery/score 更新 → 训练计划重新调度
```

---

## 五、预处理系统数据库表

### 5.1 原始材料索引

```sql
-- grade 与 level 二选一（年级制 vs 学而思秘籍 12 级制）
CREATE TABLE source_lessons (
  id           SERIAL      PRIMARY KEY,
  material_set VARCHAR(20) NOT NULL,   -- xueersi_wb|mimi|juyi|zhoujihua|renhua|jiajia|mutou|gaosi
  grade        SMALLINT,               -- 年级制 1-6；学而思秘籍为 NULL
  level        SMALLINT,               -- 学而思秘籍 1-12；其他为 NULL
  semester     VARCHAR(10),            -- 上|下|NULL
  lesson_num   SMALLINT,
  lesson_name  VARCHAR(200),
  file_path    VARCHAR(500),
  file_type    VARCHAR(10),            -- pdf|doc|docx|ppt
  is_scanned   BOOLEAN     DEFAULT false,
  stage        VARCHAR(20) DEFAULT 'pending',
  -- pending|extracted|segmented|tagged|latex_done|done
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### 5.2 各材料自有知识分类

```sql
CREATE TABLE material_topics (
  id            SERIAL      PRIMARY KEY,
  material_set  VARCHAR(20) NOT NULL,
  grade         SMALLINT,
  level         SMALLINT,
  topic_name    VARCHAR(200) NOT NULL,  -- 如"第5周 周期问题"
  description   TEXT,
  std_skill_ids VARCHAR(10)[],          -- 人工审核后映射的标准 Skill IDs
  mapped_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

### 5.3 暂存题目

```sql
-- 好方法模块（每讲内的解题方法，对应讲义"好方法 N"章节）
CREATE TABLE staging_lecture_methods (
  id           SERIAL       PRIMARY KEY,
  lesson_id    INT          NOT NULL REFERENCES source_lessons(id),
  seq          SMALLINT     NOT NULL,              -- 1=好方法1, 2=好方法2...
  title        VARCHAR(100) NOT NULL,              -- "＂椅子数＂巧算"
  summary      TEXT,                              -- 方法核心思路一句话
  created_at   TIMESTAMPTZ  DEFAULT now(),
  UNIQUE (lesson_id, seq)
);

-- 讲义内部知识点（本讲的知识分类，如"一、等差数列求和公式"）
-- 注意：这是讲义级别的分类，不等同于全局 knowledge_skills 体系
CREATE TABLE staging_lecture_kp (
  id            SERIAL       PRIMARY KEY,
  lesson_id     INT          NOT NULL REFERENCES source_lessons(id),
  seq           SMALLINT     NOT NULL,
  title         VARCHAR(200) NOT NULL,
  content_latex TEXT,
  created_at    TIMESTAMPTZ  DEFAULT now(),
  UNIQUE (lesson_id, seq)
);

CREATE TABLE staging_questions (
  id                SERIAL      PRIMARY KEY,
  lesson_id         INT         REFERENCES source_lessons(id),
  material_topic_id INT         REFERENCES material_topics(id),
  method_id         INT         REFERENCES staging_lecture_methods(id),
  question_type     VARCHAR(10) NOT NULL DEFAULT '练习',
  -- 例题|练习|巅峰
  material_set      VARCHAR(20) NOT NULL,
  grade             SMALLINT,
  level             SMALLINT,
  seq_in_lesson     SMALLINT,
  difficulty_raw    VARCHAR(20),
  difficulty        SMALLINT,
  stem_raw          TEXT,               -- 原文（仅内部，含版权）
  answer_raw        TEXT,
  solution_raw      TEXT,
  stem_latex        TEXT,               -- LaTeX 重写（可对外同步）
  answer_latex      TEXT,
  solution_latex    TEXT,
  skill_ids_ai      VARCHAR(10)[],
  skill_confidence  NUMERIC(4,2),
  review_status     VARCHAR(20) DEFAULT 'pending',
  -- pending|approved|rejected|modified
  reviewer_note     TEXT,
  reviewed_at       TIMESTAMPTZ,
  synced_to_std     BOOLEAN     DEFAULT false,
  synced_at         TIMESTAMPTZ,
  std_question_id   VARCHAR(50),
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 题目与讲义内部知识点的多对多关联（一道题可跨多个知识点）
CREATE TABLE staging_question_kp_map (
  question_id  INT NOT NULL REFERENCES staging_questions(id),
  kp_id        INT NOT NULL REFERENCES staging_lecture_kp(id),
  PRIMARY KEY (question_id, kp_id)
);

-- 材料特有知识点（超出现有 85 个 Skill 范围）
CREATE TABLE staging_skill_gaps (
  id              SERIAL      PRIMARY KEY,
  material_set    VARCHAR(20),
  description     TEXT,
  question_count  INT,
  suggested_skill VARCHAR(10),
  resolution      VARCHAR(30) DEFAULT 'pending',
  -- merge_into_existing|create_new_skill|ignore
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 六、预处理 → 标准库 同步协议

```text
审核通过触发
      ↓
POST {STD_API_URL}/api/sync/question
{
  "skill_ids": ["S2_3_2"],
  "grade": 4,
  "difficulty": 3,
  "stem_latex": "...",
  "answer_latex": "...",
  "solution_latex": "...",
  "error_hints": [...],
  "source_material": "juyi"
}
      ↓
标准库写入 questions + question_skill_map，返回 std_question_id
      ↓
预处理库更新 synced_to_std=true, std_question_id
```

---

## 七、Pipeline 技术方案

### 7.1 材料范围（1-6年级）


| 代号           | 名称       | 范围             |
| ------------ | -------- | -------------- |
| `xueersi_wb` | 学而思大白本   | 1-6年级          |
| `mimi`       | 学而思秘籍    | 1-10级（对应1-6年级） |
| `juyi`       | 举一反三 A/B | 1-6年级          |
| `zhoujihua`  | 奥数周计划    | 1-6年级          |
| `renhua`     | 仁华奥数     | 仅1-6年级         |
| `jiajia`     | 家家学      | 2-6年级          |
| `mutou`      | 木头马      | 1-6年级          |
| `gaosi`      | 高斯爱提分    | 3-6年级          |


学而思秘籍级别↔年级映射（待人工确认）：1-2级≈1年级 · 3-4级≈2年级 · 5-6级≈3年级 · 7-8级≈4年级 · 9-10级≈5年级

### 7.2 Pipeline 各阶段


| Stage       | 工具                     | 说明                                         | 估算耗时  |
| ----------- | ---------------------- | ------------------------------------------ | ----- |
| 0 预扫描       | Python 本地              | 生成 source_lessons 清单，标记 is_scanned         | 1-2小时 |
| 1 文本提取      | pdfplumber + Vision 模型 | 文字PDF直提（免费）；扫描PDF逐页 Vision                 | 3-5天  |
| 2 题目分割      | 轻量 LLM                 | 识别题目边界，提取题干/答案/解析                          | 1-2天  |
| 3 Skill 标注  | 推理 LLM                 | 对照 skills.json 85条，打 skill_id + confidence | 1-2天  |
| 4 LaTeX 标准化 | 轻量 LLM                 | 数学表达式转标准 LaTeX                             | 1天    |
| 5 校验+同步     | Python 本地              | 格式校验 + 触发 sync_to_std                      | 2-3小时 |


#### Stage 1 · 文本提取模型选型


| 方案                      | 适用场景       | 数学识别         | 中文  | 成本参考      |
| ----------------------- | ---------- | ------------ | --- | --------- |
| **pdfplumber（免费）**      | 可选中文本的 PDF | —            | 好   | $0        |
| **MathPix API** ⭐       | 扫描件、手写数学公式 | 专业级，直出 LaTeX | 好   | ~$0.004/页 |
| **Claude Haiku Vision** | 扫描件，图文混排   | 良好           | 好   | ~$25/全量   |
| **Google Document AI**  | 结构化文档批量    | 弱            | 好   | ~$15/全量   |
| **Nougat（Meta，本地）**     | 学术 PDF     | 较好           | 弱   | $0（需GPU）  |


> 推荐策略：先用 `pdfplumber` 尝试提取，文字版直接通过；扫描件走 **MathPix**（数学公式 OCR 专项，Stage 4 LaTeX 标准化工作量减半）。

#### Stage 1 后处理规则（MathPix 输出清洗）

基于学而思秘籍第15讲 before/after 人工对比，归纳两层处理策略：

##### 规则层（正则/关键词，自动执行）


| 规则                    | 匹配模式                                                        | 动作                         |
| --------------------- | ----------------------------------------------------------- | -------------------------- |
| 封面/目录/广告页过滤           | 正文起始标志前的内容（`知识导引`/第一道例题前）；含"年教龄""教学风格""系列图书""APP扫码"等关键词的段落块 | 整块删除                       |
| APP 宣传语删除             | `APP 扫码观看知识点典题精讲`、`学习笔记`、`举一反三.*拍照批改`、`挑战自我.*拍照批改`          | 行删除                        |
| 图片链接删除                | `!\[.*?\]\(https://cdn\.mathpix\.com/.*?\)`                 | 行删除                        |
| `\begin{figure}` 环境删除 | 思路导图图片容器                                                    | 块删除                        |
| 章节标题合并                | `\section*{好方法 N}` 后紧跟非空文本行                                 | 合并为 `\section*{好方法 N：副标题}` |
| 公式末尾中文句号              | `$...$` 或 `aligned` 环境末尾的 `。`                               | 删除                         |


##### 模型层（LLM 辅助，处理规则层无法覆盖的情况）


| 问题类型      | 典型样例                                    | 处理方式                         |
| --------- | --------------------------------------- | ---------------------------- |
| 高频 OCR 错字 | `秘鿁→秘籍`、`计䇗→计算`、`知识륵제→知识导引`、`典题精妌→典题精讲` | 错字词典优先，兜底 LLM 上下文校正          |
| 截断公式补全    | `(n-2)(n-1)n=\frac{1}{4}(n-2)(n-` 跨行断开  | 检测 `aligned` 末行不完整时触发 LLM 补全 |
| 解题步骤结构化   | 多种解法步骤散落正文，顺序混乱                         | LLM 整理为规范 `aligned` 块        |
| 解析标注统一    | `【解析】` 有时在 `\section*{}` 内、有时在正文        | 统一为 `\section*{【解析】}`        |


> **处理比例估算**：规则层可处理约 70% 噪声（删除类），LLM 处理约 25% 修复类，剩余 5% 公式截断补全需人工抽检确认数学逻辑。

---

#### Stage 2 · 题目分割模型选型


| 方案                   | 中文能力     | 成本（/M tokens）         | 备注                 |
| -------------------- | -------- | --------------------- | ------------------ |
| **Claude Haiku 4.5** | 好        | $0.80 in / $4 out     | 当前方案               |
| **DeepSeek-V3** ⭐    | 极好（中文优化） | $0.27 in / $1.10 out  | ~Haiku 的 1/3 成本    |
| **Gemini 2.0 Flash** | 好        | $0.075 in / $0.30 out | 最便宜，测试中文切割质量后决定    |
| **Qwen-Turbo**（阿里云）  | 极好       | ¥0.3/M                | 国内直连，无需代理，小学数学语境最强 |


> 推荐：**DeepSeek-V3**（成本低 + 中文强）或 **Qwen-Turbo**（国内预处理环境首选）。

#### Stage 2 输出格式 · 讲义 JSON Schema

> **作用域说明**：此 Schema 仅描述**预处理系统**的中间格式，存储于 `staging_`* 表中。
> `lecture`、`methods`、`knowledge_points`、`question_type` 均为材料特有概念，**不同步到标准库**。
> 同步至标准库时只传 `stem_latex`、`answer_latex`、`solution_latex`、`skill_ids`，见 § 六。

Stage 2 分割后，每个讲义输出一个 JSON 文件，写入 `pipeline/data/stage2_questions/{material_set}/{lesson_id}.json`。

##### 讲义层级结构（预处理系统专用）

```text
讲（lecture）                            ← staging: source_lessons
├── 知识导引（knowledge_intro）           ← staging: source_lessons.description
├── 知识点梳理（knowledge_points[]）      ← staging: staging_lecture_kp
└── 好方法（methods[]）                   ← staging: staging_lecture_methods
    └── questions[]                       ← staging: staging_questions
```

##### questions 为核心实体，关联三个维度

每道题必须携带以下关联字段，供写入 `staging_questions` 时建立外键：


| 字段                    | 类型            | 说明                           | 同步标准库 |
| --------------------- | ------------- | ---------------------------- | ----- |
| `lecture_id`          | string        | 所属讲次，格式 `{材料代号}_{级别}_{讲次}`   | ✗     |
| `method_id`           | string | null | 所属好方法，`null` 表示不归属特定方法（如巅峰题） | ✗     |
| `knowledge_point_ids` | string[]      | 关联本讲知识点 ID（多对多），由 LLM 在分割时标注 | ✗     |
| `type`                | enum          | `例题` / `练习` / `巅峰`           | ✗     |
| `stem_latex`          | string        | 题干 LaTeX                     | ✓     |
| `answer_latex`        | string | null | 答案 LaTeX                     | ✓     |
| `solution_latex`      | string | null | 解析 LaTeX                     | ✓     |


##### JSON 示例（第15讲片段）

```json
{
  "lecture": {
    "id": "mimi_12G_L15",
    "title": "第15讲 计算问题综合选讲",
    "material_set": "mimi",
    "grade": null,
    "level": 12
  },
  "knowledge_intro": "1．总结整数类的计算的常用公式；2．借来还去与错位相减思想。",
  "knowledge_points": [
    { "id": "mimi_12G_L15_KP1", "seq": 1, "title": "一、等差数列求和公式",   "content_latex": "和 $=（首项 + 末项）\\times 项数 \\div 2$" },
    { "id": "mimi_12G_L15_KP2", "seq": 2, "title": "二、整数裂项基本公式",   "content_latex": "..." },
    { "id": "mimi_12G_L15_KP3", "seq": 3, "title": "三、其他常用公式",       "content_latex": "..." }
  ],
  "methods": [
    { "id": "mimi_12G_L15_M1", "seq": 1, "title": "＂椅子数＂巧算", "summary": "拆＂椅子数＂，提取公因数" },
    { "id": "mimi_12G_L15_M2", "seq": 2, "title": "＂数列＂巧算",   "summary": "平方差公式，连续自然数的平方和" }
  ],
  "questions": [
    {
      "id": "mimi_12G_L15_Q01",
      "type": "例题",
      "lecture_id": "mimi_12G_L15",
      "method_id": "mimi_12G_L15_M1",
      "knowledge_point_ids": ["mimi_12G_L15_KP3"],
      "stem_latex": "计算：$1981 \\times 198319831983 - 1982 \\times 198119811981$",
      "solution_latex": "...",
      "answer_latex": "198119811981"
    },
    {
      "id": "mimi_12G_L15_Q02",
      "type": "练习",
      "lecture_id": "mimi_12G_L15",
      "method_id": "mimi_12G_L15_M1",
      "knowledge_point_ids": ["mimi_12G_L15_KP3"],
      "stem_latex": "计算：$1594 \\times 15961596 - 1595 \\times 15941594$",
      "solution_latex": null,
      "answer_latex": null
    },
    {
      "id": "mimi_12G_L15_Q19",
      "type": "巅峰",
      "lecture_id": "mimi_12G_L15",
      "method_id": null,
      "knowledge_point_ids": ["mimi_12G_L15_KP2", "mimi_12G_L15_KP3"],
      "stem_latex": "计算：$1 + 2 \\times 2 + 3 \\times 4 + \\cdots + 11 \\times 1024 + 12 \\times 2048$",
      "solution_latex": null,
      "answer_latex": null
    }
  ]
}
```

> **ID 命名规则**：`{材料代号}_{级别}G_L{讲次}_{实体类型}{序号}`，如 `mimi_12G_L15_Q01`、`mimi_12G_L15_KP1`、`mimi_12G_L15_M1`，全局唯一，可跨材料集去重。

---

#### Stage 3 · Skill 标注模型选型（最关键）


| 方案                    | 数学推理               | 成本（/M tokens）        | 备注                            |
| --------------------- | ------------------ | -------------------- | ----------------------------- |
| **Claude Sonnet 4.6** | 强                  | $3 in / $15 out      | 当前方案                          |
| **DeepSeek-V3** ⭐     | 强（数学 benchmark 优秀） | $0.27 in / $1.10 out | 约 Sonnet **1/10 成本**，中文数学理解接近 |
| **GPT-4o**            | 强                  | $2.50 in / $10 out   | 与 Sonnet 相当，略低价               |
| **GPT-4o-mini**       | 中                  | $0.15 in / $0.60 out | 便宜，复杂标注可能出错                   |
| **Qwen-Max**（阿里云）     | 好                  | ¥0.04/千 token        | 小学奥数中文语境最强，国内直连               |


> **执行建议**：Stage 3 正式开跑前，取 20 道样题同时跑 Sonnet 和 DeepSeek-V3，对比 Skill 标注准确率。差距 <5% 则全量用 DeepSeek-V3，Stage 3 成本从 ~~$60 降至 **~~$6**。

#### Stage 4 · LaTeX 标准化模型选型


| 方案                        | LaTeX 质量 | 成本              | 备注                            |
| ------------------------- | -------- | --------------- | ----------------------------- |
| **Claude Haiku 4.5**      | 好        | ~$10            | 当前方案                          |
| **MathPix**（如 Stage 1 已用） | 专业级      | 已含在 Stage 1 费用内 | Stage 1 用 MathPix 则此阶段工作量大幅减少 |
| **DeepSeek-V3**           | 好        | ~$2             | 降本替代                          |


### 7.3 成本估算

#### 方案 A · 全 Claude（保守方案）


| Stage               | 模型                | 预估费用      |
| ------------------- | ----------------- | --------- |
| Stage 1 Vision（扫描件） | claude-haiku-4-5  | ~$25      |
| Stage 2 题目分割        | claude-haiku-4-5  | ~$15      |
| Stage 3 Skill 标注    | claude-sonnet-4-6 | ~$60      |
| Stage 4 LaTeX 标准化   | claude-haiku-4-5  | ~$10      |
| **合计**              |                   | **~$110** |


#### 方案 B · 混合模型（推荐，降本约 70%）


| Stage             | 模型                                 | 预估费用        |
| ----------------- | ---------------------------------- | ----------- |
| Stage 1 文本提取      | pdfplumber（文字版免费）+ MathPix（扫描件）    | ~$10        |
| Stage 2 题目分割      | DeepSeek-V3                        | ~$3         |
| Stage 3 Skill 标注  | DeepSeek-V3（A/B 测试后决定）             | ~$6–18      |
| Stage 4 LaTeX 标准化 | DeepSeek-V3（Stage 1 用 MathPix 可减量） | ~$2         |
| **合计**            |                                    | **~$21–33** |


> Stage 3 若 A/B 测试显示 DeepSeek-V3 准确率不足，可仅对低置信度题目（confidence < 0.7）升级跑一遍 Sonnet，混合成本约 $25–40。

### 7.4 目录结构

```text
pipeline/
├── data/
│   ├── raw/{material_set}/        ← 原始文件（版权材料，不上传）
│   ├── stage1_extracted/
│   ├── stage2_questions/
│   ├── stage3_tagged/
│   ├── stage4_latex/
│   └── output/question_bank.jsonl
├── knowledge/
│   ├── modules-topics.json
│   └── skills.json
├── scripts/
│   ├── stage0_scan.py
│   ├── stage1_extract.py
│   ├── stage2_segment.py
│   ├── stage3_tag.py
│   ├── stage4_latex.py
│   ├── stage5_validate.py
│   └── utils.py
├── sync/sync_to_std.py            ← 审核通过后推送至标准库
├── requirements.txt
└── .env                           ← ANTHROPIC_API_KEY + STD_API_URL
```

---

## 八、执行路径

1. 将各套材料放入 `pipeline/data/raw/{代号}/`
2. 编写全部 stage 脚本 + sync 脚本
3. 运行 Stage 0，确认文件清单识别正确
4. 按材料集 × 年级批次处理，每批抽样复核
5. Stage 3 前先跑 20 道样题确认 Skill 标注准确率
6. 全部处理完 → 入 `staging_questions` → 人工审核
7. 审核通过 → 自动 sync 到标准库

---

## 九、后续任务

- `pipeline/` — 完整预处理 Pipeline 代码（5个 stage 脚本 + sync）
- 标准库 Prisma migration — 新增表：`milestones`、`milestone_retros`、`assessment_sessions`、`assessment_results`、`student_topic_score`、`training_plan_items`、`wrong_answer_skill_map`
- 标准库 Prisma migration — 扩展表：`sprint_plans`、`students`、`training_plans`、`student_skill_mastery`
- 知识体系 JSON 导入脚本（modules-topics.json + skills.json → DB seed）

