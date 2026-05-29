-- ============================================================================
-- std_seed.sql · 标准库初始 seed 数据
-- 目标: PBL_STD（先执行 std_init.sql 建表）
--
-- 执行顺序（依赖关系）:
--   1. knl_systems → knl_modules → knl_topics → knl_skills → knl_chapters
--   2. knl_questions → knl_question_skill_map → knl_question_solutions
--   3. onb_question_pools → onb_pool_question_map
--   4. pla_types
-- ============================================================================

-- ── 1. 知识体系主干 ───────────────────────────────────────────────────────────

INSERT INTO knl_systems (id, name, description)
VALUES (1, '小学数学竞赛体系', '覆盖华杯、走美、学而思等主流小学奥数竞赛')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

SELECT setval('knl_systems_id_seq', (SELECT MAX(id) FROM knl_systems));

-- 七大板块
INSERT INTO knl_modules (id, system_id, name, description, olympiad_weight, sort_order)
VALUES
  (1, 1, '数论',      '整除、余数、同余、GCD/LCM、数字特性',   0.25, 1),
  (2, 1, '代数',      '方程、不等式、代入法、消元法',           0.18, 2),
  (3, 1, '行程与工程','速度·时间·距离，工程效率，流水行船',     0.20, 3),
  (4, 1, '计数与排列','加法原理、乘法原理、排列、组合、容斥',   0.15, 4),
  (5, 1, '数列与规律','等差数列、等比数列、数字规律、周期规律', 0.10, 5),
  (6, 1, '几何',      '平面图形面积周长、立体几何、坐标几何',   0.08, 6),
  (7, 1, '综合应用',  '竞赛综合题、多知识点交叉',               0.04, 7)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, olympiad_weight = EXCLUDED.olympiad_weight;

SELECT setval('knl_modules_id_seq', (SELECT MAX(id) FROM knl_modules));

-- 章节（topics）— 优先补 C01/C02 对应章节
INSERT INTO knl_topics (id, module_id, name, description, grade_start, grade_end, difficulty, sort_order)
VALUES
  (1, 1, '整除与余数', '整除判断、带余除法、余数性质、同余定理', 4, 6, 2, 1),
  (2, 3, '行程与应用', '相遇追及、流水行船、工程问题、行程图解', 4, 6, 2, 1)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, module_id = EXCLUDED.module_id;

SELECT setval('knl_topics_id_seq', (SELECT MAX(id) FROM knl_topics));

-- 知识点（skills）— C01 整除与余数：5个，C02 行程与应用：5个
INSERT INTO knl_skills (id, topic_id, name, difficulty, sort_order)
VALUES
  -- C01 整除与余数
  (1,  1, '整除判断',       1, 1),
  (2,  1, '带余除法',       1, 2),
  (3,  1, '余数的性质',     2, 3),
  (4,  1, '同余定义与性质', 2, 4),
  (5,  1, '中国剩余定理入门', 3, 5),
  -- C02 行程与应用
  (6,  2, '相遇追及',       2, 1),
  (7,  2, '流水行船',       2, 2),
  (8,  2, '工程问题',       2, 3),
  (9,  2, '行程图解法',     3, 4),
  (10, 2, '综合行程应用',   3, 5)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, topic_id = EXCLUDED.topic_id;

SELECT setval('knl_skills_id_seq', (SELECT MAX(id) FROM knl_skills));

-- 章节兼容层（knl_chapters）
INSERT INTO knl_chapters (id, code, name, grade, sort_order, is_active, topic_id)
VALUES
  (1, 'C01', '第4章·整除与余数', 5, 1, true, 1),
  (2, 'C02', '第5章·行程与应用', 5, 2, true, 2)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, topic_id = EXCLUDED.topic_id, is_active = EXCLUDED.is_active;

SELECT setval('knl_chapters_id_seq', (SELECT MAX(id) FROM knl_chapters));

-- ── 2. 题库（15 道诊断题） ────────────────────────────────────────────────────

TRUNCATE knl_questions RESTART IDENTITY CASCADE;

INSERT INTO knl_questions (grade, difficulty, stem_latex, options, answer_latex)
VALUES

-- Q1 整除·余数
(5, 2, '一个整数除以 7 余 3，那么这个数除以 14 的余数可能是哪些？',
 '[{"label":"A","text":"只能是 3"},{"label":"B","text":"只能是 10"},{"label":"C","text":"可能是 3，也可能是 10"},{"label":"D","text":"不确定，无法判断"}]',
 'C'),

-- Q2 行程·速度
(5, 1, '甲乙两地相距 120 千米。一辆汽车从甲出发，速度 40 千米/时；另一辆从乙出发，速度 60 千米/时，两车相向而行，几小时后相遇？',
 '[{"label":"A","text":"1 小时"},{"label":"B","text":"1.2 小时"},{"label":"C","text":"2 小时"},{"label":"D","text":"3 小时"}]',
 'B'),

