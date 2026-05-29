-- ============================================================================
-- prep_init.sql · 预处理库 (PBL_PREP) 建表脚本
-- 目标: postgresql://PBL:<password>@123.207.64.65:5432/PBL_PREP
--
-- 执行: psql "postgresql://PBL:<pw>@123.207.64.65:5432/PBL_PREP" -f prep_init.sql
-- 说明:
--   · 预处理库与标准库完全独立，无跨库外键
--   · pre_questions.review_status='approved' 时，通过同步脚本写入标准库
--   · seed 数据在 prep_seed.sql
-- ============================================================================

DO $$ BEGIN CREATE TYPE prep_review_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE prep_question_type AS ENUM ('fill','choice','open');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- [pre_] 预处理库
-- ============================================================================

-- 原始教材索引（对应 31G 文件目录）
CREATE TABLE IF NOT EXISTS pre_source_lessons (
  id          BIGSERIAL    PRIMARY KEY,
  material_set VARCHAR(64) NOT NULL,
  grade       SMALLINT,
  level       VARCHAR(32),
  semester    VARCHAR(16),
  lesson_num  INTEGER,
  lesson_name VARCHAR(256) NOT NULL,
  file_path   VARCHAR(512),
  file_type   VARCHAR(16),
  is_scanned  BOOLEAN      NOT NULL DEFAULT false,
  stage       VARCHAR(32)  NOT NULL DEFAULT 'raw',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pre_lessons_set ON pre_source_lessons(material_set, grade);

-- 材料自有主题（映射到标准库 knl_skills）
CREATE TABLE IF NOT EXISTS pre_material_topics (
  id           BIGSERIAL    PRIMARY KEY,
  material_set VARCHAR(64)  NOT NULL,
  grade        SMALLINT,
  level        VARCHAR(32),
  topic_name   VARCHAR(256) NOT NULL,
  description  TEXT,
  std_skill_ids JSONB,
  mapped_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 讲义好方法（解题策略片段）
CREATE TABLE IF NOT EXISTS pre_lecture_methods (
  id        BIGSERIAL    PRIMARY KEY,
  lesson_id BIGINT       NOT NULL REFERENCES pre_source_lessons(id),
  seq       SMALLINT     NOT NULL,
  title     VARCHAR(128),
  summary   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lesson_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_pre_lmethods_lesson ON pre_lecture_methods(lesson_id);

-- 讲义知识点片段
CREATE TABLE IF NOT EXISTS pre_lecture_kp (
  id            BIGSERIAL    PRIMARY KEY,
  lesson_id     BIGINT       NOT NULL REFERENCES pre_source_lessons(id),
  seq           SMALLINT     NOT NULL,
  title         VARCHAR(128),
  content_latex TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (lesson_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_pre_lkp_lesson ON pre_lecture_kp(lesson_id);

-- 暂存题目（含完整审核与同步状态）
CREATE TABLE IF NOT EXISTS pre_questions (
  id                 BIGSERIAL           PRIMARY KEY,
  lesson_id          BIGINT              REFERENCES pre_source_lessons(id),
  material_topic_id  BIGINT              REFERENCES pre_material_topics(id),
  method_id          BIGINT              REFERENCES pre_lecture_methods(id),
  question_type      prep_question_type  NOT NULL DEFAULT 'open',
  material_set       VARCHAR(64),
  grade              SMALLINT,
  level              VARCHAR(32),
  seq_in_lesson      INTEGER,
  difficulty         SMALLINT            DEFAULT 1,
  stem_raw           TEXT,
  answer_raw         TEXT,
  solution_raw       TEXT,
  stem_latex         TEXT,
  answer_latex       TEXT,
  solution_latex     TEXT,
  options            JSONB,
  skill_ids_ai       JSONB,
  skill_confidence   NUMERIC(4,2),
  review_status      prep_review_status  NOT NULL DEFAULT 'pending',
  reviewer_note      TEXT,
  reviewed_at        TIMESTAMPTZ,
  synced_to_std      BOOLEAN             NOT NULL DEFAULT false,
  synced_at          TIMESTAMPTZ,
  std_question_id    BIGINT,
  created_at         TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pre_questions_status  ON pre_questions(review_status);
CREATE INDEX IF NOT EXISTS idx_pre_questions_lesson  ON pre_questions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_pre_questions_synced  ON pre_questions(synced_to_std);

-- 题目与讲义知识点多对多
CREATE TABLE IF NOT EXISTS pre_question_kp_map (
  question_id BIGINT NOT NULL REFERENCES pre_questions(id),
  kp_id       BIGINT NOT NULL REFERENCES pre_lecture_kp(id),
  PRIMARY KEY (question_id, kp_id)
);

-- 知识缺口候选（知识体系中尚未覆盖的点）
CREATE TABLE IF NOT EXISTS pre_skill_gaps (
  id              BIGSERIAL    PRIMARY KEY,
  material_set    VARCHAR(64),
  description     TEXT         NOT NULL,
  question_count  INTEGER      DEFAULT 0,
  suggested_skill VARCHAR(128),
  resolution      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 同步闸门（备注，由独立脚本执行）
--
-- 条件: pre_questions.review_status = 'approved'
--       AND pre_questions.stem_latex IS NOT NULL
-- 目标: INSERT INTO knl_questions (标准库) ...
--       UPDATE pre_questions SET synced_to_std=true, synced_at=NOW(), std_question_id=...
-- ============================================================================
