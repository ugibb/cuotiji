import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { buildApp } from '../index'

// Mock Prisma
vi.mock('../utils/prisma', () => ({
  default: {
    student: {
      findFirst: vi.fn()
    },
    sprintPlan: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      count: vi.fn()
    },
    problem: {
      findMany: vi.fn(),
      count: vi.fn()
    }
  }
}))

describe('Sprint Plans API', () => {
  const app = buildApp()
  let token: string

  beforeAll(async () => {
    await app.ready()
    token = app.jwt.sign({ userId: 1, openid: 'test_openid' })
  })

  afterAll(async () => {
    await app.close()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── POST /api/sprint-plans ──────────────────────────────────────────────

  describe('POST /api/sprint-plans', () => {
    it('returns 400 when body is missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/sprint-plans',
        headers: { Authorization: `Bearer ${token}` },
        payload: { studentId: 1 }  // missing subject and examDate
      })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.success).toBe(false)
    })

    it('returns 400 when examDate is invalid', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/sprint-plans',
        headers: { Authorization: `Bearer ${token}` },
        payload: { studentId: 1, subject: '数学', examDate: 'not-a-date' }
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 400 when examDate is in the past', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/sprint-plans',
        headers: { Authorization: `Bearer ${token}` },
        payload: { studentId: 1, subject: '数学', examDate: '2020-01-01' }
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 404 when student does not belong to user', async () => {
      const prisma = await import('../utils/prisma')
      vi.mocked(prisma.default.usr_Student.findFirst).mockResolvedValue(null)

      const future = new Date()
      future.setMonth(future.getMonth() + 1)
      const examDate = future.toISOString().split('T')[0]

      const res = await app.inject({
        method: 'POST',
        url: '/api/sprint-plans',
        headers: { Authorization: `Bearer ${token}` },
        payload: { studentId: 999, subject: '数学', examDate }
      })
      expect(res.statusCode).toBe(404)
    })

    it('creates sprint plan and returns daysLeft', async () => {
      const prisma = await import('../utils/prisma')

      const mockStudent = { id: BigInt(1), userId: BigInt(1), name: '小明', grade: 5, isDefault: true }
      vi.mocked(prisma.default.usr_Student.findFirst).mockResolvedValue(mockStudent as never)

      const future = new Date()
      future.setDate(future.getDate() + 30)
      const examDate = future.toISOString().split('T')[0]

      const mockPlan = {
        id: BigInt(1),
        studentId: BigInt(1),
        subject: '数学',
        examDate: future,
        createdAt: new Date()
      }
      vi.mocked(prisma.default.pla_SprintPlan.create).mockResolvedValue(mockPlan as never)

      const res = await app.inject({
        method: 'POST',
        url: '/api/sprint-plans',
        headers: { Authorization: `Bearer ${token}` },
        payload: { studentId: 1, subject: '数学', examDate }
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.data.subject).toBe('数学')
      expect(body.data.daysLeft).toBeGreaterThan(0)
    })

    it('returns 401 without auth token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/sprint-plans',
        payload: { studentId: 1, subject: '数学', examDate: '2030-01-01' }
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // ── GET /api/sprint-plans/active ────────────────────────────────────────

  describe('GET /api/sprint-plans/active', () => {
    it('returns 400 when studentId is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/sprint-plans/active',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns active plans list', async () => {
      const prisma = await import('../utils/prisma')

      const mockStudent = { id: BigInt(1), userId: BigInt(1), name: '小明', grade: 5, isDefault: true }
      vi.mocked(prisma.default.usr_Student.findFirst).mockResolvedValue(mockStudent as never)

      const future = new Date()
      future.setDate(future.getDate() + 15)

      vi.mocked(prisma.default.pla_SprintPlan.findMany).mockResolvedValue([
        { id: BigInt(1), studentId: BigInt(1), subject: '数学', examDate: future, createdAt: new Date() }
      ] as never)

      const res = await app.inject({
        method: 'GET',
        url: '/api/sprint-plans/active?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.data.plans).toHaveLength(1)
      expect(body.data.plans[0].daysLeft).toBeGreaterThan(0)
    })

    it('returns empty list when no active plans', async () => {
      const prisma = await import('../utils/prisma')

      const mockStudent = { id: BigInt(1), userId: BigInt(1), name: '小明', grade: 5, isDefault: true }
      vi.mocked(prisma.default.usr_Student.findFirst).mockResolvedValue(mockStudent as never)
      vi.mocked(prisma.default.pla_SprintPlan.findMany).mockResolvedValue([] as never)

      const res = await app.inject({
        method: 'GET',
        url: '/api/sprint-plans/active?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.plans).toHaveLength(0)
    })
  })

  // ── GET /api/sprint-plans/:id/problems ──────────────────────────────────

  describe('GET /api/sprint-plans/:id/problems', () => {
    it('returns 400 when studentId is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/sprint-plans/1/problems',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns paginated problems list', async () => {
      const prisma = await import('../utils/prisma')

      const mockStudent = { id: BigInt(1), userId: BigInt(1), name: '小明', grade: 5, isDefault: true }
      vi.mocked(prisma.default.usr_Student.findFirst).mockResolvedValue(mockStudent as never)

      const mockPlan = { id: BigInt(1), studentId: BigInt(1), subject: '数学', examDate: new Date(), createdAt: new Date() }
      vi.mocked(prisma.default.pla_SprintPlan.findFirst).mockResolvedValue(mockPlan as never)

      vi.mocked(prisma.default.stu_Problem.count).mockResolvedValue(2)
      vi.mocked(prisma.default.stu_Problem.findMany).mockResolvedValue([
        {
          id: BigInt(1), seq: 1, ocrText: '1+1=?', correctAnswer: '2',
          result: 'wrong', knowledgePoint: '加法', reviewStage: 0
        },
        {
          id: BigInt(2), seq: 2, ocrText: '2+2=?', correctAnswer: '4',
          result: 'wrong', knowledgePoint: '加法', reviewStage: 1
        }
      ] as never)

      const res = await app.inject({
        method: 'GET',
        url: '/api/sprint-plans/1/problems?studentId=1',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.data.problems).toHaveLength(2)
      expect(body.meta.total).toBe(2)
    })
  })

  // ── DELETE /api/sprint-plans/:id ─────────────────────────────────────────

  describe('DELETE /api/sprint-plans/:id', () => {
    it('returns 404 when plan not found', async () => {
      const prisma = await import('../utils/prisma')
      vi.mocked(prisma.default.pla_SprintPlan.findFirst).mockResolvedValue(null)

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/sprint-plans/999',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(404)
    })

    it('deletes plan and returns success', async () => {
      const prisma = await import('../utils/prisma')

      const mockPlan = { id: BigInt(1), studentId: BigInt(1), subject: '数学', examDate: new Date(), createdAt: new Date() }
      vi.mocked(prisma.default.pla_SprintPlan.findFirst).mockResolvedValue(mockPlan as never)
      vi.mocked(prisma.default.pla_SprintPlan.delete).mockResolvedValue(mockPlan as never)

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/sprint-plans/1',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.deleted).toBe(true)
    })
  })
})
