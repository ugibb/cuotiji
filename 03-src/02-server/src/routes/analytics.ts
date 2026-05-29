import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { ok, fail, JwtPayload } from '../types/index'
import { authenticate } from '../middleware/auth'

interface WeakpointsQuery {
  studentId?: string
  limit?: string
  timeRange?: 'all' | 'week' | 'month'
}

interface ChapterProblemsQuery {
  studentId?: string
  chapterId?: string
}

type ProblemWithAssignmentChapter = Prisma.Stu_ProblemGetPayload<{
  include: { assignment: { include: { chapter: true } } }
}>

function timeDecayWeight(daysAgo: number): number {
  return 1 / (1 + daysAgo / 7)
}

function buildDateFilter(timeRange: string | undefined): Date | undefined {
  const now = Date.now()
  if (timeRange === 'week') return new Date(now - 7 * 86400_000)
  if (timeRange === 'month') return new Date(now - 30 * 86400_000)
  return undefined
}

export async function analyticsRoutes(fastify: FastifyInstance) {
  // GET /api/analytics/weakpoints
  fastify.get<{ Querystring: WeakpointsQuery }>(
    '/analytics/weakpoints',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Querystring: WeakpointsQuery }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const { studentId, limit = '5', timeRange } = request.query

        if (!studentId) {
          return reply.status(400).send(fail('studentId 不能为空'))
        }

        const student = await prisma.usr_Student.findFirst({
          where: { id: BigInt(studentId), userId: BigInt(payload.userId) }
        })
        if (!student) {
          return reply.status(404).send(fail('未找到该学生'))
        }

        const dateFilter = buildDateFilter(timeRange)

        const problems = await prisma.stu_Problem.findMany({
          where: {
            result: { in: ['wrong', 'unknown'] },
            assignment: {
              studentId: BigInt(studentId),
              ...(dateFilter ? { createdAt: { gte: dateFilter } } : {})
            }
          },
          include: {
            assignment: { include: { chapter: true } }
          },
          orderBy: { createdAt: 'desc' }
        })

        if (problems.length === 0) {
          return reply.send(ok({ weakpoints: [], totalWrong: 0, hasEnoughData: false }))
        }

        const now = new Date()
        const oneWeekAgo = new Date(now.getTime() - 7 * 86400_000)

        const chapterMap = new Map<number, {
          chapterId: number
          chapterName: string
          chapterCode: string
          totalWrong: number
          recentWrong: number
          weaknessScore: number
          lastWrongDate: string
        }>()

        for (const p of problems as ProblemWithAssignmentChapter[]) {
          const chapter = p.assignment.chapter
          if (!chapter) continue
          const daysAgo = Math.floor((now.getTime() - p.createdAt.getTime()) / 86400_000)
          const weight = timeDecayWeight(daysAgo)

          if (!chapterMap.has(chapter.id)) {
            chapterMap.set(chapter.id, {
              chapterId: chapter.id,
              chapterName: chapter.name,
              chapterCode: chapter.code,
              totalWrong: 0,
              recentWrong: 0,
              weaknessScore: 0,
              lastWrongDate: p.createdAt.toISOString().split('T')[0]
            })
          }

          const entry = chapterMap.get(chapter.id)!
          entry.totalWrong += 1
          entry.weaknessScore = Math.round((entry.weaknessScore + weight) * 100) / 100
          if (p.createdAt >= oneWeekAgo) entry.recentWrong += 1
        }

        const weakpoints = Array.from(chapterMap.values())
          .sort((a, b) => b.weaknessScore - a.weaknessScore)
          .slice(0, parseInt(limit, 10))

        return reply.send(ok({
          weakpoints,
          totalWrong: problems.length,
          hasEnoughData: problems.length >= 3
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取薄弱点分析失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  // GET /api/analytics/chapter-problems
  fastify.get<{ Querystring: ChapterProblemsQuery }>(
    '/analytics/chapter-problems',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Querystring: ChapterProblemsQuery }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const { studentId, chapterId } = request.query

        if (!studentId || !chapterId) {
          return reply.status(400).send(fail('studentId 和 chapterId 不能为空'))
        }

        const student = await prisma.usr_Student.findFirst({
          where: { id: BigInt(studentId), userId: BigInt(payload.userId) }
        })
        if (!student) {
          return reply.status(404).send(fail('未找到该学生'))
        }

        const problems = await prisma.stu_Problem.findMany({
          where: {
            result: { in: ['wrong', 'unknown'] },
            assignment: {
              studentId: BigInt(studentId),
              chapterId: parseInt(chapterId, 10)
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 50
        })

        return reply.send(ok({
          problems: problems.map(p => ({
            id: Number(p.id),
            assignmentId: Number(p.assignmentId),
            seq: p.seq,
            ocrText: p.ocrText,
            studentAnswer: p.studentAnswer,
            correctAnswer: p.correctAnswer,
            result: p.result,
            knowledgePoint: p.knowledgePoint,
            trapDesc: p.trapDesc,
            solutionText: p.solutionText,
            rootCause: p.rootCause,
            reviewStatus: p.reviewStatus,
            createdAt: p.createdAt.toISOString().split('T')[0]
          }))
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取章节错题失败'
        return reply.status(500).send(fail(message))
      }
    }
  )
}
