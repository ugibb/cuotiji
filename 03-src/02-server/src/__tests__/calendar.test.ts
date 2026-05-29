import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { buildApp } from '../index'

vi.mock('../utils/prisma', () => ({
  default: {
    student: {
      findFirst: vi.fn()
    },
    trainingPlan: {
      findMany: vi.fn()
    },
    assignment: {
      findMany: vi.fn()
    }
  }
}))

async function getTestToken(app: ReturnType<typeof buildApp>): Promise<string> {
  return app.jwt.sign({ userId: 1, openid: 'test_openid' })
}

describe('GET /api/calendar', () => {
  const app = buildApp()

  beforeAll(async () => {
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/calendar?year=2026&month=4&studentId=1'
    })
    expect(response.statusCode).toBe(401)
  })

  it('should return 400 when studentId is missing', async () => {
    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/calendar?year=2026&month=4',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(400)
  })

  it('should return 404 when student not found or not owned', async () => {
    const prisma = await import('../utils/prisma')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.usr_Student.findFirst as any).mockResolvedValue(null)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/calendar?year=2026&month=4&studentId=999',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(404)
  })

  it('should return plans for the month', async () => {
    const prisma = await import('../utils/prisma')
    const mockStudent = { id: BigInt(1), userId: BigInt(1), name: '小明', grade: 4, isDefault: true }
    const mockPlan = {
      id: BigInt(1),
      studentId: BigInt(1),
      project: '小学奥数',
      chapterId: 1,
      planDate: new Date('2026-04-22'),
      topic: '余数基本运算',
      keyPoints: ['余数加法', '余数乘法'],
      chapter: { id: 1, code: 'ch04', name: '第4章·整除与余数', subtitle: null }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.usr_Student.findFirst as any).mockResolvedValue(mockStudent)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_TrainingPlan.findMany as any).mockResolvedValue([mockPlan])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Assignment.findMany as any).mockResolvedValue([])

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/calendar?year=2026&month=4&studentId=1',
      headers: { Authorization: `Bearer ${token}` }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.plans).toHaveLength(1)
    expect(body.data.plans[0].planDate).toBe('2026-04-22')
    expect(body.data.plans[0].chapter.name).toBe('第4章·整除与余数')
  })
})
