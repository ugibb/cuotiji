import prisma from '../src/utils/prisma'

// ────────────────────────────────────────────────────────────────
// 知识体系：6 个主题，每个主题一个 module / topic / skill
// ────────────────────────────────────────────────────────────────
const TOPIC_DEFS = [
  { name: '整除 · 余数', examWeight: 0.20, olympiadWeight: 0.20 },
  { name: '行程 · 速度', examWeight: 0.18, olympiadWeight: 0.18 },
  { name: '计数 · 规律', examWeight: 0.18, olympiadWeight: 0.18 },
  { name: '鸡兔同笼',    examWeight: 0.10, olympiadWeight: 0.10 },
  { name: '数列 · 规律', examWeight: 0.17, olympiadWeight: 0.17 },
  { name: '应用综合',    examWeight: 0.17, olympiadWeight: 0.17 },
]

// ────────────────────────────────────────────────────────────────
// 15 道评测题目（与前端 assessment-data.ts 保持一致）
// ────────────────────────────────────────────────────────────────
interface AsmQ {
  origId: number          // 前端原始 id，用于排序
  topic: string
  stem: string
  options: { label: string; text: string }[]
  correct: string         // 'A'|'B'|'C'|'D'
}

const ASSESSMENT_QUESTIONS: AsmQ[] = [
  // ── 整除 · 余数 ──
  { origId: 1,  topic: '整除 · 余数', correct: 'C',
    stem: '一个整数除以 7 余 3，那么这个数除以 14 的余数可能是哪些？',
    options: [{ label: 'A', text: '只能是 3' }, { label: 'B', text: '只能是 10' },
              { label: 'C', text: '可能是 3，也可能是 10' }, { label: 'D', text: '不确定，无法判断' }] },
  { origId: 7,  topic: '整除 · 余数', correct: 'A',
    stem: '三个连续奇数的乘积除以 3，余数是多少？',
    options: [{ label: 'A', text: '0' }, { label: 'B', text: '1' },
              { label: 'C', text: '2' }, { label: 'D', text: '不确定' }] },
  { origId: 13, topic: '整除 · 余数', correct: 'C',
    stem: '某数被 7 除余 4，被 5 除余 2，满足条件的最小正整数是？',
    options: [{ label: 'A', text: '18' }, { label: 'B', text: '22' },
              { label: 'C', text: '32' }, { label: 'D', text: '67' }] },
  // ── 行程 · 速度 ──
  { origId: 2,  topic: '行程 · 速度', correct: 'B',
    stem: '甲乙两地相距 120 千米。甲出发速度 40 千米/时，乙出发速度 60 千米/时，相向而行，几小时后相遇？',
    options: [{ label: 'A', text: '1 小时' }, { label: 'B', text: '1.2 小时' },
              { label: 'C', text: '2 小时' }, { label: 'D', text: '3 小时' }] },
  { origId: 8,  topic: '行程 · 速度', correct: 'B',
    stem: '小明步行速度 4 千米/时，小红骑车速度 12 千米/时。小明先出发 30 分钟，小红从同一起点追赶，多少分钟后追上？',
    options: [{ label: 'A', text: '10 分钟' }, { label: 'B', text: '15 分钟' },
              { label: 'C', text: '20 分钟' }, { label: 'D', text: '30 分钟' }] },
  { origId: 14, topic: '行程 · 速度', correct: 'C',
    stem: '甲乙两人同时从 400 米环形跑道出发，甲速 6 米/秒，乙速 4 米/秒，同向而行，多少秒后甲第一次追上乙？',
    options: [{ label: 'A', text: '100 秒' }, { label: 'B', text: '150 秒' },
              { label: 'C', text: '200 秒' }, { label: 'D', text: '400 秒' }] },
  // ── 计数 · 规律 ──
  { origId: 3,  topic: '计数 · 规律', correct: 'B',
    stem: '从 1 写到 100，数字「2」共出现了多少次？',
    options: [{ label: 'A', text: '10 次' }, { label: 'B', text: '20 次' },
              { label: 'C', text: '21 次' }, { label: 'D', text: '22 次' }] },
  { origId: 9,  topic: '计数 · 规律', correct: 'B',
    stem: '10 人参加会议，每两人握一次手，共握多少次手？',
    options: [{ label: 'A', text: '40 次' }, { label: 'B', text: '45 次' },
              { label: 'C', text: '50 次' }, { label: 'D', text: '90 次' }] },
  { origId: 15, topic: '计数 · 规律', correct: 'C',
    stem: '1 到 100 中，个位数字为 3 或 7 的所有整数之和是多少？',
    options: [{ label: 'A', text: '900' }, { label: 'B', text: '950' },
              { label: 'C', text: '1000' }, { label: 'D', text: '1050' }] },
  // ── 鸡兔同笼 ──
  { origId: 4,  topic: '鸡兔同笼', correct: 'A',
    stem: '笼中鸡和兔共 20 只，腿共 54 条，鸡和兔各有多少只？',
    options: [{ label: 'A', text: '鸡 13 只，兔 7 只' }, { label: 'B', text: '鸡 10 只，兔 10 只' },
              { label: 'C', text: '鸡 15 只，兔 5 只' }, { label: 'D', text: '鸡 8 只，兔 12 只' }] },
  { origId: 10, topic: '鸡兔同笼', correct: 'C',
    stem: '停车场有三轮车和四轮车共 30 辆，车轮共 100 个，三轮车有多少辆？',
    options: [{ label: 'A', text: '10 辆' }, { label: 'B', text: '15 辆' },
              { label: 'C', text: '20 辆' }, { label: 'D', text: '25 辆' }] },
  // ── 数列 · 规律 ──
  { origId: 5,  topic: '数列 · 规律', correct: 'C',
    stem: '数列 1, 3, 6, 10, 15, ? 下一项是多少？',
    options: [{ label: 'A', text: '18' }, { label: 'B', text: '20' },
              { label: 'C', text: '21' }, { label: 'D', text: '25' }] },
  { origId: 11, topic: '数列 · 规律', correct: 'B',
    stem: '数列 2, 5, 10, 17, 26, ? 下一项是多少？',
    options: [{ label: 'A', text: '35' }, { label: 'B', text: '37' },
              { label: 'C', text: '39' }, { label: 'D', text: '41' }] },
  // ── 应用综合 ──
  { origId: 6,  topic: '应用综合', correct: 'B',
    stem: '一项工程，甲单独完成需 10 天，乙单独完成需 15 天，两人合做需几天完成？',
    options: [{ label: 'A', text: '5 天' }, { label: 'B', text: '6 天' },
              { label: 'C', text: '8 天' }, { label: 'D', text: '12 天' }] },
  { origId: 12, topic: '应用综合', correct: 'B',
    stem: '爸爸今年 40 岁，儿子今年 10 岁，几年后爸爸的年龄恰好是儿子的 3 倍？',
    options: [{ label: 'A', text: '3 年后' }, { label: 'B', text: '5 年后' },
              { label: 'C', text: '8 年后' }, { label: 'D', text: '10 年后' }] },
]

