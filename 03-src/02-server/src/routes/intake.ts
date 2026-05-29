import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../utils/prisma'
import { ok, fail, JwtPayload } from '../types/index'
import { authenticate } from '../middleware/auth'
import {
  buildAbilityReport,
  buildAiOpeningMsg,
  topicColor,
  QuestionRecord,
  AbilityReport,
} from '../services/intake.service'

const TOPIC_COLOR_MAP: Record<string, string> = {
  '整除 · 余数': 'blue',
  '整除·余数': 'blue',
  '行程 · 速度': 'amber',
  '行程·速度': 'amber',
  '计数 · 规律': 'green',
  '计数·规律': 'green',
  '鸡兔同笼': 'purple',
  '数列 · 规律': 'teal',
  '数列·规律': 'teal',
  '应用综合': 'rose',
}

interface SubmitBody {
  answers: Record<string, string>
}

interface StudentParams {
  studentId: string
}

export async function intakeRoutes(fastify: FastifyInstance) {
  // GET /intake/questions — 不需要认证，返回评测题目池
  fastify.get(
    '/questions',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 查找 grade=5 的活跃题库
        const pool = await prisma.onb_QuestionPool.findFirst({
          where: { grade: 5, isActive: true },
          include: {
            poolQuestionMap: {
              orderBy: { orderNum: 'asc' },
              include: {
                question: true,
              },
            },
          },
        })

        if (!pool || pool.poolQuestionMap.length === 0) {
          return reply.status(404).send(fail('评测题库暂未配置'))
        }

        // 构建题目列表，按排序号返回
        // topicColor 通过查询 skill → topic chain 获取，或使用 hardcoded map
        const questions = await Promise.all(
          pool.poolQuestionMap.map(async (pqm) => {
            const q = pqm.question

            // 通过 skill_map 获取 topic 名称
            const skillMap = await prisma.knl_QuestionSkillMap.findFirst({
              where: { questionId: q.id, isPrimary: true },
              include: { skill: { include: { topic: true } } },
            })
            const topicName = skillMap?.skill?.topic?.name ?? '综合'
            const color = TOPIC_COLOR_MAP[topicName] ?? topicColor(topicName)

            return {
              id: Number(q.id),
              topic: topicName,
              topicColor: color,
              question: q.stemLatex,
              options: (q.options as Array<{ label: string; text: string }>) ?? [],
              correctOption: q.answerLatex ?? '',
            }
          }),
        )

        return reply.send(ok({ questions }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取评测题目失败'
        return reply.status(500).send(fail(message))
      }
    },
  )

  // POST /intake/submit/:studentId — 提交答题，计算能力报告并存库
  fastify.post<{ Params: StudentParams; Body: SubmitBody }>(
    '/submit/:studentId',
    { preHandler: authenticate },
    async (
      request: FastifyRequest<{ Params: StudentParams; Body: SubmitBody }>,
      reply: FastifyReply,
    ) => {
      try {
        const payload = request.user as JwtPayload
        const studentId = BigInt(request.params.studentId)
        const { answers } = request.body

        if (!answers || typeof answers !== 'object') {
          return reply.status(400).send(fail('answers 不能为空'))
        }

        // 验证学生归属
        const student = await prisma.usr_Student.findFirst({
          where: { id: studentId, userId: BigInt(payload.userId) },
        })
        if (!student) return reply.status(404).send(fail('未找到该学生'))

        // 获取题库问题列表
        const pool = await prisma.onb_QuestionPool.findFirst({
          where: { grade: 5, isActive: true },
          include: {
            poolQuestionMap: {
              orderBy: { orderNum: 'asc' },
              include: { question: true },
            },
          },
        })
        if (!pool) return reply.status(404).send(fail('评测题库未配置'))

        // 构建带 topic 的 QuestionRecord
        const questionRecords: QuestionRecord[] = await Promise.all(
          pool.poolQuestionMap.map(async (pqm) => {
            const q = pqm.question
            const skillMap = await prisma.knl_QuestionSkillMap.findFirst({
              where: { questionId: q.id, isPrimary: true },
              include: { skill: { include: { topic: true } } },
            })
            return {
              id: Number(q.id),
              topic: skillMap?.skill?.topic?.name ?? '综合',
              correctOption: q.answerLatex ?? '',
            }
          }),
        )

        // 计算能力报告
        const report = buildAbilityReport(questionRecords, answers)
        const aiOpeningMsg = buildAiOpeningMsg(report)

        // 查找或创建 learning project
        let project = await prisma.pla_LearningProject.findFirst({
          where: { studentId, status: { not: 'completed' } },
          orderBy: { createdAt: 'desc' },
        })
        if (!project) {
          project = await prisma.pla_LearningProject.create({
            data: { studentId, status: 'assessing' },
          })
        }

        // 更新 onb_ability_assessments
        await prisma.onb_AbilityAssessment.upsert({
          where: { projectId: project.id },
          update: {
            intakeData: answers,
            abilityLevel: report.level,
            weakPoints: report.domains.filter((d) => d.status === 'weak').map((d) => d.name),
            reportData: report as unknown as import('@prisma/client').Prisma.InputJsonValue,
            calibrated: false,
            updatedAt: new Date(),
          },
          create: {
            projectId: project.id,
            intakeData: answers,
            abilityLevel: report.level,
            weakPoints: report.domains.filter((d) => d.status === 'weak').map((d) => d.name),
            reportData: report as unknown as import('@prisma/client').Prisma.InputJsonValue,
          },
        })

        // 更新学生 onboarding_answers
        await prisma.usr_Student.update({
          where: { id: studentId },
          data: { onboardingAnswers: answers },
        })

        return reply.send(ok({ report, aiOpeningMsg }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '提交评测失败'
        return reply.status(500).send(fail(message))
      }
    },
  )

  // GET /intake/report/:studentId — 获取已存储的能力报告
  fastify.get<{ Params: StudentParams }>(
    '/report/:studentId',
    { preHandler: authenticate },
    async (
      request: FastifyRequest<{ Params: StudentParams }>,
      reply: FastifyReply,
    ) => {
      try {
        const payload = request.user as JwtPayload
        const studentId = BigInt(request.params.studentId)

        const student = await prisma.usr_Student.findFirst({
          where: { id: studentId, userId: BigInt(payload.userId) },
        })
        if (!student) return reply.status(404).send(fail('未找到该学生'))

        const project = await prisma.pla_LearningProject.findFirst({
          where: { studentId },
          orderBy: { createdAt: 'desc' },
          include: { assessment: true },
        })

        if (!project?.assessment) {
          return reply.status(404).send(fail('尚未完成评测'))
        }

        const report = project.assessment.reportData as unknown as AbilityReport
        const aiOpeningMsg = buildAiOpeningMsg(report)

        return reply.send(ok({ report, aiOpeningMsg }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取能力报告失败'
        return reply.status(500).send(fail(message))
      }
    },
  )
}
