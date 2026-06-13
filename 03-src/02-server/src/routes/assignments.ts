import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Prisma, Stu_Problem, Stu_Dialogue } from '@prisma/client'
import prisma from '../utils/prisma'
import { ok, fail, JwtPayload } from '../types/index'
import { authenticate } from '../middleware/auth'
import { ocrService } from '../services/ocr.service'
import { aiService } from '../services/ai.service'
import { cosService } from '../services/cos.service'
import { broadcastProgress } from './ws'
import {
  REVIEW_STAGE,
  STAGE_CODE,
  STAGE_PATH,
  MAX_TURNS_PER_STAGE,
  getNextStage,
  getInitialStage,
  ReviewStageValue
} from '../constants/review-stages'

interface UploadBody {
  chapterId: number
  planDate: string
  imageUrl: string
  studentId: number
  questionText?: string
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
  imageUrl?: string
  type?: 'text' | 'audio_transcribed'
}

function mapProblem(p: Stu_Problem, seq?: number) {
  return {
    id: Number(p.id),
    assignmentId: Number(p.assignmentId),
    seq: seq ?? p.seq,
    ocrText: p.ocrText,
    rawOcrText: p.rawOcrText,
    studentAnswer: p.studentAnswer,
    correctAnswer: p.correctAnswer,
    result: p.result,
    knowledgePoint: p.knowledgePoint,
    trapDesc: p.trapDesc,
    solutionText: p.solutionText,
    rootCause: p.rootCause,
    reviewStatus: p.reviewStatus,
    reviewStage: p.reviewStage,
    reviewStageName: STAGE_CODE[p.reviewStage as ReviewStageValue] ?? 'NOT_STARTED',
  }
}

function mapDialogue(d: Stu_Dialogue) {
  return {
    id: Number(d.id),
    problemId: Number(d.problemId),
    role: d.role,
    content: d.content,
    imageUrl: d.imageUrl ?? null,
    stageCode: d.stageCode ?? null,
    createdAt: d.createdAt.toISOString()
  }
}

