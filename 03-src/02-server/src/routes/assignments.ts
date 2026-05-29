import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Prisma, Stu_Problem, Stu_Dialogue } from '@prisma/client'
import prisma from '../utils/prisma'
import { ok, fail, JwtPayload } from '../types/index'
import { authenticate } from '../middleware/auth'
import { ocrService } from '../services/ocr.service'
import { aiService } from '../services/ai.service'
import { broadcastProgress } from './ws'

interface UploadBody {
  chapterId: number
  planDate: string
  imageUrl: string
  studentId: number
}

interface AssignmentParams {
  id: string
}

interface ProblemParams {
  id: string
  problemId: string
}

interface DialogueBody {
  content: string
  type: 'text' | 'audio_transcribed'
}

export async function assignmentRoutes(fastify: FastifyInstance) {
  // POST /api/assignments/upload
  fastify.post<{ Body: UploadBody }>(
    '/assignments/upload',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Body: UploadBody }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const { chapterId, planDate, imageUrl, studentId } = request.body

        if (!chapterId || !planDate || !imageUrl || !studentId) {
          return reply.status(400).send(fail('参数不完整'))
        }

        const student = await prisma.usr_Student.findFirst({
          where: { id: BigInt(studentId), userId: BigInt(payload.userId) }
        })

        if (!student) {
          return reply.status(404).send(fail('未找到该学生'))
        }

        const chapter = await prisma.knl_Chapter.findUnique({ where: { id: chapterId } })
        if (!chapter) {
          return reply.status(404).send(fail('章节不存在'))
        }

        const assignment = await prisma.stu_Assignment.create({
          data: {
            studentId: BigInt(studentId),
            chapterId,
            planDate: new Date(planDate),
            imageUrl,
            status: 'ocr_pending'
          }
        })

        const assignmentId = assignment.id

        setImmediate(async () => {
          try {
            await processAssignment(Number(assignmentId), imageUrl, chapterId)
          } catch (err) {
            console.error(`Assignment ${assignmentId} processing failed:`, err)
          }
        })

        return reply.status(201).send(ok({
          assignmentId: Number(assignmentId),
          status: 'ocr_pending'
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '创建作业失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  // GET /api/assignments/:id
  fastify.get<{ Params: AssignmentParams }>(
    '/assignments/:id',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: AssignmentParams }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const id = BigInt(request.params.id)

        const assignment = await prisma.stu_Assignment.findFirst({
          where: {
            id,
            student: { userId: BigInt(payload.userId) }
          },
          include: {
            problems: { orderBy: { seq: 'asc' } },
            chapter: true
          }
        })

        if (!assignment) {
          return reply.status(404).send(fail('作业不存在'))
        }

        return reply.send(ok({
          id: Number(assignment.id),
          studentId: Number(assignment.studentId),
          chapterId: assignment.chapterId,
          planDate: assignment.planDate?.toISOString().split('T')[0] ?? null,
          imageUrl: assignment.imageUrl,
          imageUrlThumb: assignment.imageUrlThumb,
          status: assignment.status,
          totalCount: assignment.totalCount,
          correctCount: assignment.correctCount,
          wrongCount: assignment.wrongCount,
          unknownCount: assignment.unknownCount,
          moodText: assignment.moodText,
          chapter: assignment.chapter ? {
            id: assignment.chapter.id,
            name: assignment.chapter.name
          } : null,
          problems: assignment.problems.map((p: Stu_Problem) => ({
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
            reviewStatus: p.reviewStatus
          }))
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取作业详情失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  // GET /api/assignments
  fastify.get<{ Querystring: { studentId?: string } }>(
    '/assignments',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Querystring: { studentId?: string } }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const { studentId } = request.query

        if (!studentId) {
          return reply.status(400).send(fail('studentId 不能为空'))
        }

        const student = await prisma.usr_Student.findFirst({
          where: { id: BigInt(studentId), userId: BigInt(payload.userId) }
        })

        if (!student) {
          return reply.status(404).send(fail('未找到该学生'))
        }

        const assignments = await prisma.stu_Assignment.findMany({
          where: { studentId: BigInt(studentId) },
          include: { chapter: true },
          orderBy: { createdAt: 'desc' },
          take: 50
        })

        return reply.send(ok({
          assignments: (assignments as Prisma.Stu_AssignmentGetPayload<{ include: { chapter: true } }>[]).map(a => ({
            id: Number(a.id),
            studentId: Number(a.studentId),
            chapterId: a.chapterId,
            planDate: a.planDate?.toISOString().split('T')[0] ?? null,
            imageUrl: a.imageUrl,
            status: a.status,
            totalCount: a.totalCount,
            correctCount: a.correctCount,
            wrongCount: a.wrongCount,
            unknownCount: a.unknownCount,
            chapter: a.chapter ? { id: a.chapter.id, name: a.chapter.name } : null,
            createdAt: a.createdAt.toISOString()
          }))
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取作业列表失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  // GET /api/problems/:id
  fastify.get<{ Params: { id: string } }>(
    '/problems/:id',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const id = BigInt(request.params.id)

        const problem = await prisma.stu_Problem.findFirst({
          where: {
            id,
            assignment: { student: { userId: BigInt(payload.userId) } }
          }
        })

        if (!problem) {
          return reply.status(404).send(fail('题目不存在'))
        }

        return reply.send(ok({
          id: Number(problem.id),
          assignmentId: Number(problem.assignmentId),
          seq: problem.seq,
          ocrText: problem.ocrText,
          studentAnswer: problem.studentAnswer,
          correctAnswer: problem.correctAnswer,
          result: problem.result,
          knowledgePoint: problem.knowledgePoint,
          trapDesc: problem.trapDesc,
          solutionText: problem.solutionText,
          rootCause: problem.rootCause,
          reviewStatus: problem.reviewStatus
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取题目详情失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  // GET /api/problems/:id/dialogues
  fastify.get<{ Params: { id: string } }>(
    '/problems/:id/dialogues',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const problemId = BigInt(request.params.id)

        const problem = await prisma.stu_Problem.findFirst({
          where: {
            id: problemId,
            assignment: { student: { userId: BigInt(payload.userId) } }
          }
        })

        if (!problem) {
          return reply.status(404).send(fail('题目不存在'))
        }

        const dialogues = await prisma.stu_Dialogue.findMany({
          where: { problemId },
          orderBy: { createdAt: 'asc' }
        })

        return reply.send(ok({
          dialogues: dialogues.map((d: Stu_Dialogue) => ({
            id: Number(d.id),
            problemId: Number(d.problemId),
            role: d.role,
            content: d.content,
            createdAt: d.createdAt.toISOString()
          }))
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取对话记录失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  // POST /api/problems/:id/dialogue
  fastify.post<{ Params: ProblemParams; Body: DialogueBody }>(
    '/problems/:id/dialogue',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: ProblemParams; Body: DialogueBody }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const problemId = BigInt(request.params.id)
        const { content } = request.body

        if (!content) {
          return reply.status(400).send(fail('内容不能为空'))
        }

        const problem = await prisma.stu_Problem.findFirst({
          where: {
            id: problemId,
            assignment: { student: { userId: BigInt(payload.userId) } }
          }
        })

        if (!problem) {
          return reply.status(404).send(fail('题目不存在'))
        }

        const history = await prisma.stu_Dialogue.findMany({
          where: { problemId },
          orderBy: { createdAt: 'asc' },
          take: 20
        })

        const studentMsg = await prisma.stu_Dialogue.create({
          data: { problemId, role: 'student', content }
        })

        const aiContent = await aiService.generateDialogueReply(
          problem,
          content,
          history.map((h: Stu_Dialogue) => ({ role: h.role, content: h.content }))
        )

        const aiMsg = await prisma.stu_Dialogue.create({
          data: { problemId, role: 'ai', content: aiContent }
        })

        return reply.send(ok({
          dialogue: {
            id: Number(studentMsg.id),
            problemId: Number(studentMsg.problemId),
            role: studentMsg.role,
            content: studentMsg.content,
            createdAt: studentMsg.createdAt.toISOString()
          },
          aiReply: {
            id: Number(aiMsg.id),
            problemId: Number(aiMsg.problemId),
            role: aiMsg.role,
            content: aiMsg.content,
            createdAt: aiMsg.createdAt.toISOString()
          }
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'AI 回复生成失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  // POST /api/assignments/:id/complete-review
  fastify.post<{ Params: AssignmentParams }>(
    '/assignments/:id/complete-review',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: AssignmentParams }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const id = BigInt(request.params.id)

        const assignment = await prisma.stu_Assignment.findFirst({
          where: {
            id,
            student: { userId: BigInt(payload.userId) }
          },
          include: { problems: true }
        })

        if (!assignment) {
          return reply.status(404).send(fail('作业不存在'))
        }

        await prisma.stu_Assignment.update({
          where: { id },
          data: { status: 'reviewed' }
        })

        const session = await prisma.stu_ReviewSession.upsert({
          where: { assignmentId: id },
          create: {
            assignmentId: id,
            startedAt: new Date(),
            completedAt: new Date(),
            summaryText: `复盘完成：共 ${assignment.totalCount} 道题，答对 ${assignment.correctCount} 道`
          },
          update: { completedAt: new Date() }
        })

        return reply.send(ok({
          summary: session.summaryText,
          parentNotified: session.notifiedParent
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '完成复盘失败'
        return reply.status(500).send(fail(message))
      }
    }
  )
}

async function processAssignment(assignmentId: number, imageUrl: string, chapterId: number) {
  const id = BigInt(assignmentId)

  await prisma.stu_Assignment.update({ where: { id }, data: { status: 'ocr_pending' } })
  broadcastProgress(assignmentId, 'ocr_pending', 15, '正在识别题目...')

  const ocrResult = await ocrService.recognizeProblems(imageUrl)

  await prisma.stu_Assignment.update({
    where: { id },
    data: { status: 'ocr_done', totalCount: ocrResult.problems.length }
  })
  broadcastProgress(assignmentId, 'ocr_done', 45, 'OCR 完成，AI 批改中...')

  await prisma.stu_Assignment.update({ where: { id }, data: { status: 'grading' } })
  broadcastProgress(assignmentId, 'grading', 70, 'AI 正在批改题目...')

  const chapter = await prisma.knl_Chapter.findUnique({ where: { id: chapterId } })
  const chapterName = chapter?.name || '未知章节'

  const problems: Stu_Problem[] = []
  for (let i = 0; i < ocrResult.problems.length; i++) {
    const p = ocrResult.problems[i]
    const gradeResult = await aiService.gradeProblems(p.text, p.studentAnswer, chapterName)

    const problem = await prisma.stu_Problem.create({
      data: {
        assignmentId: id,
        seq: i + 1,
        ocrText: p.text,
        studentAnswer: p.studentAnswer,
        correctAnswer: gradeResult.correctAnswer,
        result: gradeResult.result,
        knowledgePoint: gradeResult.knowledgePoint,
        trapDesc: gradeResult.trapDesc,
        solutionText: gradeResult.solutionText,
        rootCause: gradeResult.rootCause
      }
    })
    problems.push(problem)
  }

  const correctCount = problems.filter((p: Stu_Problem) => p.result === 'correct').length
  const wrongCount = problems.filter((p: Stu_Problem) => p.result === 'wrong').length
  const unknownCount = problems.filter((p: Stu_Problem) => p.result === 'unknown').length

  const moodText = await aiService.generateMoodText({
    total: problems.length,
    correct: correctCount,
    wrong: wrongCount,
    unknown: unknownCount,
    chapter: chapterName
  })

  await prisma.stu_Assignment.update({
    where: { id },
    data: { status: 'graded', correctCount, wrongCount, unknownCount, moodText }
  })
  broadcastProgress(assignmentId, 'graded', 100, '批改完成！')
}
