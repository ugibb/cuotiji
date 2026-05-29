# 迁移方案（重构版）：模拟数据初始化按 `070-er-model-full.html` 落库

**状态**：待执行  
**目标**：保障初始化数据与 `02-doc/02-design/070-er-model-full.html` 一致  
**核心原则**：

1. 双库隔离：`预处理库` 与 `标准库` 分开部署
2. 小程序只访问标准库
3. 学生域业务表统一 `students_` 前缀
4. 知识体系粒度固定：`7大板块 -> 章节 -> 知识点`

---

## 0. 本次重构相对旧方案的关键变化

- 废弃旧表命名：`assessment_questions`、`intake_results`、`chapter_topics`、`milestones`（无前缀版本）
- 新增并统一到 ER 口径：
  - `students_learning_projects`
  - `students_ability_assessments`
  - `students_assessment_sessions`
  - `students_assessment_results`
  - `students_study_plans`
  - `students_milestones`
  - `students_training_plans`
  - `students_training_plan_items`
  - `students_assignments`
  - `students_problems`
  - `students_ai_dialogues`
  - `question_solution_methods`
  - `assessment_question_pools` + `assessment_pool_question_map`
- `chapters` 归入知识体系兼容层，增加 `knowledge_topic_id`

---

## 1. 数据库与连接配置

### 1.1 建议两个独立数据库

- 标准库（生产，给小程序）
  - `PBL_STD`
- 预处理库（内网审核）
  - `PBL_PREP`

### 1.2 环境变量（服务端）

编辑 `03-src/02-server/.env`：

```env
STD_DATABASE_URL="postgresql://PBL:<password>@123.207.64.65:5432/PBL_STD"
PREP_DATABASE_URL="postgresql://PBL:<password>@123.207.64.65:5432/PBL_PREP"
```

> 小程序 API 服务只用 `STD_DATABASE_URL`。  
> 预处理 Pipeline/审核后台只用 `PREP_DATABASE_URL`。

---

## 2. 初始化范围（按 ER）

### 2.1 标准库初始化（必须）

#### A. 基础身份与项目类型

- `users`
- `students`（支持 1 个家长管理多个学生）
- `project_types`
- `knowledge_systems`

#### B. 知识体系主干（初始化必须有数据）

- `knowledge_modules`：7 条固定板块
- `knowledge_topics`：章节（从教材目录抽取）
- `knowledge_skills`：知识点（可先从章节拆分导入 v1）
- `chapters`：兼容层，带 `knowledge_topic_id`

#### C. 题库与题解

- `questions`
- `question_skill_map`
- `question_solution_methods`（一题多解）

#### D. 评测与计划（学生实例）

- `students_learning_projects`
- `students_ability_assessments`
- `students_assessment_sessions`
- `students_assessment_results`
- `assessment_question_pools`
- `assessment_pool_question_map`
- `students_study_plans`
- `students_milestones`
- `students_training_plans`
- `students_training_plan_items`

#### E. 执行闭环（错题/对话）

- `students_assignments`
- `students_problems`
- `students_dialogues`（历史兼容）
- `students_ai_dialogues`（统一对话）
- `students_review_sessions`
- `students_wrong_answer_skill_map`
- `students_skill_mastery`
- `students_topic_score`

### 2.2 预处理库初始化（必须）

- `source_lessons`
- `material_topics`
- `staging_lecture_methods`
- `staging_lecture_kp`
- `staging_questions`
- `staging_question_kp_map`
- `staging_skill_gaps`

---

## 3. 初始化 SQL 执行顺序（强约束）

### Step 1：标准库建表（不含 seed）

执行：`03-src/02-server/prisma/std_init.sql`

### Step 2：预处理库建表（不含 seed）

执行：`03-src/02-server/prisma/prep_init.sql`

### Step 3：标准库 seed（基础 + 模拟）

执行：`03-src/02-server/prisma/std_seed.sql`

### Step 4：预处理库 seed（教材目录 + staging 示例）

执行：`03-src/02-server/prisma/prep_seed.sql`

---

## 4. 标准库 seed 设计（模拟数据初始化）

### 4.1 知识体系 seed（先于业务表）

1. 插入 7 条 `knowledge_modules`
2. 按教材目录插入 `knowledge_topics`
   - 例如：`10级-...第15讲 同余`
3. 为每个章节插入 `knowledge_skills`（v1 可先 2-5 个/章节）
4. 同步 `chapters`，并写入 `knowledge_topic_id`

### 4.2 题库 seed

从当前 `assessment-data.ts` 的 15 题迁移到：

- `questions`
- `question_skill_map`（至少 1 个主 skill）
- `question_solution_methods`（每题至少 1 条方法）

### 4.3 评测题池 seed（双轨）

- 规则筛题保留（按年级 + 难度）
- 显式题池落库：
  - `assessment_question_pools`：如 `G4_LOW_V1`、`G4_MID_V1`、`G4_HIGH_V1`
  - `assessment_pool_question_map`：池与题关系