export async function assignmentRoutes(fastify: FastifyInstance) {
  // POST /api/assignments/upload
  fastify.post<{ Body: UploadBody }>(
    '/assignments/upload',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Body: UploadBody }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const { chapterId, planDate, imageUrl, studentId, questionText } = request.body

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
            await processAssignment(Number(assignmentId), imageUrl, chapterId, questionText)
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
          problems: assignment.problems.map((p: Stu_Problem) => mapProblem(p))
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取作业详情失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  // GET /api/assignments
  fastify.get<{ Querystring: { studentId?: string; date?: string } }>(
    '/assignments',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Querystring: { studentId?: string; date?: string } }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const { studentId, date } = request.query

        if (!studentId) {
          return reply.status(400).send(fail('studentId 不能为空'))
        }

        const student = await prisma.usr_Student.findFirst({
          where: { id: BigInt(studentId), userId: BigInt(payload.userId) }
        })

        if (!student) {
          return reply.status(404).send(fail('未找到该学生'))
        }

        // 按日期查询时：带 problems，用于打卡结果页
        if (date) {
          const planDate = new Date(date)
          const assignments = await prisma.stu_Assignment.findMany({
            where: { studentId: BigInt(studentId), planDate },
            include: { problems: { orderBy: { seq: 'asc' } }, chapter: true },
            orderBy: { createdAt: 'asc' },
          })

          type AsgWithAll = Prisma.Stu_AssignmentGetPayload<{
            include: { problems: true; chapter: true }
          }>

          // 聚合当天所有 assignment 的 problems，seq 全局重编
          const allProblems: ReturnType<typeof mapProblem>[] = []
          let globalSeq = 1
          for (const a of assignments as AsgWithAll[]) {
            for (const p of a.problems) {
              allProblems.push(mapProblem(p, globalSeq++))
            }
          }

          const totalCount   = allProblems.length
          const correctCount = allProblems.filter((p) => p.result === 'correct').length
          const wrongCount   = allProblems.filter((p) => p.result === 'wrong').length
          const unknownCount = allProblems.filter((p) => p.result === 'unknown').length

          return reply.send(ok({
            date,
            totalCount,
            correctCount,
            wrongCount,
            unknownCount,
            problems: allProblems,
          }))
        }

        // 默认：列表（不带 problems）
        const assignments = await prisma.stu_Assignment.findMany({
          where: { studentId: BigInt(studentId) },
          include: { chapter: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
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
          where: { id: problemId, assignment: { student: { userId: BigInt(payload.userId) } } }
        })
        if (!problem) return reply.status(404).send(fail('题目不存在'))

        const dialogues = await prisma.stu_Dialogue.findMany({
          where: { problemId },
          orderBy: { createdAt: 'asc' }
        })

        return reply.send(ok({ dialogues: dialogues.map(mapDialogue) }))
      } catch (err) {
        return reply.status(500).send(fail(err instanceof Error ? err.message : '获取对话记录失败'))
      }
    }
  )

  // POST /api/problems/:id/review-start — AI 主动开场
  fastify.post<{ Params: { id: string } }>(
    '/problems/:id/review-start',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const problemId = BigInt(request.params.id)

        const problem = await prisma.stu_Problem.findFirst({
          where: { id: problemId, assignment: { student: { userId: BigInt(payload.userId) } } }
        })
        if (!problem) return reply.status(404).send(fail('题目不存在'))

        // 已完成复盘，不重复触发
        if (problem.reviewStatus === 'done') {
          return reply.status(400).send(fail('该题复盘已完成'))
        }

        // 已有对话记录，防止重复触发
        const existingCount = await prisma.stu_Dialogue.count({ where: { problemId } })
        if (existingCount > 0) {
          return reply.status(400).send(fail('复盘已开始'))
        }

        const initialStage = getInitialStage(problem.result as 'correct' | 'wrong' | 'unknown')
        const initialStageCode = STAGE_CODE[initialStage]

        const openingText = await aiService.generateReviewOpening(problem)

        const aiMsg = await prisma.stu_Dialogue.create({
          data: { problemId, role: 'ai', content: openingText, stageCode: initialStageCode }
        })

        await prisma.stu_Problem.update({
          where: { id: problemId },
          data: { reviewStage: initialStage }
        })

        return reply.send(ok({ message: openingText, stageCode: initialStageCode, dialogue: mapDialogue(aiMsg) }))
      } catch (err) {
        return reply.status(500).send(fail(err instanceof Error ? err.message : '开始复盘失败'))
      }
    }
  )

  // POST /api/problems/:id/chat-image — 上传对话图片到 COS
  fastify.post<{ Params: { id: string } }>(
    '/problems/:id/chat-image',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const problemId = request.params.id

        const problem = await prisma.stu_Problem.findFirst({
          where: { id: BigInt(problemId), assignment: { student: { userId: BigInt(payload.userId) } } }
        })
        if (!problem) return reply.status(404).send(fail('题目不存在'))

        const data = await request.file()
        if (!data) return reply.status(400).send(fail('未收到文件'))

        const buffer = await data.toBuffer()
        const mimeType = data.mimetype || 'image/jpeg'
        const imageUrl = await cosService.uploadBuffer(buffer, problemId, mimeType)

        return reply.send(ok({ imageUrl }))
      } catch (err) {
        return reply.status(500).send(fail(err instanceof Error ? err.message : '图片上传失败'))
      }
    }
  )

  // POST /api/problems/:id/dialogue — 学生发消息，AI 带状态机回复
  fastify.post<{ Params: ProblemParams; Body: DialogueBody }>(
    '/problems/:id/dialogue',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: ProblemParams; Body: DialogueBody }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const problemId = BigInt(request.params.id)
        const { content, imageUrl } = request.body

        if (!content && !imageUrl) {
          return reply.status(400).send(fail('内容不能为空'))
        }

        const problem = await prisma.stu_Problem.findFirst({
          where: { id: problemId, assignment: { student: { userId: BigInt(payload.userId) } } }
        })
        if (!problem) return reply.status(404).send(fail('题目不存在'))

        if (problem.reviewStatus === 'done') {
          return reply.status(400).send(fail('该题复盘已完成，无法继续发送消息'))
        }

        const currentStage = problem.reviewStage as ReviewStageValue
        const currentStageCode = STAGE_CODE[currentStage] ?? 'PROBE_THINKING'
        const result = problem.result as 'correct' | 'wrong' | 'unknown'

        // 读取本阶段已有对话数（用于 turnCount 判断）
        const stageTurnCount = await prisma.stu_Dialogue.count({
          where: { problemId, stageCode: currentStageCode }
        })

        // 保存学生消息
        const studentMsg = await prisma.stu_Dialogue.create({
          data: { problemId, role: 'student', content: content || '', imageUrl: imageUrl ?? null, stageCode: currentStageCode }
        })

        // 读取完整历史（用于 AI 上下文）
        const history = await prisma.stu_Dialogue.findMany({
          where: { problemId },
          orderBy: { createdAt: 'asc' },
          take: 40
        })

        // 判断是否强制推进（轮次超限）
        const forceAdvance = stageTurnCount >= MAX_TURNS_PER_STAGE

        let aiResult
        if (forceAdvance && currentStage !== REVIEW_STAGE.COMPLETE) {
          aiResult = {
            reply: '时间差不多了，我们来到下一个环节吧！',
            stageComplete: true,
            suggestNext: false
          }
        } else {
          aiResult = await aiService.generateReviewReply({
            problem,
            stageCode: currentStageCode,
            studentMessage: content || '',
            imageUrl: imageUrl ?? null,
            history: history.map(h => ({ role: h.role, content: h.content, imageUrl: h.imageUrl })),
            turnCount: stageTurnCount
          })
        }

        // 计算下一阶段
        let nextStage = currentStage
        let nextStageCode = currentStageCode
        if (aiResult.stageComplete && currentStage !== REVIEW_STAGE.COMPLETE) {
          nextStage = getNextStage(currentStage, result)
          nextStageCode = STAGE_CODE[nextStage]
        }

        const isComplete = nextStage === REVIEW_STAGE.COMPLETE || aiResult.suggestNext

        // 保存 AI 消息
        const aiMsg = await prisma.stu_Dialogue.create({
          data: { problemId, role: 'ai', content: aiResult.reply, stageCode: nextStageCode }
        })

        // 更新题目状态
        await prisma.stu_Problem.update({
          where: { id: problemId },
          data: {
            reviewStage: nextStage,
            ...(isComplete ? { reviewStatus: 'done' } : {})
          }
        })

        // 当本题复盘完成时，检查当日所有题目是否全部完成
        if (isComplete) {
          await tryCompleteSession(problem.assignmentId, problemId)
        }

        return reply.send(ok({
          studentDialogue: mapDialogue(studentMsg),
          aiReply: mapDialogue(aiMsg),
          suggestNext: isComplete,
          currentStage: nextStageCode
        }))
      } catch (err) {
        return reply.status(500).send(fail(err instanceof Error ? err.message : 'AI 回复生成失败'))
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

// 当某题复盘完成时：检查当天所有 assignment 的所有题是否全部 done → 写入 DailyCheckIn
async function tryCompleteSession(assignmentId: bigint, justCompletedId: bigint) {
  const assignment = await prisma.stu_Assignment.findUnique({
    where: { id: assignmentId },
    select: { studentId: true, planDate: true }
  })
  if (!assignment?.planDate) return

  const { studentId, planDate } = assignment

  // 取当天全部 assignments（同一学生同一 planDate）
  const dayStart = new Date(planDate)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(planDate)
  dayEnd.setHours(23, 59, 59, 999)

  const dayAssignments = await prisma.stu_Assignment.findMany({
    where: { studentId, planDate: { gte: dayStart, lte: dayEnd } },
    include: { problems: { select: { id: true, reviewStatus: true } } }
  })

  if (!dayAssignments.length) return

  // 当天所有题全部 done（含本次刚完成的那题）才触发
  const allDone = dayAssignments.every(a =>
    a.problems.every(p =>
      p.id === justCompletedId ? true : p.reviewStatus === 'done'
    )
  )
  if (!allDone) return

  // 当天所有 assignment 都标记为 reviewed
  await prisma.stu_Assignment.updateMany({
    where: { studentId, planDate: { gte: dayStart, lte: dayEnd } },
    data: { status: 'reviewed' }
  })

  // 完成当前 assignment 的 ReviewSession
  await prisma.stu_ReviewSession.upsert({
    where: { assignmentId },
    create: { assignmentId, startedAt: new Date(), completedAt: new Date() },
    update: { completedAt: new Date() }
  })

  // 写入当日打卡：用 UTC 日期避免时区偏差，upsert 避免唯一约束冲突
  const nowUTC = new Date()
  const checkDate = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate()))

  const yesterdayUTC = new Date(checkDate)
  yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - 1)
  const yesterdayEnd = new Date(yesterdayUTC)
  yesterdayEnd.setUTCHours(23, 59, 59, 999)

  const prev = await prisma.stu_DailyCheckIn.findFirst({
    where: { studentId, checkDate: { gte: yesterdayUTC, lte: yesterdayEnd } }
  })

  await prisma.stu_DailyCheckIn.upsert({
    where: { studentId_checkDate: { studentId, checkDate } },
    create: { studentId, checkDate, streak: prev ? prev.streak + 1 : 1 },
    update: {}
  })
}

