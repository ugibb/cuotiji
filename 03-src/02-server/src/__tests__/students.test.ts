import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { buildApp } from '../index'

vi.mock('../utils/prisma', () => ({
  default: {
    user: {
      upsert: vi.fn(),
      findFirst: vi.fn()
    },
    student: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn()
    }
  }
}))

async function getTestToken(app: ReturnType<typeof buildApp>): Promise<string> {
  return app.jwt.sign({ userId: 1, openid: 'test_openid' })
}

describe('Students routes', () => {
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

  describe('GET /api/students', () => {
    it('should return 401 without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/students'
      })
      expect(response.statusCode).toBe(401)
    })

    it('should return student list for authenticated user', async () => {
      const prisma = await import('../utils/prisma')
      const mockStudents = [
        {
          id: BigInt(1),
          userId: BigInt(1),
          name: '小明',
          grade: 4,
          avatar: null,
          isDefault: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(prisma.default.usr_Student.findMany as any).mockResolvedValue(mockStudents)

      const token = await getTestToken(app)
      const response = await app.inject({
        method: 'GET',
        url: '/api/students',
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
      expect(body.data.students).toHaveLength(1)
      expect(body.data.students[0].name).toBe('小明')
    })
  })

  describe('POST /api/students', () => {
    it('should return 400 for invalid grade', async () => {
      const token = await getTestToken(app)
      const response = await app.inject({
        method: 'POST',
        url: '/api/students',
        headers: { Authorization: `Bearer ${token}` },
        payload: { name: '小红', grade: 9 }
      })
      expect(response.statusCode).toBe(400)
    })

    it('should create student successfully', async () => {
      const prisma = await import('../utils/prisma')
      const newStudent = {
        id: BigInt(2),
        userId: BigInt(1),
        name: '小红',
        grade: 5,
        avatar: null,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(prisma.default.usr_Student.create as any).mockResolvedValue(newStudent)

      const token = await getTestToken(app)
      const response = await app.inject({
        method: 'POST',
        url: '/api/students',
        headers: { Authorization: `Bearer ${token}` },
        payload: { name: '小红', grade: 5 }
      })

      expect(response.statusCode).toBe(201)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
      expect(body.data.name).toBe('小红')
    })
  })
})
