import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { buildApp } from '../index'

vi.mock('../utils/prisma', () => ({
  default: {
    student: { findFirst: vi.fn() },
    problem: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    dailyCheckIn: { findFirst: vi.fn(), create: vi.fn() }
  }
}))

vi.mock('../services/ai.service', () => ({ aiService: {} }))
vi.mock('../services/ocr.service', () => ({ ocrService: {} }))
vi.mock('../services/storage.service', () => ({ storageService: {} }))

import prisma from '../utils/prisma'

const mockStudent = { id: BigInt(1), userId: BigInt(99), name: '小明', grade: 5 }

const makeProblem = (overrides: object = {}) => ({
  id: BigInt(1),
  assignmentId: BigInt(1),
  seq: 1,
  ocrText: '题目内容',
  studentAnswer: '错',
  correctAnswer: '正确',
  result: 'wrong' as const,
  knowledgePoint: '整除',
  trapDesc: null,
  solutionText: '解析',
  rootCause: '粗心',
  reviewStatus: 'pending' as const,
  reviewStage: 0,
  nextReviewAt: null,
  masteredAt: null,
  createdAt: new Date(),
  ...overrides
})

describe('Review API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  let token: string

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    token = await app.jwt.sign({ userId: 99, openid: 'test' })
  })

  afterAll(() => app.close())
  afterEach(() => vi.clearAllMocks())

  // ── GET /api/review/daily ──────────────────────────────────
  describe('GET /api/review/daily', () => {
    it('returns 400 without studentId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/review/daily',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 404 when student not found', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(null)
      const res = await app.inject({
        method: 'GET',
        url: '/api/review/daily?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(404)
    })

    it('returns due problems and checkedInToday flag', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      vi.mocked(prisma.stu_Problem.findMany)
        .mockResolvedValueOnce([makeProblem(), makeProblem({ id: BigInt(2) }), makeProblem({ id: BigInt(3) })] as never)
        .mockResolvedValue([] as never)
      vi.mocked(prisma.stu_DailyCheckIn.findFirst).mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/api/review/daily?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.data.problems).toHaveLength(3)
      expect(body.data.checkedInToday).toBe(false)
      expect(body.data.problems[0]).toHaveProperty('ocrText')
      expect(body.data.problems[0]).toHaveProperty('reviewStage')
    })

    it('supplements with new problems when fewer than 3 due', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      // due: 1 problem; new: 2 problems; fallback: 0
      vi.mocked(prisma.stu_Problem.findMany)
        .mockResolvedValueOnce([makeProblem()] as never)
        .mockResolvedValueOnce([makeProblem({ id: BigInt(2) }), makeProblem({ id: BigInt(3) })] as never)
        .mockResolvedValueOnce([] as never)
      vi.mocked(prisma.stu_DailyCheckIn.findFirst).mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/api/review/daily?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      const body = res.json()
      expect(body.data.problems).toHaveLength(3)
    })

    it('sets checkedInToday=true when already checked in', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      vi.mocked(prisma.stu_Problem.findMany).mockResolvedValue([makeProblem(), makeProblem({ id: BigInt(2) }), makeProblem({ id: BigInt(3) })] as never)
      vi.mocked(prisma.stu_DailyCheckIn.findFirst).mockResolvedValue({
        id: BigInt(1), studentId: BigInt(1), checkDate: new Date(), streak: 3, createdAt: new Date()
      } as never)

      const res = await app.inject({
        method: 'GET',
        url: '/api/review/daily?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.json().data.checkedInToday).toBe(true)
    })

    it('requires authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/review/daily?studentId=1' })
      expect(res.statusCode).toBe(401)
    })
  })

  // ── POST /api/review/problems/:id/mark ────────────────────
  describe('POST /api/review/problems/:id/mark', () => {
    it('marks problem as mastered', async () => {
      vi.mocked(prisma.stu_Problem.findFirst).mockResolvedValue(makeProblem({ reviewStage: 2 }) as never)
      vi.mocked(prisma.stu_Problem.update).mockResolvedValue({} as never)

      const res = await app.inject({
        method: 'POST',
        url: '/api/review/problems/1/mark',
        payload: { mastered: true },
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.updated).toBe(true)
      expect(prisma.stu_Problem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewStatus: 'done', masteredAt: expect.any(Date) })
        })
      )
    })

    it('marks problem as needs-practice and decrements stage', async () => {
      vi.mocked(prisma.stu_Problem.findFirst).mockResolvedValue(makeProblem({ reviewStage: 3 }) as never)
      vi.mocked(prisma.stu_Problem.update).mockResolvedValue({} as never)

      const res = await app.inject({
        method: 'POST',
        url: '/api/review/problems/1/mark',
        payload: { mastered: false },
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.statusCode).toBe(200)
      expect(prisma.stu_Problem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewStage: 2, nextReviewAt: expect.any(Date) })
        })
      )
    })

    it('stage does not go below 0 when needs-practice at stage 0', async () => {
      vi.mocked(prisma.stu_Problem.findFirst).mockResolvedValue(makeProblem({ reviewStage: 0 }) as never)
      vi.mocked(prisma.stu_Problem.update).mockResolvedValue({} as never)

      await app.inject({
        method: 'POST',
        url: '/api/review/problems/1/mark',
        payload: { mastered: false },
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(prisma.stu_Problem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewStage: 0 })
        })
      )
    })

    it('returns 404 for unknown problem', async () => {
      vi.mocked(prisma.stu_Problem.findFirst).mockResolvedValue(null)
      const res = await app.inject({
        method: 'POST',
        url: '/api/review/problems/999/mark',
        payload: { mastered: true },
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(404)
    })
  })

  // ── POST /api/review/checkin ───────────────────────────────
  describe('POST /api/review/checkin', () => {
    it('creates first check-in with streak=1', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      vi.mocked(prisma.stu_DailyCheckIn.findFirst)
        .mockResolvedValueOnce(null)   // today: not yet
        .mockResolvedValueOnce(null)   // yesterday: no previous
      vi.mocked(prisma.stu_DailyCheckIn.create).mockResolvedValue({ streak: 1 } as never)

      const res = await app.inject({
        method: 'POST',
        url: '/api/review/checkin',
        payload: { studentId: 1 },
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.streak).toBe(1)
      expect(body.data.alreadyCheckedIn).toBe(false)
    })

    it('increments streak when yesterday was checked in', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      vi.mocked(prisma.stu_DailyCheckIn.findFirst)
        .mockResolvedValueOnce(null)   // today
        .mockResolvedValueOnce({ streak: 5, checkDate: new Date() } as never)  // yesterday
      vi.mocked(prisma.stu_DailyCheckIn.create).mockResolvedValue({ streak: 6 } as never)

      const res = await app.inject({
        method: 'POST',
        url: '/api/review/checkin',
        payload: { studentId: 1 },
        headers: { Authorization: `Bearer ${token}` }
      })

      const body = res.json()
      expect(body.data.streak).toBe(6)
    })

    it('returns alreadyCheckedIn=true if called twice today', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      vi.mocked(prisma.stu_DailyCheckIn.findFirst).mockResolvedValue({ streak: 3 } as never)

      const res = await app.inject({
        method: 'POST',
        url: '/api/review/checkin',
        payload: { studentId: 1 },
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.json().data.alreadyCheckedIn).toBe(true)
      expect(prisma.stu_DailyCheckIn.create).not.toHaveBeenCalled()
    })
  })

  // ── GET /api/review/streak ─────────────────────────────────
  describe('GET /api/review/streak', () => {
    it('returns streak=0 when no check-ins', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      vi.mocked(prisma.stu_DailyCheckIn.findFirst).mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/api/review/streak?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.json().data.streak).toBe(0)
    })

    it('returns streak=0 when last check-in was 2+ days ago', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 3)
      vi.mocked(prisma.stu_DailyCheckIn.findFirst).mockResolvedValue({
        streak: 10, checkDate: oldDate
      } as never)

      const res = await app.inject({
        method: 'GET',
        url: '/api/review/streak?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.json().data.streak).toBe(0)
    })

    it('returns active streak when last check-in was yesterday', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      vi.mocked(prisma.stu_DailyCheckIn.findFirst).mockResolvedValue({
        streak: 7, checkDate: yesterday
      } as never)

      const res = await app.inject({
        method: 'GET',
        url: '/api/review/streak?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.json().data.streak).toBe(7)
    })
  })
})