### 4.4 学生实例 seed（用于联调）

为默认学生初始化：

- `students_learning_projects`（状态：`assessing` 或 `planning`）
- `students_ability_assessments`（含 `report_data` 快照）
- `students_assessment_sessions/results`
- `students_study_plans`
- `students_milestones`（3个）
- `students_training_plans`（按天）
- `students_training_plan_items`（含 new_practice/review）

### 4.5 统一 AI 对话 seed

新增 `students_ai_dialogues` 示例数据：

- `context_type='assessment_report'`
- `context_type='milestone_retro'`
- `context_type='problem_chat'`

> 其它业务表如需引用，保存 `dialogue_id` 即可。

---

## 5. 预处理库 seed 设计

### 5.1 教材目录初始化

将 `小学奥数_全量文件名称（共31G）.txt` 解析并导入：

- `source_lessons`
  - `material_set`
  - `grade/level`
  - `lesson_num`
  - `lesson_name`
  - `file_path`

### 5.2 staging 示例数据

对每讲可先初始化少量：

- `staging_lecture_methods`
- `staging_lecture_kp`
- `staging_questions`

并默认 `review_status='pending'`。

### 5.3 同步闸门

只允许以下条件进入标准库：

```sql
staging_questions.review_status = 'approved'
AND staging_questions.stem_latex IS NOT NULL
```

同步目标：

- `questions`
- `question_skill_map`
- （可选）`question_solution_methods`

---

## 6. 服务端代码改造清单（按新表名）

### 6.1 Prisma Schema

文件：`03-src/02-server/prisma/schema.prisma`

- 删除/废弃旧临时模型：`AssessmentQuestion`、`IntakeResult`、`ChapterTopic`（若仅为旧 mock 服务）
- 新增/更新模型映射到 `students_*` 命名
- `Chapter` 增加 `knowledgeTopicId` 字段映射 `knowledge_topic_id`

### 6.2 路由调整

- `GET /api/intake/questions`
  - 由 `assessment_question_pools + map + questions` 提供（优先池，兜底规则）
- `POST /api/intake/results/:studentId`
  - 写入：
    - `students_ability_assessments`
    - `students_assessment_sessions`
    - `students_assessment_results`
- `POST /api/training-plans/generate`
  - 写入：
    - `students_study_plans`
    - `students_milestones`
    - `students_training_plans`
    - `students_training_plan_items`
- `GET /api/milestones/:studentId`
  - 查 `students_milestones`

### 6.3 对话服务

新增统一写入：

- `POST /api/ai-dialogues`
  - 写入 `students_ai_dialogues`

---

## 7. 小程序改造清单（与 ER 对齐）

| 页面 | 改造 |
|---|---|
| `pages/onboarding/assessment/index.ts` | 题目改由 `GET /api/intake/questions`（标准库题池） |
| `pages/onboarding/report/index.ts` | 报告数据来自 `students_ability_assessments.report_data` |
| `pages/onboarding/plan/index.ts` | 调用 `POST /api/training-plans/generate`，使用 `students_milestones` |
| `pages/home/index.ts` | 不再调用本地 mock，改查 `students_training_plans` |
| `pages/checkin/problem-detail/index.ts` | 对话优先走 `students_ai_dialogues` |

删除本地 mock 数据源：

- `pages/onboarding/assessment-data.ts`
- `pages/onboarding/mock-plan-data.ts`

---

## 8. 验证清单（必须通过）

### 8.1 标准库结构验证

- `\dt` 可见 `students_*` 表族
- `chapters` 包含 `knowledge_topic_id`
- 可见：
  - `question_solution_methods`
  - `assessment_question_pools`
  - `assessment_pool_question_map`
  - `students_ai_dialogues`

### 8.2 标准库数据验证

- `SELECT COUNT(*) FROM knowledge_modules` = 7
- `SELECT COUNT(*) FROM assessment_question_pools` >= 3（低/中/高）
- `SELECT COUNT(*) FROM questions` >= 15
- `SELECT COUNT(*) FROM question_solution_methods` >= 15

### 8.3 预处理库验证

- `source_lessons` 已导入教材目录
- `staging_questions` 默认 `review_status='pending'`
- 仅 `approved` 数据可同步到标准库

### 8.4 端到端验证

- onboarding：答题 → 报告 → 生成计划
- 首页日历：读取 `students_training_plans`
- 错题对话：有 `students_ai_dialogues` 记录
- 多学生场景：同一 `user_id` 下两个 `students` 数据互不串

---

## 9. 兼容过渡策略（防中断）

1. 第一阶段保留旧表读取（只读）
2. 新写入全部落 `students_*`
3. 灰度验证通过后，移除旧 mock 逻辑与旧表写入
4. 最后清理旧临时模型与无前缀表

---

## 10. 执行结论

后续所有“模拟数据初始化”与“功能联调”均以 `070-er-model-full.html` 为唯一结构基线。  
`060-migration-mock-to-db.md` 仅描述迁移实施步骤，不再定义独立数据模型。

