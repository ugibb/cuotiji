-- ============================================================================
-- prep_seed.sql · 预处理库初始 seed 数据
-- 目标: PBL_PREP（先执行 prep_init.sql 建表）
--
-- 说明:
--   · 仅插入示例/骨架数据，实际教材目录由解析脚本批量导入
--   · 所有 pre_questions 默认 review_status = 'pending'，须人工审核
-- ============================================================================

-- ── 1. 教材目录骨架（示例，实际由 31G 文件目录解析脚本填入） ─────────────────

INSERT INTO pre_source_lessons
  (material_set, grade, level, semester, lesson_num, lesson_name, file_path, file_type, stage)
VALUES
  ('华杯小学', 5, '10级', 'S1', 15, '第15讲 同余',
   '华杯小学/5年级/10级/S1/L15_同余.pdf', 'pdf', 'raw'),
  ('华杯小学', 5, '10级', 'S1', 16, '第16讲 整除判断',
   '华杯小学/5年级/10级/S1/L16_整除.pdf', 'pdf', 'raw'),
  ('华杯小学', 5, '10级', 'S2', 1, '第1讲 相遇追及',
   '华杯小学/5年级/10级/S2/L01_相遇追及.pdf', 'pdf', 'raw')
ON CONFLICT DO NOTHING;

-- ── 2. 材料主题骨架 ────────────────────────────────────────────────────────────

INSERT INTO pre_material_topics (material_set, grade, level, topic_name, std_skill_ids)
VALUES
  ('华杯小学', 5, '10级', '同余与中国剩余定理', '[4, 5]'),
  ('华杯小学', 5, '10级', '相遇追及基础',       '[6]')
ON CONFLICT DO NOTHING;

-- ── 3. 暂存题目示例（3 题，均为 pending，仅供联调） ──────────────────────────

INSERT INTO pre_questions
  (lesson_id, question_type, grade, level, difficulty,
   stem_raw, answer_raw, review_status)
SELECT
  sl.id, 'choice', 5, '10级', 2,
  '一个整数除以 7 余 3，除以 14 的余数可能是？（示例，待 LaTeX 格式化）',
  'C',
  'pending'
FROM pre_source_lessons sl
WHERE sl.lesson_num = 15
LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 说明：
--   实际 pre_questions 批量导入由以下流程完成：
--   1. OCR/AI 解析 pre_source_lessons 中的 PDF 文件
--   2. 写入 stem_raw / answer_raw / solution_raw
--   3. AI 生成 stem_latex / skill_ids_ai
--   4. 人工审核后设置 review_status = 'approved'
--   5. 执行同步脚本将 approved 题目复制到标准库 knl_questions
-- ============================================================================