// ────────────────────────────────────────────────────────────────
// 训练计划内容（与 training-plans.ts 路由保持一致）
// ────────────────────────────────────────────────────────────────
const M1_SCHEDULE = [
  { topic: '整除判断基础',        keyPoints: ['整除的定义与意义', '整除判断规则（2/3/5）', '因数与倍数关系'],  chapterCode: 'C01' },
  { topic: '带余除法',            keyPoints: ['带余除法的意义', '余数与除数的大小关系', '验证与还原计算'],    chapterCode: 'C01' },
  { topic: '带余除法（练习）',    keyPoints: ['综合题型训练', '余数还原法', '错误归因分析'],                  chapterCode: 'C01' },
  { topic: '余数的性质',          keyPoints: ['余数的范围', '余数的加减运算性质', '整除与余数关系'],          chapterCode: 'C01' },
  { topic: '余数的性质（练习）',  keyPoints: ['综合运用余数', '求数字末位', '周期问题入门'],                  chapterCode: 'C01' },
  { topic: '同余定义与性质',      keyPoints: ['同余的定义', '同余的基本性质', '同余的加法运算'],              chapterCode: 'C01' },
  { topic: '同余定义与性质（练习）', keyPoints: ['综合运用同余', '求数字末位', '周期问题入门'],               chapterCode: 'C01' },
  { topic: '中国剩余定理入门',    keyPoints: ['联立同余方程', '中国剩余定理思路', '简单竞赛例题'],            chapterCode: 'C01' },
  { topic: '整除余数综合练习',    keyPoints: ['综合技巧串联', '竞赛真题训练', '错题归纳复盘'],                chapterCode: 'C01' },
]