async function processAssignment(assignmentId: number, imageUrl: string, chapterId: number, questionText?: string) {
  const id = BigInt(assignmentId)

  try {
    await prisma.stu_Assignment.update({ where: { id }, data: { status: 'ocr_pending' } })
    broadcastProgress(assignmentId, 'ocr_pending', 15, '正在识别手写内容...')

    const rawOcrText = await ocrService.extractHandwriting(imageUrl)

    await prisma.stu_Assignment.update({ where: { id }, data: { status: 'ocr_done', totalCount: 1 } })
    broadcastProgress(assignmentId, 'ocr_done', 45, 'OCR 完成，AI 批改中...')

    await prisma.stu_Assignment.update({ where: { id }, data: { status: 'grading' } })
    broadcastProgress(assignmentId, 'grading', 70, 'AI 正在批改...')

    const chapter = await prisma.knl_Chapter.findUnique({ where: { id: chapterId } })
    const chapterName = chapter?.name || '未知章节'

    const knownQuestion = questionText || ''
    const gradeResult = await aiService.gradeProblems(knownQuestion, rawOcrText, chapterName)

    const problems: Stu_Problem[] = []
    const problem = await prisma.stu_Problem.create({
      data: {
        assignmentId: id,
        seq: 1,
        ocrText: knownQuestion,
        rawOcrText: rawOcrText || null,
        studentAnswer: gradeResult.studentAnswer ?? rawOcrText.slice(0, 256),
        correctAnswer: gradeResult.correctAnswer,
        result: gradeResult.result,
        knowledgePoint: gradeResult.knowledgePoint,
        trapDesc: gradeResult.trapDesc,
        solutionText: gradeResult.solutionText,
        rootCause: gradeResult.rootCause
      }
    })
    problems.push(problem)

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

  } catch (err) {
    console.error(`processAssignment ${assignmentId} failed:`, err)
    // 任何步骤失败都强制推进到终态，避免前端轮询卡死
    try {
      const existing = await prisma.stu_Problem.count({ where: { assignmentId: id } })
      if (existing === 0) {
        await prisma.stu_Problem.create({
          data: { assignmentId: id, seq: 1, ocrText: questionText || '', result: 'unknown' }
        })
      }
      await prisma.stu_Assignment.update({
        where: { id },
        data: { status: 'graded', totalCount: 1, unknownCount: 1 }
      })
      broadcastProgress(assignmentId, 'graded', 100, '识别失败，请重拍')
    } catch (fallback) {
      console.error(`Fallback graded update failed for ${assignmentId}:`, fallback)
    }
  }
}
