import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../utils/prisma'
import { ok, fail, JwtPayload } from '../types/index'
import { authenticate } from '../middleware/auth'

interface StudentParams {
  studentId: string
}

interface GenerateBody {
  studentId: number
  examDate?: string        // YYYY-MM-DD，可选，默认 6 个月后
  competitionName?: string
  dailyMinutes?: number    // 每日学习分钟数，可选，默认 90
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

// 里程碑定义（对应 mock-plan-data.ts 的 MOCK_MILESTONES）
const MILESTONE_DEFS = [
  {
    seq: 1,
    name: '整除与余数',
    durationDays: 21,
    focusTopics: ['整除与余数'],
    tags: ['整除判断', '余数运算', '同余性质', '中国剩余定理入门'],
    scoreBefore: 45,
    scoreTarget: 75,
  },
  {
    seq: 2,
    name: '行程·应用综合',
    durationDays: 25,
    focusTopics: ['行程与速度', '应用综合'],
    tags: ['相遇追及', '流水行船', '综合应用'],
    scoreBefore: 55,
    scoreTarget: 72,
  },
  {
    seq: 3,
    name: '综合冲刺',
    durationDays: 21,
    focusTopics: [],
    tags: ['真题模拟', '弱点专项', '冲刺训练'],
    scoreBefore: null,
    scoreTarget: null,
  },
]

// 逐日计划内容（对应 DAILY 中的 topic + keyPoints + chapter code）
const M1_SCHEDULE: Array<{ topic: string; keyPoints: string[]; chapterCode: string }> = [
  { topic: '整除判断基础', keyPoints: ['整除的定义与意义', '整除判断规则（2/3/5）', '因数与倍数关系'], chapterCode: 'C01' },
  { topic: '带余除法', keyPoints: ['带余除法的意义', '余数与除数的大小关系', '验证与还原计算'], chapterCode: 'C01' },
  { topic: '带余除法（练习）', keyPoints: ['综合题型训练', '余数还原法', '错误归因分析'], chapterCode: 'C01' },
  { topic: '余数的性质', keyPoints: ['余数的范围', '余数的加减运算性质', '整除与余数关系'], chapterCode: 'C01' },
  { topic: '余数的性质（练习）', keyPoints: ['综合运用余数', '求数字末位', '周期问题入门'], chapterCode: 'C01' },
  { topic: '同余定义与性质', keyPoints: ['同余的定义', '同余的基本性质', '同余的加法运算'], chapterCode: 'C01' },
  { topic: '同余定义与性质（练习）', keyPoints: ['综合运用同余', '求数字末位', '周期问题入门'], chapterCode: 'C01' },
  { topic: '中国剩余定理入门', keyPoints: ['联立同余方程', '中国剩余定理思路', '简单竞赛例题'], chapterCode: 'C01' },
  { topic: '整除余数综合练习', keyPoints: ['综合技巧串联', '竞赛真题训练', '错题归纳复盘'], chapterCode: 'C01' },
]

const M2_SCHEDULE: Array<{ topic: string; keyPoints: string[]; chapterCode: string }> = [
  { topic: '相遇追及基础', keyPoints: ['相遇问题核心公式', '追及问题建模', '速度差时间关系'], chapterCode: 'C02' },
  { topic: '相遇追及进阶', keyPoints: ['多次相遇计算', '环形跑道问题', '复杂追及建模'], chapterCode: 'C02' },
  { topic: '流水行船', keyPoints: ['顺水逆水速度', '水速与船速分离', '往返时间计算'], chapterCode: 'C02' },
  { topic: '流水行船（练习）', keyPoints: ['综合题型训练', '往返多段', '竞赛例题分析'], chapterCode: 'C02' },
  { topic: '工程问题', keyPoints: ['工作效率概念', '合作完成时间', '多人协作模型'], chapterCode: 'C02' },
  { topic: '工程问题（练习）', keyPoints: ['效率变化问题', '交替工作', '综合应用'], chapterCode: 'C02' },
  { topic: '行程图解法', keyPoints: ['线段图建模', '图表分析方法', '多步行程解析'], chapterCode: 'C02' },
  { topic: '综合行程应用', keyPoints: ['列车过桥', '火车相遇', '复合行程问题'], chapterCode: 'C02' },
  { topic: '综合行程（练习）', keyPoints: ['竞赛真题训练', '技巧串联', '错题归纳复盘'], chapterCode: 'C02' },
]

const M3_SCHEDULE: Array<{ topic: string; keyPoints: string[]; chapterCode: string }> = [
  { topic: '综合冲刺 · 整除专项', keyPoints: ['整除余数真题', '重点错题复盘'], chapterCode: 'C01' },
  { topic: '综合冲刺 · 行程专项', keyPoints: ['行程综合真题', '复合模型解析'], chapterCode: 'C02' },
  { topic: '综合冲刺 · 模拟考试', keyPoints: ['全真模拟', '时间管理'], chapterCode: 'C01' },
]

interface PreviewBody {
  examDate?: string
  dailyMinutes?: number
}

// 纯计算，不涉及 DB — preview 和 generate 共用
function computePlanPreview(examDate: string | undefined, dailyMinutes: number) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const examDateStr = examDate || dateStr(addDays(today, 180))
  const examDateObj = new Date(examDateStr)
  examDateObj.setHours(0, 0, 0, 0)
  const totalDays = Math.max(7, Math.ceil((examDateObj.getTime() - today.getTime()) / 86400000))