const M2_SCHEDULE = [
  { topic: '相遇追及基础',   keyPoints: ['相遇问题核心公式', '追及问题建模', '速度差时间关系'],              chapterCode: 'C02' },
  { topic: '相遇追及进阶',   keyPoints: ['多次相遇计算', '环形跑道问题', '复杂追及建模'],                    chapterCode: 'C02' },
  { topic: '流水行船',       keyPoints: ['顺水逆水速度', '水速与船速分离', '往返时间计算'],                  chapterCode: 'C02' },
  { topic: '流水行船（练习）', keyPoints: ['综合题型训练', '往返多段', '竞赛例题分析'],                      chapterCode: 'C02' },
  { topic: '工程问题',       keyPoints: ['工作效率概念', '合作完成时间', '多人协作模型'],                    chapterCode: 'C02' },
  { topic: '工程问题（练习）', keyPoints: ['效率变化问题', '交替工作', '综合应用'],                          chapterCode: 'C02' },
  { topic: '行程图解法',     keyPoints: ['线段图建模', '图表分析方法', '多步行程解析'],                      chapterCode: 'C02' },
  { topic: '综合行程应用',   keyPoints: ['列车过桥', '火车相遇', '复合行程问题'],                            chapterCode: 'C02' },
  { topic: '综合行程（练习）', keyPoints: ['竞赛真题训练', '技巧串联', '错题归纳复盘'],                      chapterCode: 'C02' },
]

const M3_SCHEDULE = [
  { topic: '综合冲刺 · 整除专项', keyPoints: ['整除余数真题', '重点错题复盘'],   chapterCode: 'C01' },
  { topic: '综合冲刺 · 行程专项', keyPoints: ['行程综合真题', '复合模型解析'],   chapterCode: 'C02' },
  { topic: '综合冲刺 · 模拟考试', keyPoints: ['全真模拟', '时间管理'],            chapterCode: 'C01' },
]

const MILESTONE_DEFS = [
  { seq: 1, name: '整除与余数',  durationDays: 21, schedule: M1_SCHEDULE, scoreBefore: 45, scoreTarget: 75, status: 'active' },
  { seq: 2, name: '行程·应用综合', durationDays: 25, schedule: M2_SCHEDULE, scoreBefore: 55, scoreTarget: 72, status: 'locked' },
  { seq: 3, name: '综合冲刺',    durationDays: 21, schedule: M3_SCHEDULE, scoreBefore: null, scoreTarget: null, status: 'locked' },
]

// ────────────────────────────────────────────────────────────────
// 示例题目数据（用于演示作业批改功能）
// ────────────────────────────────────────────────────────────────
interface ProblemSpec {
  seq: number; text: string; result: 'correct'|'wrong'|'unknown'
  studentAnswer: string; correctAnswer: string; knowledgePoint: string
  trapDesc?: string; solutionText: string
}

