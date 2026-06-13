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
          include: {
            chapter: true,
            planItems: {
              include: { question: true },
              orderBy: { orderNum: 'asc' }
            }
          },
          orderBy: { planDate: 'asc' }
        })

        const assignments = await prisma.stu_Assignment.findMany({
          where: {
            studentId: sid,
            planDate: { gte: startDate, lte: endDate }
          },
          select: { planDate: true, status: true }
        })

        // 按日期聚合所有 assignment 状态（一道题一条记录）
        const assignmentsByDate = new Map<string, string[]>()
        for (const a of assignments) {
          if (a.planDate) {
            const dateKey = a.planDate.toISOString().split('T')[0]
            const arr = assignmentsByDate.get(dateKey) ?? []
            arr.push(a.status)
            assignmentsByDate.set(dateKey, arr)
          }
        }

        type PlanWithChapter = Prisma.Stu_TrainingPlanGetPayload<{
          include: { chapter: true; planItems: { include: { question: true } } }
        }>
        const enrichedPlans = plans.map((p: PlanWithChapter) => {
          const dateKey = p.planDate.toISOString().split('T')[0]
          const statuses = assignmentsByDate.get(dateKey) ?? []

          // 当天应完成的题目数（planItems 优先，兜底 1 道）
          const expected = p.planItems.length > 0 ? p.planItems.length : 1
          const gradedCount = statuses.filter(s => s === 'graded' || s === 'reviewed').length
          const reviewedCount = statuses.filter(s => s === 'reviewed').length

          let calendarStatus: string
          if (statuses.length === 0 || gradedCount < expected) {
            // 未上传或只上传了部分
            calendarStatus = 'not_uploaded'
          } else if (reviewedCount >= expected) {
            // 全部题目都已复盘
            calendarStatus = 'completed'
          } else {
            // 全部题目已批改，但未复盘
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
            assignmentStatus: calendarStatus,
            planItems: p.planItems.map((item) => ({
              id: Number(item.id),
              seq: item.orderNum,
              questionId: item.questionId ? Number(item.questionId) : null,
              question: item.question
                ? {
                    id: Number(item.question.id),
                    stemLatex: item.question.stemLatex,
                    options: item.question.options,
                    answerLatex: item.question.answerLatex,
                  }
                : null,
            })),
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
