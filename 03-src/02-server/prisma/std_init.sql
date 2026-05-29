-- ============================================================================
-- std_init.sql · 标准库 (PBL_STD) 建表脚本
-- 目标: postgresql://PBL:<password>@123.207.64.65:5432/PBL_STD
--
-- 执行: psql "postgresql://PBL:<pw>@123.207.64.65:5432/PBL_STD" -f std_init.sql
-- 说明: IF NOT EXISTS 可重复执行；seed 数据在 std_seed.sql
--
-- 建表顺序（依赖关系）:
--   [usr_] → [knl_] → [pla_] → [onb_] → [stu_]
-- ============================================================================

-- ── 枚举 ──────────────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE assignment_status AS ENUM
  ('ocr_pending','ocr_done','grading','graded','reviewed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE problem_result AS ENUM ('correct','wrong','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE review_status_enum AS ENUM ('pending','done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE dialogue_role AS ENUM ('ai','student');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE ai_context_type AS ENUM
  ('assessment_report','milestone_retro','problem_chat','plan_confirm');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- [usr_] 身份与学生
-- ============================================================================

CREATE TABLE IF NOT EXISTS usr_users (
  id           BIGSERIAL   PRIMARY KEY,
  openid       VARCHAR(64) NOT NULL UNIQUE,
  nickname     VARCHAR(32),
  parent_phone VARCHAR(20),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usr_students (
  id                 BIGSERIAL   PRIMARY KEY,
  user_id            BIGINT      NOT NULL REFERENCES usr_users(id),
  name               VARCHAR(32) NOT NULL,
  grade              SMALLINT    NOT NULL,
  avatar             VARCHAR(512),
  is_default         BOOLEAN     NOT NULL DEFAULT false,
  onboarding_answers JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usr_students_user ON usr_students(user_id);

-- ============================================================================
-- [knl_] 知识体系与题库
-- ============================================================================

CREATE TABLE IF NOT EXISTS knl_systems (
  id          SERIAL      PRIMARY KEY,
  name        VARCHAR(64) NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS knl_modules (
  id              SERIAL       PRIMARY KEY,
  system_id       INTEGER      NOT NULL REFERENCES knl_systems(id),
  name            VARCHAR(64)  NOT NULL,
  description     TEXT,
  exam_weight     NUMERIC(4,2) DEFAULT 0,
  olympiad_weight NUMERIC(4,2) DEFAULT 0,
  sort_order      INTEGER      NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_knl_modules_system ON knl_modules(system_id);

CREATE TABLE IF NOT EXISTS knl_topics (
  id          BIGSERIAL    PRIMARY KEY,
  module_id   INTEGER      NOT NULL REFERENCES knl_modules(id),
  name        VARCHAR(128) NOT NULL,
  description TEXT,
  grade_start SMALLINT,
  grade_end   SMALLINT,
  difficulty  SMALLINT     DEFAULT 1,
  sort_order  INTEGER      NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_knl_topics_module ON knl_topics(module_id);

CREATE TABLE IF NOT EXISTS knl_skills (
  id            BIGSERIAL    PRIMARY KEY,
  topic_id      BIGINT       NOT NULL REFERENCES knl_topics(id),
  name          VARCHAR(128) NOT NULL,
  grade_start   SMALLINT,
  grade_end     SMALLINT,
  difficulty    SMALLINT     DEFAULT 1,
  prerequisites JSONB,
  error_types   JSONB,
  sort_order    INTEGER      NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_knl_skills_topic ON knl_skills(topic_id);

CREATE TABLE IF NOT EXISTS knl_chapters (
  id         SERIAL       PRIMARY KEY,
  code       VARCHAR(32)  NOT NULL UNIQUE,
  name       VARCHAR(64)  NOT NULL,
  subtitle   VARCHAR(128),
  grade      SMALLINT     NOT NULL DEFAULT 0,
  sort_order INTEGER      NOT NULL DEFAULT 0,
  is_active  BOOLEAN      NOT NULL DEFAULT true,
  topic_id   BIGINT       REFERENCES knl_topics(id)
);

CREATE TABLE IF NOT EXISTS knl_questions (
  id                 BIGSERIAL   PRIMARY KEY,
  source_material    VARCHAR(128),
  source_question_no VARCHAR(32),
  grade              SMALLINT,
  difficulty         SMALLINT    DEFAULT 1,
  stem_latex         TEXT        NOT NULL,
  options            JSONB,
  answer_latex       TEXT,
  solution_latex     TEXT,
  trap_desc          TEXT,
  error_hints        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knl_question_skill_map (
  question_id BIGINT      NOT NULL REFERENCES knl_questions(id),
  skill_id    BIGINT      NOT NULL REFERENCES knl_skills(id),
  is_primary  BOOLEAN     NOT NULL DEFAULT false,
  confidence  NUMERIC(4,2) DEFAULT 1.0,
  PRIMARY KEY (question_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_knl_qskill_skill ON knl_question_skill_map(skill_id);

CREATE TABLE IF NOT EXISTS knl_question_solutions (
  id             BIGSERIAL   PRIMARY KEY,
  question_id    BIGINT      NOT NULL REFERENCES knl_questions(id),
  method_seq     SMALLINT    NOT NULL DEFAULT 1,
  title          VARCHAR(128),
  summary        TEXT,
  solution_latex TEXT,
  is_primary     BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, method_seq)
);
CREATE INDEX IF NOT EXISTS idx_knl_solutions_question ON knl_question_solutions(question_id);

-- ============================================================================
-- [pla_] 项目与计划  ← 必须在 onb_ 之前（onb_ 有 FK 引用）
-- ============================================================================

CREATE TABLE IF NOT EXISTS pla_types (
  id          SERIAL      PRIMARY KEY,
  name        VARCHAR(64) NOT NULL,
  subject     VARCHAR(64),
  grade_range VARCHAR(32),
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS pla_learning_projects (
  id         BIGSERIAL   PRIMARY KEY,
  student_id BIGINT      NOT NULL REFERENCES usr_students(id),
  type_id    INTEGER     REFERENCES pla_types(id),
  target_date DATE,
  goal_level VARCHAR(32),
  status     VARCHAR(32) NOT NULL DEFAULT 'assessing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pla_projects_student ON pla_learning_projects(student_id);

CREATE TABLE IF NOT EXISTS pla_sprint_plans (
  id               BIGSERIAL   PRIMARY KEY,
  project_id       BIGINT      NOT NULL UNIQUE REFERENCES pla_learning_projects(id),
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at     TIMESTAMPTZ,
  total_days       INTEGER,
  plan_data        JSONB,
  competition_name VARCHAR(128),
  goal_type        VARCHAR(32),
  target_score     NUMERIC(5,2),
  overall_level    VARCHAR(16),
  daily_minutes    SMALLINT
);

CREATE TABLE IF NOT EXISTS pla_milestones (
  id             BIGSERIAL   PRIMARY KEY,
  sprint_plan_id BIGINT      NOT NULL REFERENCES pla_sprint_plans(id),
  seq            SMALLINT    NOT NULL,
  name           VARCHAR(64) NOT NULL,
  focus_topic_ids JSONB,
  focus_skill_ids JSONB,
  start_date     DATE,
  end_date       DATE,
  duration_days  SMALLINT,
  score_before   NUMERIC(5,2),
  score_target   NUMERIC(5,2),
  score_after    NUMERIC(5,2),
  status         VARCHAR(16) NOT NULL DEFAULT 'locked',
  completed_at   TIMESTAMPTZ,
  UNIQUE (sprint_plan_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_pla_milestones_plan ON pla_milestones(sprint_plan_id);

CREATE TABLE IF NOT EXISTS pla_milestone_retros (
  id                   BIGSERIAL   PRIMARY KEY,
  milestone_id         BIGINT      NOT NULL UNIQUE REFERENCES pla_milestones(id),
  checkin_days         SMALLINT,
  task_completion_rate NUMERIC(5,2),
  score_before         NUMERIC(5,2),
  score_after          NUMERIC(5,2),
  q1_memorable_topic   TEXT,
  q2_mastery_rating    SMALLINT,
  q3_next_feeling      TEXT,
  achievement_sent     BOOLEAN     NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pla_project_retros (
  id               BIGSERIAL   PRIMARY KEY,
  project_id       BIGINT      NOT NULL UNIQUE REFERENCES pla_learning_projects(id),
  student_report   JSONB,
  platform_metrics JSONB,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- [onb_] 评测 + 能力画像  ← 依赖 pla_learning_projects
-- ============================================================================

CREATE TABLE IF NOT EXISTS onb_question_pools (
  id              SERIAL      PRIMARY KEY,
  grade           SMALLINT    NOT NULL,
  difficulty_band VARCHAR(8)  NOT NULL CHECK (difficulty_band IN ('low','mid','high')),
  pool_name       VARCHAR(64) NOT NULL,
  version         VARCHAR(16) NOT NULL DEFAULT 'v1',
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onb_pool_question_map (
  pool_id     INTEGER  NOT NULL REFERENCES onb_question_pools(id),
  question_id BIGINT   NOT NULL REFERENCES knl_questions(id),
  order_num   SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (pool_id, question_id)
);

CREATE TABLE IF NOT EXISTS onb_ability_assessments (
  id            BIGSERIAL   PRIMARY KEY,
  project_id    BIGINT      NOT NULL UNIQUE REFERENCES pla_learning_projects(id),
  intake_data   JSONB,
  ability_level VARCHAR(16),
  weak_points   JSONB,
  report_data   JSONB,
  calibrated    BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onb_assessment_sessions (
  id            BIGSERIAL   PRIMARY KEY,
  assessment_id BIGINT      NOT NULL REFERENCES onb_ability_assessments(id),
  questions     JSONB,
  answers       JSONB,
  ai_grading    JSONB,
  completed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_onb_sessions_assessment ON onb_assessment_sessions(assessment_id);

CREATE TABLE IF NOT EXISTS onb_assessment_results (
  id                       BIGSERIAL   PRIMARY KEY,
  session_id               BIGINT      NOT NULL REFERENCES onb_assessment_sessions(id),
  question_id              BIGINT      NOT NULL REFERENCES knl_questions(id),
  skill_id                 BIGINT      REFERENCES knl_skills(id),
  student_answer           VARCHAR(256),
  correct_answer           VARCHAR(256),
  is_correct               BOOLEAN,
  topic_score_contribution NUMERIC(6,2)
);
CREATE INDEX IF NOT EXISTS idx_onb_results_session  ON onb_assessment_results(session_id);
CREATE INDEX IF NOT EXISTS idx_onb_results_question ON onb_assessment_results(question_id);

CREATE TABLE IF NOT EXISTS onb_skill_mastery (
  student_id    BIGINT      NOT NULL REFERENCES usr_students(id),
  skill_id      BIGINT      NOT NULL REFERENCES knl_skills(id),
  mastery_level VARCHAR(16),
  initial_score NUMERIC(5,2),
  target_score  NUMERIC(5,2),
  current_score NUMERIC(5,2),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, skill_id)
);

CREATE TABLE IF NOT EXISTS onb_topic_scores (
  student_id BIGINT      NOT NULL REFERENCES usr_students(id),
  topic_id   BIGINT      NOT NULL REFERENCES knl_topics(id),
  score      NUMERIC(5,2),
  trend      SMALLINT    DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, topic_id)
);

-- ============================================================================
-- [stu_] 学生执行与错题闭环
-- ============================================================================

CREATE TABLE IF NOT EXISTS stu_training_plans (
  id             BIGSERIAL   PRIMARY KEY,
  student_id     BIGINT      NOT NULL REFERENCES usr_students(id),
  sprint_plan_id BIGINT      REFERENCES pla_sprint_plans(id),
  milestone_id   BIGINT      REFERENCES pla_milestones(id),
  chapter_id     INTEGER     REFERENCES knl_chapters(id),
  plan_date      DATE        NOT NULL,
  topic          VARCHAR(128),
  key_points     JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, sprint_plan_id, plan_date)
);
CREATE INDEX IF NOT EXISTS idx_stu_training_student ON stu_training_plans(student_id);

CREATE TABLE IF NOT EXISTS stu_training_plan_items (
  id           BIGSERIAL   PRIMARY KEY,
  plan_id      BIGINT      NOT NULL REFERENCES stu_training_plans(id),
  skill_id     BIGINT      REFERENCES knl_skills(id),
  question_id  BIGINT      REFERENCES knl_questions(id),
  item_type    VARCHAR(32) NOT NULL DEFAULT 'new_practice',
  order_num    SMALLINT    NOT NULL DEFAULT 0,
  completed    BOOLEAN     NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_stu_plan_items_plan ON stu_training_plan_items(plan_id);

CREATE TABLE IF NOT EXISTS stu_assignments (
  id              BIGSERIAL         PRIMARY KEY,
  student_id      BIGINT            NOT NULL REFERENCES usr_students(id),
  chapter_id      INTEGER           REFERENCES knl_chapters(id),
  plan_date       DATE,
  image_url       VARCHAR(512)      NOT NULL,
  image_url_thumb VARCHAR(512),
  status          assignment_status NOT NULL DEFAULT 'ocr_pending',
  total_count     INTEGER           NOT NULL DEFAULT 0,
  correct_count   INTEGER           NOT NULL DEFAULT 0,
  wrong_count     INTEGER           NOT NULL DEFAULT 0,
  unknown_count   INTEGER           NOT NULL DEFAULT 0,
  mood_text       TEXT,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stu_assignments_student ON stu_assignments(student_id, plan_date);

CREATE TABLE IF NOT EXISTS stu_problems (
  id             BIGSERIAL          PRIMARY KEY,
  assignment_id  BIGINT             NOT NULL REFERENCES stu_assignments(id),
  seq            INTEGER            NOT NULL,
  ocr_text       TEXT,
  student_answer VARCHAR(256),
  correct_answer VARCHAR(256),
  result         problem_result     NOT NULL,
  knowledge_point VARCHAR(128),
  trap_desc      TEXT,
  solution_text  TEXT,
  root_cause     TEXT,
  review_status  review_status_enum NOT NULL DEFAULT 'pending',
  review_stage   SMALLINT           NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ,
  mastered_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stu_problems_assignment ON stu_problems(assignment_id);
CREATE INDEX IF NOT EXISTS idx_stu_problems_review     ON stu_problems(next_review_at);

CREATE TABLE IF NOT EXISTS stu_dialogues (
  id         BIGSERIAL     PRIMARY KEY,
  problem_id BIGINT        NOT NULL REFERENCES stu_problems(id),
  role       dialogue_role NOT NULL,
  content    TEXT          NOT NULL,
  audio_url  VARCHAR(512),
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stu_dialogues_problem ON stu_dialogues(problem_id);

CREATE TABLE IF NOT EXISTS stu_ai_dialogues (
  id           BIGSERIAL       PRIMARY KEY,
  student_id   BIGINT          NOT NULL REFERENCES usr_students(id),
  project_id   BIGINT          REFERENCES pla_learning_projects(id),
  context_type ai_context_type NOT NULL,
  context_id   BIGINT,
  role         dialogue_role   NOT NULL,
  content      TEXT            NOT NULL,
  audio_url    VARCHAR(512),
  created_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stu_ai_dlg_student ON stu_ai_dialogues(student_id);
CREATE INDEX IF NOT EXISTS idx_stu_ai_dlg_ctx     ON stu_ai_dialogues(context_type, context_id);

CREATE TABLE IF NOT EXISTS stu_review_sessions (
  id              BIGSERIAL   PRIMARY KEY,
  assignment_id   BIGINT      NOT NULL UNIQUE REFERENCES stu_assignments(id),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  summary_text    TEXT,
  notified_parent BOOLEAN     NOT NULL DEFAULT false,
  notified_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stu_wrong_answer_skill_map (
  problem_id      BIGINT      NOT NULL REFERENCES stu_problems(id),
  skill_id        BIGINT      NOT NULL REFERENCES knl_skills(id),
  root_cause_type VARCHAR(64),
  diagnosed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (problem_id, skill_id)
);

CREATE TABLE IF NOT EXISTS stu_daily_check_ins (
  id         BIGSERIAL   PRIMARY KEY,
  student_id BIGINT      NOT NULL REFERENCES usr_students(id),
  check_date DATE        NOT NULL,
  streak     INTEGER     NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, check_date)
);
CREATE INDEX IF NOT EXISTS idx_stu_checkins_student ON stu_daily_check_ins(student_id);

-- ============================================================================
-- 执行后验证:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' ORDER BY table_name;
--   → 应可见 29 张表
-- ============================================================================