const PROBLEMS_C01: ProblemSpec[] = [
  { seq:1, result:'correct', studentAnswer:'整除', correctAnswer:'整除',
    text:'12 能被 3 整除吗？', knowledgePoint:'被3整除的特征',
    solutionText:'1+2=3，3能被3整除，所以12能被3整除。' },
  { seq:2, result:'wrong', studentAnswer:'不能', correctAnswer:'能',
    text:'一个三位数各位数字之和为15，判断它能否被3整除。',
    knowledgePoint:'被3整除的特征', trapDesc:'忘记检验数字和',
    solutionText:'15÷3=5，余数为0，故能被3整除。' },
  { seq:3, result:'correct', studentAnswer:'3', correctAnswer:'3',
    text:'17 除以 7 的余数是？', knowledgePoint:'余数定义',
    solutionText:'17=7×2+3，余数为3。' },
  { seq:4, result:'unknown', studentAnswer:'', correctAnswer:'23',
    text:'一个两位数除以5余3，除以7余2，这个两位数是？',
    knowledgePoint:'中国剩余定理', solutionText:'满足条件的最小两位数是23。' },
  { seq:5, result:'correct', studentAnswer:'4', correctAnswer:'4',
    text:'100 以内能被 7 整除且除以 3 余 1 的数有几个？',
    knowledgePoint:'整除与余数综合', solutionText:'7,28,49,70共4个。' },
  { seq:6, result:'wrong', studentAnswer:'星期三', correctAnswer:'星期五',
    text:'2026年1月1日是星期四，4月24日是星期几？',
    knowledgePoint:'余数与日期', trapDesc:'忘记计算跨月天数',
    solutionText:'1月1日到4月24日共113天，113÷7=16余1，周四+1=周五。' },
]

const PROBLEMS_C02: ProblemSpec[] = [
  { seq:1, result:'correct', studentAnswer:'1.2', correctAnswer:'1.2',
    text:'甲乙两地相距 120 千米，甲速 40 千米/时，乙速 60 千米/时，相向而行几小时后相遇？',
    knowledgePoint:'相遇问题', solutionText:'120÷(40+60)=1.2小时。' },
  { seq:2, result:'wrong', studentAnswer:'10分钟', correctAnswer:'15分钟',
    text:'小明步行速度 4 千米/时，小红骑车速度 12 千米/时。小明先出发 30 分钟，多少分钟后追上？',
    knowledgePoint:'追及问题', trapDesc:'混淆速度差与绝对速度',
    solutionText:'先走距离=4×0.5=2千米，速度差=12-4=8千米/时，追及时间=2÷8=0.25时=15分钟。' },
  { seq:3, result:'correct', studentAnswer:'6', correctAnswer:'6',
    text:'一项工程，甲 10 天完成，乙 15 天完成，合做几天？',
    knowledgePoint:'工程问题', solutionText:'每天完成1/10+1/15=1/6，需6天。' },
  { seq:4, result:'unknown', studentAnswer:'', correctAnswer:'200',
    text:'400 米环形跑道，甲速 6 米/秒，乙速 4 米/秒，同向出发，几秒后甲追上乙？',
    knowledgePoint:'环形追及', solutionText:'400÷(6-4)=200秒。' },
]

// ────────────────────────────────────────────────────────────────
// 辅助函数
// ────────────────────────────────────────────────────────────────
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