  const baseDays = MILESTONE_DEFS.reduce((s, m) => s + m.durationDays, 0)
  const scaled = MILESTONE_DEFS.map((def, i) => ({
    ...def,
    durationDays: i < MILESTONE_DEFS.length - 1
      ? Math.max(7, Math.round(totalDays * def.durationDays / baseDays))
      : 0,
  }))
  const usedDays = scaled.slice(0, -1).reduce((s, d) => s + d.durationDays, 0)
  scaled[scaled.length - 1].durationDays = Math.max(7, totalDays - usedDays)

  let cursor = new Date(today)
  const milestones = scaled.map((def, i) => {
    const mStart = new Date(cursor)
    const mEnd = addDays(mStart, def.durationDays - 1)
    cursor = addDays(mEnd, 1)
    return {
      seq: def.seq,
      name: def.name,
      startDate: dateStr(mStart),
      endDate: dateStr(mEnd),
      durationDays: def.durationDays,
      status: i === 0 ? 'active' : 'locked',
      scoreBefore: def.scoreBefore,
      scoreTarget: def.scoreTarget,
      tags: def.tags,
    }
  })

  return { today, totalDays, dailyMinutes, scaledDefs: scaled, milestones }
}

export async function trainingPlanRoutes(fastify: FastifyInstance) {
  // GET /training-plans?studentId=X&year=Y&month=M — 按月查询训练计划
  fastify.get<{ Querystring: { studentId?: string; year?: string; month?: string } }>(
    '/training-plans',
    { preHandler: authenticate },
    async (
      request: FastifyRequest<{ Querystring: { studentId?: string; year?: string; month?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const payload = request.user as JwtPayload
        const { studentId, year, month } = request.query

        if (!studentId) return reply.status(400).send(fail('studentId 不能为空'))
        const sid = BigInt(studentId)

        const student = await prisma.usr_Student.findFirst({
          where: { id: sid, userId: BigInt(payload.userId) },
        })
        if (!student) return reply.status(404).send(fail('未找到该学生'))

        const y = parseInt(year || String(new Date().getFullYear()), 10)
        const m = parseInt(month || String(new Date().getMonth() + 1), 10)
        const startDate = new Date(y, m - 1, 1)
        const endDate = new Date(y, m, 0)

        const plans = await prisma.stu_TrainingPlan.findMany({
          where: {
            studentId: sid,
            planDate: { gte: startDate, lte: endDate },
          },
          include: {
            chapter: true,
            planItems: {
              include: { question: true },
              orderBy: { orderNum: 'asc' },
            },
          },
          orderBy: { planDate: 'asc' },
        })

        const assignments = await prisma.stu_Assignment.findMany({
          where: {
            studentId: sid,
            planDate: { gte: startDate, lte: endDate },
          },
          select: { planDate: true, status: true },
        })

        const assignByDate = new Map<string, string>()
        for (const a of assignments) {
          if (a.planDate) assignByDate.set(dateStr(a.planDate), a.status)
        }

        const result = plans.map((p) => {
          const dk = dateStr(p.planDate)
          const aStatus = assignByDate.get(dk)
          let assignmentStatus: string
          if (!aStatus) {
            assignmentStatus = 'not_uploaded'
          } else if (aStatus === 'reviewed' || aStatus === 'graded') {
            assignmentStatus = 'completed'
          } else {
            assignmentStatus = 'uploaded_pending'
          }

          return {
            id: Number(p.id),
            studentId: Number(p.studentId),
            project: '华杯备赛',
            chapterId: p.chapterId,
            planDate: dk,
            topic: p.topic,
            keyPoints: (p.keyPoints as string[]) ?? [],
            chapter: p.chapter
              ? {
                  id: p.chapter.id,
                  code: p.chapter.code,
                  name: p.chapter.name,
                  subtitle: p.chapter.subtitle,
                  grade: p.chapter.grade,
                  sortOrder: p.chapter.sortOrder,
                  isActive: p.chapter.isActive,
                }
              : null,
            assignmentStatus,
            planItems: p.planItems?.map((item) => ({
              id: Number(item.id),
              seq: item.orderNum + 1,
              questionId: item.questionId ? Number(item.questionId) : null,
              question: item.question
                ? {
                    id: Number(item.question.id),
                    stemLatex: item.question.stemLatex,
                    options: item.question.options,
                    answerLatex: item.question.answerLatex,
                  }
                : null,
            })) ?? [],
          }
        })

        return reply.send(ok({ plans: result }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取训练计划失败'
        return reply.status(500).send(fail(message))
      }
    },
  )

  // POST /training-plans/preview — 纯计算预览，不写库
  fastify.post<{ Body: PreviewBody }>(
    '/training-plans/preview',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Body: PreviewBody }>, reply: FastifyReply) => {
      try {
        const { examDate, dailyMinutes = 90 } = request.body
        const { totalDays, milestones } = computePlanPreview(examDate, dailyMinutes)
        return reply.send(ok({ totalDays, dailyMinutes, milestoneCount: milestones.length, milestones }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '预览计算失败'
        return reply.status(500).send(fail(message))
      }
    },
  )

  // POST /training-plans/generate — 根据评测结果生成训练计划
  fastify.post<{ Body: GenerateBody }>(
    '/training-plans/generate',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Body: GenerateBody }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const {
          studentId,
          competitionName = '华杯小学数学邀请赛',
          dailyMinutes = 90,
        } = request.body

        if (!studentId) return reply.status(400).send(fail('studentId 不能为空'))
        const sid = BigInt(studentId)

        const student = await prisma.usr_Student.findFirst({
          where: { id: sid, userId: BigInt(payload.userId) },
        })
        if (!student) return reply.status(404).send(fail('未找到该学生'))

        // 复用预览计算逻辑（examDate 未传时默认 6 个月后）
        const { today, totalDays, scaledDefs } = computePlanPreview(request.body.examDate, dailyMinutes)
        const examDate = request.body.examDate ?? dateStr(addDays(today, 180))

        // 查找章节
        const chapterMap = new Map<string, number>()
        const chapters = await prisma.knl_Chapter.findMany({
          where: { code: { in: ['C01', 'C02'] } },
          select: { id: true, code: true },
        })
        for (const c of chapters) chapterMap.set(c.code, c.id)

        // 查找或创建 learning project
        let project = await prisma.pla_LearningProject.findFirst({
          where: { studentId: sid },
          orderBy: { createdAt: 'desc' },
        })
        if (!project) {
          project = await prisma.pla_LearningProject.create({
            data: {
              studentId: sid,
              targetDate: new Date(examDate),
              status: 'active',
            },
          })
        } else {
          project = await prisma.pla_LearningProject.update({
            where: { id: project.id },
            data: { targetDate: new Date(examDate), status: 'active' },
          })
        }

        // 查找或创建 sprint plan（每个 project 唯一），始终更新 totalDays/dailyMinutes
        let sprint = await prisma.pla_SprintPlan.findUnique({ where: { projectId: project.id } })
        if (!sprint) {
          sprint = await prisma.pla_SprintPlan.create({
            data: {
              projectId: project.id,
              totalDays,
              competitionName,
              dailyMinutes,
            },
          })
        } else {
          sprint = await prisma.pla_SprintPlan.update({
            where: { id: sprint.id },
            data: { totalDays, competitionName, dailyMinutes },
          })
        }

        // 清除旧里程碑和训练计划
        await prisma.stu_TrainingPlan.deleteMany({
          where: { studentId: sid, sprintPlanId: sprint.id },
        })
        await prisma.pla_Milestone.deleteMany({ where: { sprintPlanId: sprint.id } })

        // 从今天开始生成里程碑 + 训练计划
        let cursor = new Date(today)

        for (const mDef of scaledDefs) {
          const mStart = new Date(cursor)
          const mEnd = addDays(mStart, mDef.durationDays - 1)

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
              status: mDef.seq === 1 ? 'active' : 'locked',
            },
          })

          const schedule = mDef.seq === 1 ? M1_SCHEDULE : mDef.seq === 2 ? M2_SCHEDULE : M3_SCHEDULE
          const cycleLen = schedule.length
          let dayCount = 0

          for (let day = 0; day < mDef.durationDays; day++) {
            const planDate = addDays(mStart, day)
            // 周日跳过（getDay() === 0）
            if (planDate.getDay() === 0) continue

            const slot = schedule[dayCount % cycleLen]
            const chapterId = chapterMap.get(slot.chapterCode) ?? null

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
          }

          cursor = addDays(mEnd, 1)
        }

        const milestones = await prisma.pla_Milestone.findMany({
          where: { sprintPlanId: sprint.id },
          orderBy: { seq: 'asc' },
        })

        return reply.status(201).send(
          ok({
            sprintPlanId: Number(sprint.id),
            projectId: Number(project.id),
            totalDays,
            dailyMinutes,
            milestoneCount: milestones.length,
            milestones: milestones.map((m, idx) => {
              const def = scaledDefs[idx] ?? scaledDefs[scaledDefs.length - 1]
              return {
                id: Number(m.id),
                seq: m.seq,
                name: m.name,
                startDate: m.startDate ? dateStr(m.startDate) : null,
                endDate: m.endDate ? dateStr(m.endDate) : null,
                durationDays: m.durationDays,
                status: m.status,
                scoreBefore: m.scoreBefore,
                scoreTarget: m.scoreTarget,
                tags: def.tags,
              }
            }),
          }),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : '生成训练计划失败'
        return reply.status(500).send(fail(message))
      }
    },
  )

  // GET /milestones/:studentId — 获取学生里程碑
  fastify.get<{ Params: StudentParams }>(
    '/milestones/:studentId',
    { preHandler: authenticate },
    async (
      request: FastifyRequest<{ Params: StudentParams }>,
      reply: FastifyReply,
    ) => {
      try {
        const payload = request.user as JwtPayload
        const sid = BigInt(request.params.studentId)

        const student = await prisma.usr_Student.findFirst({
          where: { id: sid, userId: BigInt(payload.userId) },
        })
        if (!student) return reply.status(404).send(fail('未找到该学生'))

        const project = await prisma.pla_LearningProject.findFirst({
          where: { studentId: sid },
          orderBy: { createdAt: 'desc' },
          include: {
            sprintPlan: {
              include: {
                milestones: { orderBy: { seq: 'asc' } },
              },
            },
          },
        })

        if (!project?.sprintPlan) {
          return reply.send(ok({ milestones: [] }))
        }

        const TAG_COLORS = ['blue', 'amber', 'green']

        const milestones = project.sprintPlan.milestones.map((m, i) => {
          const start = m.startDate ? dateStr(m.startDate) : null
          const end = m.endDate ? dateStr(m.endDate) : null
          const dateRange = start && end ? `${formatDateCN(start)} — ${formatDateCN(end)}` : ''
          const dayStart = i === 0 ? 1 : project.sprintPlan!.milestones
            .slice(0, i)
            .reduce((s, prev) => s + (prev.durationDays ?? 0), 1)
          const dayEnd = dayStart + (m.durationDays ?? 0) - 1

          return {
            id: `M${m.seq}`,
            title: m.name,
            tagColor: TAG_COLORS[i % TAG_COLORS.length],
            dayRange: `第 ${dayStart}-${dayEnd} 天`,
            dateRange,
            tags: [],
            goal: m.scoreTarget
              ? `目标：${m.name} ${m.scoreBefore ?? '?'}→${m.scoreTarget}分`
              : `冲刺阶段 · ${m.name}`,
            status: m.status,
            progress: 0,
          }
        })

        return reply.send(ok({ milestones }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取里程碑失败'
        return reply.status(500).send(fail(message))
      }
    },
  )
}

function formatDateCN(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}月${parseInt(d)}日`
}
