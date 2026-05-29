import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../utils/prisma'
import { ok, fail, JwtPayload } from '../types/index'
import { authenticate } from '../middleware/auth'

interface CreateSprintBody {
  studentId: number
  subject: string
  examDate: string
}

interface SprintParams {
  id: string
}

function daysUntil(examDate: Date): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const exam = new Date(examDate)
  exam.setHours(0, 0, 0, 0)
  return Math.max(0, Math.ceil((exam.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
}

export async function sprintRoutes(fastify: FastifyInstance) {
  // POST /api/sprint-plans
  fastify.post<{ Body: CreateSprintBody }>(
    '/sprint-plans',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Body: CreateSprintBody }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const { studentId, subject, examDate } = request.body

        if (!studentId || !subject || !examDate) {
          return reply.status(400).send(fail('参数不完整：studentId, subject, examDate 均必填'))
        }

        const examDateObj = new Date(examDate)
        if (isNaN(examDateObj.getTime())) {
          return reply.status(400).send(fail('examDate 格式无效，应为 YYYY-MM-DD'))
        }

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (examDateObj < today) {
          return reply.status(400).send(fail('考试日期不能早于今天'))
        }

        const student = await prisma.usr_Student.findFirst({
          where: { id: BigInt(studentId), userId: BigInt(payload.userId) }
        })
        if (!student) return reply.status(404).send(fail('未找到该学生'))

        // 查找或创建 learning project
        let project = await prisma.pla_LearningProject.findFirst({
          where: { studentId: BigInt(studentId), status: { not: 'completed' } },
          orderBy: { createdAt: 'desc' }
        })
        if (!project) {
          project = await prisma.pla_LearningProject.create({
            data: {
              studentId: BigInt(studentId),
              targetDate: examDateObj,
              status: 'active'
            }
          })
        } else {
          project = await prisma.pla_LearningProject.update({
            where: { id: project.id },
            data: { targetDate: examDateObj }
          })
        }

        // 创建 sprint plan（每个 project 唯一）
        const existing = await prisma.pla_SprintPlan.findUnique({
          where: { projectId: project.id }
        })
        const sprint = existing
          ? await prisma.pla_SprintPlan.update({
              where: { id: existing.id },
              data: { competitionName: subject }
            })
          : await prisma.pla_SprintPlan.create({
              data: {
                projectId: project.id,
                competitionName: subject
              }
            })

        return reply.status(201).send(ok({
          id: Number(sprint.id),
          studentId: Number(student.id),
          subject: sprint.competitionName ?? subject,
          examDate: examDateObj.toISOString().split('T')[0],
          daysLeft: daysUntil(examDateObj),
          createdAt: project.createdAt.toISOString()
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '创建冲刺计划失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  // GET /api/sprint-plans/active?studentId=X
  fastify.get<{ Querystring: { studentId?: string } }>(
    '/sprint-plans/active',
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

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const projects = await prisma.pla_LearningProject.findMany({
          where: {
            studentId: BigInt(studentId),
            targetDate: { gte: today },
            status: { not: 'completed' }
          },
          include: { sprintPlan: true },
          orderBy: { targetDate: 'asc' }
        })

        const plans = projects
          .filter(p => p.sprintPlan)
          .map(p => ({
            id: Number(p.sprintPlan!.id),
            studentId: Number(p.studentId),
            subject: p.sprintPlan!.competitionName ?? '华杯备赛',
            examDate: p.targetDate!.toISOString().split('T')[0],
            daysLeft: daysUntil(p.targetDate!),
            createdAt: p.createdAt.toISOString()
          }))

        return reply.send(ok({ plans }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取冲刺计划失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  // GET /api/sprint-plans/:id/problems
  fastify.get<{ Params: SprintParams; Querystring: { studentId?: string; page?: string; limit?: string } }>(
    '/sprint-plans/:id/problems',
    { preHandler: authenticate },
    async (
      request: FastifyRequest<{ Params: SprintParams; Querystring: { studentId?: string; page?: string; limit?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const payload = request.user as JwtPayload
        const planId = BigInt(request.params.id)
        const { studentId } = request.query
        const page = Math.max(1, parseInt(request.query.page || '1', 10))
        const limit = Math.min(50, Math.max(1, parseInt(request.query.limit || '20', 10)))

        if (!studentId) return reply.status(400).send(fail('studentId 不能为空'))

        const student = await prisma.usr_Student.findFirst({
          where: { id: BigInt(studentId), userId: BigInt(payload.userId) }
        })
        if (!student) return reply.status(404).send(fail('未找到该学生'))

        const sprint = await prisma.pla_SprintPlan.findFirst({
          where: {
            id: planId,
            project: { studentId: BigInt(studentId) }
          }
        })
        if (!sprint) return reply.status(404).send(fail('冲刺计划不存在'))

        const where = {
          result: { in: ['wrong', 'unknown'] as ('wrong' | 'unknown')[] },
          masteredAt: null,
          assignment: { studentId: BigInt(studentId) }
        }

        const [total, problems] = await Promise.all([
          prisma.stu_Problem.count({ where }),
          prisma.stu_Problem.findMany({
            where,
            orderBy: [{ reviewStage: 'asc' }, { createdAt: 'desc' }],
            skip: (page - 1) * limit,
            take: limit
          })
        ])

        return reply.send(ok(
          {
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
              reviewStage: p.reviewStage
            }))
          },
          { total, page, limit }
        ))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取冲刺题目失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  // DELETE /api/sprint-plans/:id
  fastify.delete<{ Params: SprintParams }>(
    '/sprint-plans/:id',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: SprintParams }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const planId = BigInt(request.params.id)

        const sprint = await prisma.pla_SprintPlan.findFirst({
          where: {
            id: planId,
            project: { student: { userId: BigInt(payload.userId) } }
          }
        })
        if (!sprint) return reply.status(404).send(fail('冲刺计划不存在'))

        await prisma.pla_SprintPlan.delete({ where: { id: planId } })

        return reply.send(ok({ deleted: true }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '删除失败'
        return reply.status(500).send(fail(message))
      }
    }
  )
}