// ────────────────────────────────────────────────────────────────
// 主函数
// ────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 开始初始化测试数据...\n')

  // ─── 1. 知识体系 ──────────────────────────────────────────────
  console.log('📖 初始化知识体系...')
  const system = await prisma.knl_System.upsert({
    where: { name: '华杯数学' },
    update: {},
    create: { name: '华杯数学', description: '华罗庚金杯小学数学邀请赛', isActive: true },
  })

  // 每个主题对应一个 module / topic / skill
  const topicIdMap = new Map<string, bigint>()  // topic name → knl_topic.id
  const skillIdMap  = new Map<string, bigint>()  // topic name → knl_skill.id

  for (let i = 0; i < TOPIC_DEFS.length; i++) {
    const td = TOPIC_DEFS[i]

    const module = await prisma.knl_Module.upsert({
      where: { id: i + 1 },
      update: { name: td.name },
      create: {
        systemId: system.id,
        name: td.name,
        examWeight: td.examWeight,
        olympiadWeight: td.olympiadWeight,
        sortOrder: i + 1,
      },
    })

    // Knl_Topic has BigInt id
    let topic = await prisma.knl_Topic.findFirst({ where: { moduleId: module.id } })
    if (!topic) {
      topic = await prisma.knl_Topic.create({
        data: {
          moduleId: module.id,
          name: td.name,
          gradeStart: 5,
          gradeEnd: 6,
          difficulty: 2,
          sortOrder: i + 1,
        },
      })
    }
    topicIdMap.set(td.name, topic.id)

    let skill = await prisma.knl_Skill.findFirst({ where: { topicId: topic.id } })
    if (!skill) {
      skill = await prisma.knl_Skill.create({
        data: {
          topicId: topic.id,
          name: `${td.name}（综合）`,
          gradeStart: 5,
          gradeEnd: 6,
          difficulty: 2,
          sortOrder: 1,
        },
      })
    }
    skillIdMap.set(td.name, skill.id)
  }
  console.log(`  ✓ 知识体系：${TOPIC_DEFS.length} 个主题\n`)

  // ─── 2. 章节 ─────────────────────────────────────────────────
  console.log('📚 初始化章节...')
  const c01 = await prisma.knl_Chapter.upsert({
    where: { code: 'C01' },
    update: { name: '第4章·整除与余数', subtitle: '整除判断 · 余数运算 · 同余性质', topicId: topicIdMap.get('整除 · 余数') },
    create: { code: 'C01', name: '第4章·整除与余数', subtitle: '整除判断 · 余数运算 · 同余性质',
              grade: 5, sortOrder: 1, isActive: true, topicId: topicIdMap.get('整除 · 余数') ?? null },
  })
  const c02 = await prisma.knl_Chapter.upsert({
    where: { code: 'C02' },
    update: { name: '第5章·行程与应用', subtitle: '相遇追及 · 流水行船 · 工程问题', topicId: topicIdMap.get('行程 · 速度') },
    create: { code: 'C02', name: '第5章·行程与应用', subtitle: '相遇追及 · 流水行船 · 工程问题',
              grade: 5, sortOrder: 2, isActive: true, topicId: topicIdMap.get('行程 · 速度') ?? null },
  })
  console.log(`  ✓ 章节 C01 [id=${c01.id}]，C02 [id=${c02.id}]\n`)

  // ─── 3. 评测题目 + 知识映射 ───────────────────────────────────
  console.log('❓ 初始化评测题目...')
  // 按 origId 排序（保持与前端 id 顺序一致）
  const sortedQs = [...ASSESSMENT_QUESTIONS].sort((a, b) => a.origId - b.origId)

  const questionIdByOrigId = new Map<number, bigint>()
  for (const q of sortedQs) {
    const existing = await prisma.knl_Question.findFirst({
      where: { stemLatex: q.stem },
    })
    const question = existing ?? await prisma.knl_Question.create({
      data: {
        grade: 5,
        difficulty: 2,
        stemLatex: q.stem,
        options: q.options,
        answerLatex: q.correct,
      },
    })
    questionIdByOrigId.set(q.origId, question.id)

    // 技能映射（isPrimary = true）
    const skillId = skillIdMap.get(q.topic)
    if (skillId) {
      await prisma.knl_QuestionSkillMap.upsert({
        where: { questionId_skillId: { questionId: question.id, skillId } },
        update: {},
        create: { questionId: question.id, skillId, isPrimary: true },
      })
    }
  }
  console.log(`  ✓ ${sortedQs.length} 道评测题目\n`)

  // ─── 4. 评测题库 ─────────────────────────────────────────────
  console.log('📋 初始化评测题库...')
  let pool = await prisma.onb_QuestionPool.findFirst({ where: { grade: 5, isActive: true } })
  if (!pool) {
    pool = await prisma.onb_QuestionPool.create({
      data: { grade: 5, difficultyBand: 'medium', poolName: '五年级华杯评测题库', version: 'v1', isActive: true },
    })
  }
  // 清除旧映射，按 origId 顺序重建（确保题目排序与前端一致）
  await prisma.onb_PoolQuestionMap.deleteMany({ where: { poolId: pool.id } })
  let orderNum = 0
  for (const q of sortedQs) {
    const qId = questionIdByOrigId.get(q.origId)!
    await prisma.onb_PoolQuestionMap.create({
      data: { poolId: pool.id, questionId: qId, orderNum: orderNum++ },
    })
  }
  console.log(`  ✓ 题库 pool [id=${pool.id}]，${sortedQs.length} 道题\n`)

  // ─── 5. 测试用户 & 学生 ───────────────────────────────────────
  console.log('👤 初始化测试用户...')
  const user = await prisma.usr_User.upsert({
    where: { openid: 'mock_openid_test-wx-' },
    update: { nickname: '测试家长' },
    create: { openid: 'mock_openid_test-wx-', nickname: '测试家长', parentPhone: '13800138000' },
  })

  let student = await prisma.usr_Student.findFirst({ where: { userId: user.id, name: '小明' } })
  if (!student) {
    student = await prisma.usr_Student.create({
      data: { userId: user.id, name: '小明', grade: 5, isDefault: true },
    })
  }
  const sid = student.id
  console.log(`  ✓ 学生 [id=${sid}] 小明\n`)

  // ─── 6. 清除旧作业 / 训练计划数据 ────────────────────────────
  console.log('🧹 清除旧测试数据...')
  await prisma.stu_Dialogue.deleteMany({ where: { problem: { assignment: { studentId: sid } } } })
  await prisma.stu_Problem.deleteMany({ where: { assignment: { studentId: sid } } })
  await prisma.stu_ReviewSession.deleteMany({ where: { assignment: { studentId: sid } } })
  await prisma.stu_Assignment.deleteMany({ where: { studentId: sid } })
  await prisma.stu_TrainingPlan.deleteMany({ where: { studentId: sid } })
  await prisma.stu_DailyCheckIn.deleteMany({ where: { studentId: sid } })

  // 清除旧学习项目（级联删除：sprint → milestones）
  const oldProjects = await prisma.pla_LearningProject.findMany({ where: { studentId: sid } })
  for (const p of oldProjects) {
    const sprint = await prisma.pla_SprintPlan.findUnique({ where: { projectId: p.id } })
    if (sprint) {
      await prisma.pla_Milestone.deleteMany({ where: { sprintPlanId: sprint.id } })
      await prisma.pla_SprintPlan.delete({ where: { id: sprint.id } })
    }
    await prisma.onb_AbilityAssessment.deleteMany({ where: { projectId: p.id } })
    await prisma.pla_LearningProject.delete({ where: { id: p.id } })
  }
  console.log('  ✓ 清除完成\n')

  // ─── 7. 学习项目 + 冲刺计划 + 里程碑 ─────────────────────────
  console.log('🎯 创建学习项目 & 冲刺计划...')
  const project = await prisma.pla_LearningProject.create({
    data: { studentId: sid, targetDate: new Date('2026-11-20'), status: 'active' },
  })
  const sprint = await prisma.pla_SprintPlan.create({
    data: {
      projectId: project.id,
      totalDays: 67,
      competitionName: '华杯小学数学邀请赛',
      dailyMinutes: 90,
    },
  })

  const chapterCodeToId = new Map<string, number>([['C01', c01.id], ['C02', c02.id]])
  const planStart = new Date('2026-04-22')
  planStart.setHours(0, 0, 0, 0)
  let cursor = new Date(planStart)
  let totalPlans = 0

  const milestoneIds: bigint[] = []
  for (const mDef of MILESTONE_DEFS) {
    const mStart = new Date(cursor)
    const mEnd   = addDays(mStart, mDef.durationDays - 1)

    const milestone = await prisma.pla_Milestone.create({
      data: {
        sprintPlanId: sprint.id,
        seq: mDef.seq,
        name: mDef.name,
        startDate: mStart,
        endDate: mEnd,
        durationDays: mDef.durationDays,
        scoreBefore: mDef.scoreBefore,
        scoreTarget: mDef.scoreTarget,
        status: mDef.status,
      },
    })
    milestoneIds.push(milestone.id)

    const schedule = mDef.schedule
    const cycleLen = schedule.length
    let dayCount  = 0

    for (let day = 0; day < mDef.durationDays; day++) {
      const planDate = addDays(mStart, day)
      if (planDate.getDay() === 0) continue  // 跳过周日

      const slot      = schedule[dayCount % cycleLen]
      const chapterId = chapterCodeToId.get(slot.chapterCode) ?? null

      await prisma.stu_TrainingPlan.create({
        data: {
          studentId: sid,
          sprintPlanId: sprint.id,
          milestoneId: milestone.id,
          chapterId,
          planDate,
          topic: slot.topic,
          keyPoints: slot.keyPoints,
        },
      })
      dayCount++
      totalPlans++
    }
    cursor = addDays(mEnd, 1)
  }
  console.log(`  ✓ 3 个里程碑，${totalPlans} 个训练计划\n`)

  // ─── 8. 示例作业 + 题目 + 对话 ──────────────────────────────
  console.log('📝 创建示例作业...')

  interface AssignSpec {
    date: string; chId: number
    status: 'ocr_pending'|'ocr_done'|'grading'|'graded'|'reviewed'
    problems: ProblemSpec[]; moodText?: string
  }

  const ASSIGNMENTS: AssignSpec[] = [
    { date: '2026-04-22', chId: c01.id, status: 'reviewed',
      moodText: '整除判断掌握扎实！注意余数运算别马虎，继续加油！', problems: PROBLEMS_C01 },
    { date: '2026-04-23', chId: c01.id, status: 'reviewed',
      moodText: '带余除法理解到位，验证步骤很完整！',
      problems: PROBLEMS_C01.map((p, i) => ({ ...p, seq: i+1,
        result: i < 4 ? 'correct' : i === 4 ? 'wrong' : 'unknown' })) as ProblemSpec[] },
    { date: '2026-04-25', chId: c01.id, status: 'graded',
      problems: PROBLEMS_C01.map((p, i) => ({ ...p, seq: i+1,
        result: i < 5 ? 'correct' : 'wrong' })) as ProblemSpec[] },
    { date: '2026-04-27', chId: c01.id, status: 'ocr_pending', problems: [] },
    { date: '2026-05-13', chId: c02.id, status: 'reviewed',
      moodText: '相遇问题公式运用熟练！追及问题还需多练习。', problems: PROBLEMS_C02 },
    { date: '2026-05-14', chId: c02.id, status: 'graded',
      problems: PROBLEMS_C02.map((p, i) => ({ ...p, seq: i+1,
        result: i < 3 ? 'correct' : 'unknown' })) as ProblemSpec[] },
    { date: '2026-05-15', chId: c02.id, status: 'ocr_pending', problems: [] },
  ]

  let firstWrongProblemId: bigint | null = null
  let totalProblems = 0

  for (const spec of ASSIGNMENTS) {
    const correct  = spec.problems.filter(p => p.result === 'correct').length
    const wrong    = spec.problems.filter(p => p.result === 'wrong').length
    const unknown  = spec.problems.filter(p => p.result === 'unknown').length

    const asgn = await prisma.stu_Assignment.create({
      data: {
        studentId:    sid,
        chapterId:    spec.chId,
        planDate:     new Date(spec.date),
        imageUrl:     `https://placeholder.dev/hw_${spec.date}.jpg`,
        status:       spec.status,
        totalCount:   spec.problems.length,
        correctCount: correct,
        wrongCount:   wrong,
        unknownCount: unknown,
        moodText:     spec.moodText ?? null,
      },
    })

    for (const prob of spec.problems) {
      const created = await prisma.stu_Problem.create({
        data: {
          assignmentId:   asgn.id,
          seq:            prob.seq,
          ocrText:        prob.text,
          studentAnswer:  prob.studentAnswer,
          correctAnswer:  prob.correctAnswer,
          result:         prob.result,
          knowledgePoint: prob.knowledgePoint,
          trapDesc:       prob.trapDesc ?? null,
          solutionText:   prob.solutionText,
          reviewStatus:   spec.status === 'reviewed' ? 'done' : 'pending',
          reviewStage:    spec.status === 'reviewed' ? 1 : 0,
          nextReviewAt:   spec.status === 'reviewed'
            ? new Date(Date.now() + 3 * 86400_000) : null,
        },
      })
      totalProblems++
      if (prob.result === 'wrong' && firstWrongProblemId === null) {
        firstWrongProblemId = created.id
      }
    }

    if (spec.status === 'reviewed') {
      await prisma.stu_ReviewSession.create({
        data: {
          assignmentId:   asgn.id,
          startedAt:      new Date(spec.date + 'T18:00:00'),
          completedAt:    new Date(spec.date + 'T18:30:00'),
          notifiedParent: true,
          notifiedAt:     new Date(spec.date + 'T18:31:00'),
          summaryText:    spec.moodText ?? null,
        },
      })
    }
  }
  console.log(`  ✓ ${ASSIGNMENTS.length} 份作业，${totalProblems} 道题目\n`)

  // ─── 9. AI 辅导对话样本 ───────────────────────────────────────
  if (firstWrongProblemId) {
    console.log('💬 创建 AI 辅导对话样本...')
    const dialogues = [
      { role: 'ai'      as const, content: '我看到这道题你做错了。被3整除的判断方法：把各位数字加起来，如果和能被3整除，原数就能被3整除。用这个方法检验 354 能否被3整除？' },
      { role: 'student' as const, content: '3+5+4=12，12能被3整除，所以354能被3整除？' },
      { role: 'ai'      as const, content: '完全正确！那 237 能否被3整除？' },
      { role: 'student' as const, content: '2+3+7=12，能被3整除！' },
      { role: 'ai'      as const, content: '太棒了！记住这个技巧，考试时不需要直接做除法。' },
    ]
    for (const d of dialogues) {
      await prisma.stu_Dialogue.create({
        data: { problemId: firstWrongProblemId, role: d.role, content: d.content },
      })
    }
    console.log(`  ✓ ${dialogues.length} 条对话\n`)
  }

  // ─── 10. 打卡记录 ────────────────────────────────────────────
  console.log('🔥 创建打卡记录...')
  const checkins = [
    { date: '2026-04-22', streak: 1 },
    { date: '2026-04-23', streak: 2 },
    { date: '2026-04-25', streak: 3 },
    { date: '2026-05-13', streak: 4 },
    { date: '2026-05-14', streak: 5 },
  ]
  for (const ci of checkins) {
    await prisma.stu_DailyCheckIn.create({
      data: { studentId: sid, checkDate: new Date(ci.date), streak: ci.streak },
    })
  }
  console.log(`  ✓ ${checkins.length} 条打卡\n`)

  // ─── 汇总 ────────────────────────────────────────────────────
  console.log('─'.repeat(45))
  console.log('✅ 测试数据初始化完成！')
  console.log(`   学生 ID    : ${sid}`)
  console.log(`   openid     : mock_openid_test-wx-`)
  console.log(`   登录 code  : test-wx-code（前8位生成 openid）`)
  console.log(`   章节 C01   : id=${c01.id}，章节 C02 : id=${c02.id}`)
  console.log(`   训练计划   : ${totalPlans} 条`)
  console.log('─'.repeat(45))
}

main()
  .catch((e) => { console.error('❌ Seed 失败:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
