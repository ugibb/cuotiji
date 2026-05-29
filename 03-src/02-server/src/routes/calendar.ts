import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { ok, fail, JwtPayload } from '../types/index'
import { authenticate } from '../middleware/auth'

interface CalendarQuery {
  year?: string
  month?: string
  studentId?: string
}

export async function calendarRoutes(fastify: FastifyInstance) {
  // GET /api/calendar - training plans for a month
  fastify.get<{ Querystring: CalendarQuery }>(
    '/calendar',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Querystring: CalendarQuery }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const { year, month, studentId } = request.query

        const y = parseInt(year || String(new Date().getFullYear()), 10)
        const m = parseInt(month || String(new Date().getMonth() + 1), 10)
        const sid = studentId ? BigInt(studentId) : null

        if (!sid) {
          return reply.status(400).send(fail('studentId 不能为空'))
        }

        const student = await prisma.usr_Student.findFirst({
          where: { id: sid, userId: BigInt(payload.userId) }
        })

        if (!student) {
          return reply.status(404).send(fail('未找到该学生'))
        }

        const startDate = new Date(y, m - 1, 1)
        const endDate = new Date(y, m, 0)

        const plans = await prisma.stu_TrainingPlan.findMany({
          where: {
            studentId: sid,
            planDate: { gte: startDate, lte: endDate }
          },
          include: { chapter: true },
          orderBy: { planDate: 'asc' }
        })

        const assignments = await prisma.stu_Assignment.findMany({
          where: {
            studentId: sid,
            planDate: { gte: startDate, lte: endDate }
          },
          select: { planDate: true, status: true }
        })

        const assignmentsByDate = new Map<string, string>()
        for (const a of assignments) {
          if (a.planDate) {
            const dateKey = a.planDate.toISOString().split('T')[0]
            assignmentsByDate.set(dateKey, a.status)
          }
        }

        type PlanWithChapter = Prisma.Stu_TrainingPlanGetPayload<{ include: { chapter: true } }>
        const enrichedPlans = plans.map((p: PlanWithChapter) => {
          const dateKey = p.planDate.toISOString().split('T')[0]
          const assignmentStatus = assignmentsByDate.get(dateKey)

          let calendarStatus: string
          if (!assignmentStatus) {
            calendarStatus = 'not_uploaded'
          } else if (assignmentStatus === 'reviewed' || assignmentStatus === 'graded') {
            calendarStatus = 'completed'
          } else {
            calendarStatus = 'uploaded_pending'
          }

          return {
            id: Number(p.id),
            studentId: Number(p.studentId),
            project: '华杯备赛',
            chapterId: p.chapterId,
            planDate: dateKey,
            topic: p.topic,
            keyPoints: p.keyPoints as string[] | null,
            chapter: p.chapter ? {
              id: p.chapter.id,
              code: p.chapter.code,
              name: p.chapter.name,
              subtitle: p.chapter.subtitle
            } : null,
            assignmentStatus: calendarStatus
          }
        })

        return reply.send(ok({ plans: enrichedPlans }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取日历数据失败'
        return reply.status(500).send(fail(message))
      }
    }
  )
}
