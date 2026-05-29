import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { buildApp } from '../index'

vi.mock('../utils/prisma', () => ({
  default: {
    student: { findFirst: vi.fn() },
    problem: { findMany: vi.fn() }
  }
}))

vi.mock('../services/ai.service', () => ({ aiService: {} }))
vi.mock('../services/ocr.service', () => ({ ocrService: {} }))
vi.mock('../services/storage.service', () => ({ storageService: {} }))

import prisma from '../utils/prisma'

const mockStudent = { id: BigInt(1), userId: BigInt(99), name: '小明', grade: 5 }

const makeToken = async (app: Awaited<ReturnType<typeof buildApp>>) => {
  return app.jwt.sign({ userId: 99, openid: 'test-openid' })
}

const makeProblems = (overrides: object[] = []) =>
  overrides.map((o, i) => ({
    id: BigInt(i + 1),
    assignmentId: BigInt(1),
    seq: i + 1,
    ocrText: `题目${i + 1}`,
    studentAnswer: '错误答案',
    correctAnswer: '正确答案',
    result: 'wrong',
    knowledgePoint: null,
    trapDesc: null,
    solutionText: null,
    rootCause: null,
    reviewStatus: 'pending',
    createdAt: new Date(),
    assignment: {
      chapter: { id: 1, code: 'ch01', name: '第1章·计数原理', subtitle: null }
    },
    ...o
  }))

describe('Analytics API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  let token: string

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    token = await makeToken(app)
  })

  afterAll(() => app.close())

  afterEach(() => vi.clearAllMocks())

  describe('GET /api/analytics/weakpoints', () => {
    it('should return 400 when studentId is missing', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)

      const res = await app.inject({
        method: 'GET',
        url: '/api/analytics/weakpoints',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.success).toBe(false)
    })

    it('should return 404 when student not found', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/api/analytics/weakpoints?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.statusCode).toBe(404)
    })

    it('should return hasEnoughData=false when no problems', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      vi.mocked(prisma.stu_Problem.findMany).mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        url: '/api/analytics/weakpoints?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.data.hasEnoughData).toBe(false)
      expect(body.data.totalWrong).toBe(0)
      expect(body.data.weakpoints).toHaveLength(0)
    })

    it('should return hasEnoughData=false when fewer than 3 problems', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      vi.mocked(prisma.stu_Problem.findMany).mockResolvedValue(makeProblems([{}, {}]) as never)

      const res = await app.inject({
        method: 'GET',
        url: '/api/analytics/weakpoints?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      const body = res.json()
      expect(body.data.hasEnoughData).toBe(false)
      expect(body.data.totalWrong).toBe(2)
    })

    it('should return hasEnoughData=true with 3+ problems', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      vi.mocked(prisma.stu_Problem.findMany).mockResolvedValue(makeProblems([{}, {}, {}]) as never)

      const res = await app.inject({
        method: 'GET',
        url: '/api/analytics/weakpoints?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      const body = res.json()
      expect(body.data.hasEnoughData).toBe(true)
      expect(body.data.totalWrong).toBe(3)
    })

    it('should group problems by chapter and rank by weakness score', async () => {
      const ch1 = { id: 1, code: 'ch01', name: '第1章', subtitle: null }
      const ch2 = { id: 2, code: 'ch02', name: '第2章', subtitle: null }

      const now = new Date()
      const yesterday = new Date(now.getTime() - 86400_000)

      const problems = [
        // ch1: 2 wrong problems (recent)
        { result: 'wrong', createdAt: now, assignment: { chapter: ch1 } },
        { result: 'wrong', createdAt: yesterday, assignment: { chapter: ch1 } },
        // ch2: 1 wrong problem (old)
        { result: 'wrong', createdAt: new Date(now.getTime() - 20 * 86400_000), assignment: { chapter: ch2 } }
      ]

      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      vi.mocked(prisma.stu_Problem.findMany).mockResolvedValue(makeProblems(problems) as never)

      const res = await app.inject({
        method: 'GET',
        url: '/api/analytics/weakpoints?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      const body = res.json()
      expect(body.data.weakpoints[0].chapterId).toBe(1)
      expect(body.data.weakpoints[0].totalWrong).toBe(2)
      expect(body.data.weakpoints[0].recentWrong).toBe(2)
      expect(body.data.weakpoints[1].chapterId).toBe(2)
    })

    it('should respect the limit parameter', async () => {
      const problems = [1, 2, 3, 4, 5, 6].map(id => ({
        result: 'wrong',
        createdAt: new Date(),
        assignment: { chapter: { id, code: `ch0${id}`, name: `第${id}章`, subtitle: null } }
      }))

      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      vi.mocked(prisma.stu_Problem.findMany).mockResolvedValue(makeProblems(problems) as never)

      const res = await app.inject({
        method: 'GET',
        url: '/api/analytics/weakpoints?studentId=1&limit=3',
        headers: { Authorization: `Bearer ${token}` }
      })

      const body = res.json()
      expect(body.data.weakpoints).toHaveLength(3)
    })

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/analytics/weakpoints?studentId=1'
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/analytics/chapter-problems', () => {
    it('should return 400 when studentId or chapterId is missing', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)

      const res = await app.inject({
        method: 'GET',
        url: '/api/analytics/chapter-problems?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.statusCode).toBe(400)
    })

    it('should return wrong problems for the chapter', async () => {
      vi.mocked(prisma.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      vi.mocked(prisma.stu_Problem.findMany).mockResolvedValue(makeProblems([{}, {}]) as never)

      const res = await app.inject({
        method: 'GET',
        url: '/api/analytics/chapter-problems?studentId=1&chapterId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.problems).toHaveLength(2)
      expect(body.data.problems[0]).toHaveProperty('id')
      expect(body.data.problems[0]).toHaveProperty('result')
    })
  })
})
