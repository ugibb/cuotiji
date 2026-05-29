import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { buildApp } from '../index'

// Mock Prisma
vi.mock('../utils/prisma', () => ({
  default: {
    user: {
      upsert: vi.fn(),
      findFirst: vi.fn()
    },
    student: {
      findFirst: vi.fn()
    }
  }
}))

// Mock axios for wx code exchange
vi.mock('axios', () => ({
  default: {
    get: vi.fn()
  }
}))

describe('POST /api/auth/login', () => {
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

  it('should return 400 when code is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {}
    })

    expect(response.statusCode).toBe(400)
  })

  it('should return token and user when code is valid', async () => {
    const prisma = await import('../utils/prisma')
    const mockUser = {
      id: BigInt(1),
      openid: 'mock_openid_testcode',
      nickname: '家长',
      parentPhone: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.usr_User.upsert as any).mockResolvedValue(mockUser)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.usr_Student.findFirst as any).mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { code: 'testcode12345' }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.token).toBeTruthy()
    expect(body.data.user.openid).toBe('mock_openid_testcode')
  })

  it('should return consistent response structure', async () => {
    const prisma = await import('../utils/prisma')
    const mockUser = {
      id: BigInt(2),
      openid: 'mock_openid_anotherco',
      nickname: '家长',
      parentPhone: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.usr_User.upsert as any).mockResolvedValue(mockUser)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.usr_Student.findFirst as any).mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { code: 'anothercode' }
    })

    const body = JSON.parse(response.body)
    expect(body).toHaveProperty('success')
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('error')
    expect(body.data).toHaveProperty('token')
    expect(body.data).toHaveProperty('user')
  })
})