-- Q3 计数·规律
(5, 1, '从 1 写到 100，数字「2」共出现了多少次？',
 '[{"label":"A","text":"10 次"},{"label":"B","text":"20 次"},{"label":"C","text":"21 次"},{"label":"D","text":"22 次"}]',
 'B'),

-- Q4 鸡兔同笼
(4, 1, '笼中鸡和兔共 20 只，腿共 54 条，鸡和兔各有多少只？',
 '[{"label":"A","text":"鸡 13 只，兔 7 只"},{"label":"B","text":"鸡 10 只，兔 10 只"},{"label":"C","text":"鸡 15 只，兔 5 只"},{"label":"D","text":"鸡 8 只，兔 12 只"}]',
 'A'),

-- Q5 数列·规律
(4, 1, '数列 1, 3, 6, 10, 15, ? 下一项是多少？',
 '[{"label":"A","text":"18"},{"label":"B","text":"20"},{"label":"C","text":"21"},{"label":"D","text":"25"}]',
 'C'),

-- Q6 应用综合
(5, 2, '一项工程，甲单独完成需 10 天，乙单独完成需 15 天，两人合做需几天完成？',
 '[{"label":"A","text":"5 天"},{"label":"B","text":"6 天"},{"label":"C","text":"8 天"},{"label":"D","text":"12 天"}]',
 'B'),

-- Q7 整除·余数
(5, 2, '三个连续奇数的乘积除以 3，余数是多少？',
 '[{"label":"A","text":"0"},{"label":"B","text":"1"},{"label":"C","text":"2"},{"label":"D","text":"不确定"}]',
 'A'),

-- Q8 行程·速度
(5, 2, '小明步行速度 4 千米/时，小红骑车速度 12 千米/时。小明先出发 30 分钟，小红从同一起点追赶，多少分钟后追上？',
 '[{"label":"A","text":"10 分钟"},{"label":"B","text":"15 分钟"},{"label":"C","text":"20 分钟"},{"label":"D","text":"30 分钟"}]',
 'B'),

-- Q9 计数·规律
(5, 2, '10 人参加会议，每两人握一次手，共握多少次手？',
 '[{"label":"A","text":"40 次"},{"label":"B","text":"45 次"},{"label":"C","text":"50 次"},{"label":"D","text":"90 次"}]',
 'B'),

-- Q10 鸡兔同笼
(4, 1, '停车场有三轮车和四轮车共 30 辆，车轮共 100 个，三轮车有多少辆？',
 '[{"label":"A","text":"10 辆"},{"label":"B","text":"15 辆"},{"label":"C","text":"20 辆"},{"label":"D","text":"25 辆"}]',
 'C'),

-- Q11 数列·规律
(5, 2, '数列 2, 5, 10, 17, 26, ? 下一项是多少？',
 '[{"label":"A","text":"35"},{"label":"B","text":"37"},{"label":"C","text":"39"},{"label":"D","text":"41"}]',
 'B'),

-- Q12 应用综合
(5, 1, '爸爸今年 40 岁，儿子今年 10 岁，几年后爸爸的年龄恰好是儿子的 3 倍？',
 '[{"label":"A","text":"3 年后"},{"label":"B","text":"5 年后"},{"label":"C","text":"8 年后"},{"label":"D","text":"10 年后"}]',
 'B'),

-- Q13 整除·余数
(6, 3, '某数被 7 除余 4，被 5 除余 2，满足条件的最小正整数是？',
 '[{"label":"A","text":"18"},{"label":"B","text":"22"},{"label":"C","text":"32"},{"label":"D","text":"67"}]',
 'C'),

-- Q14 行程·速度
(5, 2, '甲乙两人同时从 400 米环形跑道出发，甲速 6 米/秒，乙速 4 米/秒，同向而行，多少秒后甲第一次追上乙？',
 '[{"label":"A","text":"100 秒"},{"label":"B","text":"150 秒"},{"label":"C","text":"200 秒"},{"label":"D","text":"400 秒"}]',
 'C'),

-- Q15 计数·规律
(5, 2, '1 到 100 中，个位数字为 3 或 7 的所有整数之和是多少？',
 '[{"label":"A","text":"900"},{"label":"B","text":"950"},{"label":"C","text":"1000"},{"label":"D","text":"1050"}]',
 'C');

-- ── 3. 题目—知识点映射 ────────────────────────────────────────────────────────
-- Q1,7,13 → 数论技能；Q2,8,14 → 行程；Q3,9,15 → 计数；Q4,10 → 代数；Q5,11 → 数列；Q6,12 → 综合

INSERT INTO knl_question_skill_map (question_id, skill_id, is_primary) VALUES
-- 整除·余数 → skill 3(余数性质) / 4(同余) / 5(中国剩余)
(1,  3, true),  -- Q1 余数性质
(7,  3, true),  -- Q7 余数性质
(13, 4, true),  -- Q13 同余
(13, 5, false), -- Q13 中国剩余
-- 行程·速度 → skill 6(相遇追及) / 7(流水行船)
(2,  6, true),  -- Q2 相遇追及
(8,  6, true),  -- Q8 相遇追及（追及）
(14, 6, true),  -- Q14 环形追及
-- 计数·规律 → skill_id 4（暂复用同余点位）
-- 鸡兔同笼 → 代数（暂无 skill 直接映射，留空，后补）
-- 数列·规律 → skill 10（综合行程复用，后期补数列独立 skill）
-- 工程问题 → skill 8
(6,  8, true),  -- Q6 工程问题
ON CONFLICT (question_id, skill_id) DO NOTHING;

