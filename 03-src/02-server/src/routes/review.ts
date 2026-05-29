import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../utils/prisma'
import { ok, fail, JwtPayload } from '../types/index'
import { authenticate } from '../middleware/auth'

const REVIEW_INTERVALS = [1, 3, 7, 14, 30]
const MASTERED_STAGE = REVIEW_INTERVALS.length

function nextReviewDate(stage: number): Date {
  const intervalDays = REVIEW_INTERVALS[Math.min(stage, REVIEW_INTERVALS.length - 1)]
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + intervalDays)
  return d
}

function todayStart(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function todayEnd(): Date {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

export async function reviewRoutes(fastify: FastifyInstance) {
  // GET /api/review/daily?studentId=X
  fastify.get<{ Querystring: { studentId?: string } }>(
    '/review/daily',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Querystring: { studentId?: string } }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const { studentId } = request.query

        if (!studentId) return reply.status(400).send(fail('studentId 不能为空'))

        const student = await prisma.usr_Student.findFirst({
          where: { id: BigInt(studentId), userId: BigInt(payload.userId) }
        })
        if (!student) return reply.status(404).send(fail('未找到该学生'))

        const today = todayStart()

        const dueProblems = await prisma.stu_Problem.findMany({
          where: {
            result: { in: ['wrong', 'unknown'] },
            reviewStage: { lt: MASTERED_STAGE },
            masteredAt: null,
            nextReviewAt: { lte: todayEnd() },
            assignment: { studentId: BigInt(studentId) }
          },
          orderBy: [{ nextReviewAt: 'asc' }, { createdAt: 'asc' }],
          take: 5
        })

        let problems = dueProblems

        if (problems.length < 3) {
          const needed = 5 - problems.length
          const existingIds = problems.map(p => p.id)

          const newProblems = await prisma.stu_Problem.findMany({
            where: {
              result: { in: ['wrong', 'unknown'] },
              reviewStage: 0,
              nextReviewAt: null,
              masteredAt: null,
              id: { notIn: existingIds.length ? existingIds : [BigInt(0)] },
              assignment: { studentId: BigInt(studentId) }
            },
            orderBy: { createdAt: 'desc' },
            take: needed
          })

          problems = [...problems, ...newProblems]
        }

        if (problems.length < 3) {
          const needed = 5 - problems.length
          const existingIds = problems.map(p => p.id)

          const fallback = await prisma.stu_Problem.findMany({
            where: {
              result: { in: ['wrong', 'unknown'] },
              masteredAt: null,
              id: { notIn: existingIds.length ? existingIds : [BigInt(0)] },
              assignment: { studentId: BigInt(studentId) }
            },
            orderBy: { createdAt: 'desc' },
            take: needed
          })

          problems = [...problems, ...fallback]
        }

        const checkIn = await prisma.stu_DailyCheckIn.findFirst({
          where: {
            studentId: BigInt(studentId),
            checkDate: { gte: today, lte: todayEnd() }
          }
        })

        return reply.send(ok({
          problems: problems.map(p => ({
            id: Number(p.id),
            seq: p.seq,
            ocrText: p.ocrText,
            correctAnswer: p.correctAnswer,
            result: p.result,
            knowledgePoint: p.knowledgePoint,
            trapDesc: p.trapDesc,
            solutionText: p.solutionText,
            rootCause: p.rootCause,
            reviewStage: p.reviewStage,
            nextReviewAt: p.nextReviewAt?.toISOString().split('T')[0] ?? null
          })),
          checkedInToday: !!checkIn
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取复习题目失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  interface MarkBody { mastered: boolean }
  fastify.post<{ Params: { id: string }; Body: MarkBody }>(
    '/review/problems/:id/mark',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string }; Body: MarkBody }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const problemId = BigInt(request.params.id)
        const { mastered } = request.body

        const problem = await prisma.stu_Problem.findFirst({
          where: {
            id: problemId,
            assignment: { student: { userId: BigInt(payload.userId) } }
          }
        })
        if (!problem) return reply.status(404).send(fail('题目不存在'))

        if (mastered) {
          await prisma.stu_Problem.update({
            where: { id: problemId },
            data: {
              reviewStatus: 'done',
              reviewStage: MASTERED_STAGE,
              masteredAt: new Date(),
              nextReviewAt: null
            }
          })
        } else {
          const newStage = Math.max(0, problem.reviewStage - 1)
          await prisma.stu_Problem.update({
            where: { id: problemId },
            data: {
              reviewStage: newStage,
              nextReviewAt: nextReviewDate(newStage)
            }
          })
        }

        return reply.send(ok({ updated: true }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '标记失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  fastify.post<{ Body: { studentId: number } }>(
    '/review/checkin',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Body: { studentId: number } }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const { studentId } = request.body

        if (!studentId) return reply.status(400).send(fail('studentId 不能为空'))

        const student = await prisma.usr_Student.findFirst({
          where: { id: BigInt(studentId), userId: BigInt(payload.userId) }
        })
        if (!student) return reply.status(404).send(fail('未找到该学生'))

        const today = todayStart()

        const existing = await prisma.stu_DailyCheckIn.findFirst({
          where: {
            studentId: BigInt(studentId),
            checkDate: { gte: today, lte: todayEnd() }
          }
        })
        if (existing) {
          return reply.send(ok({ streak: existing.streak, alreadyCheckedIn: true }))
        }

        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayEnd = new Date(yesterday)
        yesterdayEnd.setHours(23, 59, 59, 999)

        const prevCheckIn = await prisma.stu_DailyCheckIn.findFirst({
          where: {
            studentId: BigInt(studentId),
            checkDate: { gte: yesterday, lte: yesterdayEnd }
          }
        })

        const streak = prevCheckIn ? prevCheckIn.streak + 1 : 1

        await prisma.stu_DailyCheckIn.create({
          data: {
            studentId: BigInt(studentId),
            checkDate: today,
            streak
          }
        })

        return reply.send(ok({ streak, alreadyCheckedIn: false }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '打卡失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  fastify.get<{ Querystring: { studentId?: string } }>(
    '/review/streak',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Querystring: { studentId?: string } }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const { studentId } = request.query

        if (!studentId) return reply.status(400).send(fail('studentId 不能为空'))

        const student = await prisma.usr_Student.findFirst({
          where: { id: BigInt(studentId), userId: BigInt(payload.userId) }
        })
        if (!student) return reply.status(404).send(fail('未找到该学生'))

        const latest = await prisma.stu_DailyCheckIn.findFirst({
          where: { studentId: BigInt(studentId) },
          orderBy: { checkDate: 'desc' }
        })

        if (!latest) return reply.send(ok({ streak: 0, lastCheckDate: null }))

        const today = todayStart()
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        const isActive = latest.checkDate >= yesterday

        return reply.send(ok({
          streak: isActive ? latest.streak : 0,
          lastCheckDate: latest.checkDate.toISOString().split('T')[0]
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取连击失败'
        return reply.status(500).send(fail(message))
      }
    }
  )
}