-- ── 4. 一题一解（每题至少 1 条） ─────────────────────────────────────────────

INSERT INTO knl_question_solutions (question_id, method_seq, title, summary, is_primary) VALUES
(1,  1, '余数分析法', '被除数 = 7k+3，讨论 k 奇偶性，得余数为 3 或 10', true),
(2,  1, '相遇公式法', '相遇时间 = 距离 ÷ 速度之和 = 120 ÷ (40+60) = 1.2 h', true),
(3,  1, '分十位/个位分类', '十位含 2：20-29 共 10 次；个位含 2：2,12,22…92 共 10 次；合计 20', true),
(4,  1, '假设法', '假设全鸡 40 条腿，比实际少 14，每用一兔换一鸡多 2 腿，故兔 7 只', true),
(5,  1, '差分法', '相邻差为 2,3,4,5,6，故下一差为 6，下一项 = 15+6 = 21', true),
(6,  1, '工作效率法', '甲效率 1/10，乙效率 1/15，合效率 1/6，时间 6 天', true),
(7,  1, '3 的倍数整除性', '三个连续奇数中必有一个是 3 的倍数，故积能被 3 整除，余 0', true),
(8,  1, '追及公式', '先行距 = 4×0.5 = 2 km，追及时间 = 2 ÷ (12-4) = 0.25 h = 15 min', true),
(9,  1, '组合数', 'C(10,2) = 10×9÷2 = 45', true),
(10, 1, '假设法', '假设全四轮 120 个，比 100 多 20，每换一辆三轮少 1 轮，故三轮 20 辆', true),
(11, 1, '差分法', '相邻差为 3,5,7,9，下一差为 11，下一项 = 26+11 = 37', true),
(12, 1, '年龄差不变', '年龄差 30 恒定，设 x 年后父 = 3 子，则 40+x = 3(10+x)，x = 5', true),
(13, 1, '穷举法', '7 的倍数加 4：4,11,18,25,32…；5 的倍数加 2：2,7,12,17,22,27,32；最小公共值 32', true),
(14, 1, '追及公式（环形）', '速差 2 m/s，追及距离 400 m，时间 = 400÷2 = 200 s', true),
(15, 1, '等差数列求和', '个位 3：3,13,23…93 共 10 个，和 = (3+93)×10÷2 = 480；个位 7 同理 = 520；总和 1000', true)
ON CONFLICT (question_id, method_seq) DO NOTHING;

-- ── 5. 评测题池（3 档） ────────────────────────────────────────────────────────

INSERT INTO onb_question_pools (id, grade, difficulty_band, pool_name, version)
VALUES
  (1, 5, 'low',  '五年级基础诊断池_v1', 'v1'),
  (2, 5, 'mid',  '五年级进阶诊断池_v1', 'v1'),
  (3, 5, 'high', '五年级竞赛诊断池_v1', 'v1')
ON CONFLICT (id) DO NOTHING;

SELECT setval('onb_question_pools_id_seq', 3);

-- 题目入池
INSERT INTO onb_pool_question_map (pool_id, question_id, order_num)
VALUES
  -- 基础池：Q2,Q4,Q5,Q10,Q12（难度1）
  (1, 2,  1), (1, 4,  2), (1, 5,  3), (1, 10, 4), (1, 12, 5),
  -- 进阶池：Q1,Q3,Q6,Q8,Q9,Q11（难度2）
  (2, 1,  1), (2, 3,  2), (2, 6,  3), (2, 8,  4), (2, 9,  5), (2, 11, 6),
  -- 竞赛池：Q7,Q13,Q14,Q15（难度2-3）
  (3, 7,  1), (3, 13, 2), (3, 14, 3), (3, 15, 4)
ON CONFLICT (pool_id, question_id) DO NOTHING;

-- ── 6. 项目类型 ────────────────────────────────────────────────────────────────

INSERT INTO pla_types (id, name, subject, grade_range, description)
VALUES (1, '华杯备赛', '小学奥数', '4-6年级', '华罗庚金杯小学邀请赛备考计划')
ON CONFLICT (id) DO NOTHING;

SELECT setval('pla_types_id_seq', 1);

-- ============================================================================
-- 验证:
--   SELECT COUNT(*) FROM knl_questions;          → 15
--   SELECT COUNT(*) FROM knl_question_solutions; → 15
--   SELECT COUNT(*) FROM onb_question_pools;     → 3
--   SELECT COUNT(*) FROM knl_modules;            → 7
--   SELECT COUNT(*) FROM knl_chapters;           → 2
-- ============================================================================
