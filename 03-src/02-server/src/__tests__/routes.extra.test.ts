/**
 * Extra route coverage tests:
 * - GET /api/chapters
 * - POST /api/upload/presign
 * - GET /api/problems/:id/dialogues
 * - GET /api/problems/:id
 * - GET /api/assignments (list)
 * - POST /api/assignments/:id/complete-review
 * These routes were untouched by existing tests.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { buildApp } from '../index'

vi.mock('../utils/prisma', () => ({
  default: {
    chapter: { findMany: vi.fn(), findUnique: vi.fn() },
    student: { findFirst: vi.fn() },
    problem: { findFirst: vi.fn() },
    dialogue: { findMany: vi.fn(), create: vi.fn() },
    assignment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    reviewSession: { upsert: vi.fn() }
  }
}))

vi.mock('../services/storage.service', () => ({
  storageService: {
    getPresignedUrl: vi.fn().mockResolvedValue({
      uploadUrl: 'https://cos.../put-presigned',
      fileUrl: 'https://cos.../file.jpg'
    })
  }
}))

vi.mock('../services/ai.service', () => ({
  aiService: {
    generateDialogueReply: vi.fn().mockResolvedValue('好的，继续！'),
    generateMoodText: vi.fn().mockResolvedValue('加油！')
  }
}))

async function getTestToken(app: ReturnType<typeof buildApp>): Promise<string> {
  return app.jwt.sign({ userId: 1, openid: 'test_openid' })
}

// ----------------------------------------------------------------
// GET /api/chapters
// ----------------------------------------------------------------
describe('GET /api/chapters', () => {
  const app = buildApp()

  beforeAll(async () => { await app.ready() })
  afterAll(async () => { await app.close() })
  afterEach(() => { vi.clearAllMocks() })

  it('should return 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/chapters' })
    expect(response.statusCode).toBe(401)
  })

  it('should return chapters list', async () => {
    const prisma = await import('../utils/prisma')
    const mockChapters = [
      { id: 1, code: 'ch01', name: '第1章·计数原理', subtitle: null, grade: 4, sortOrder: 1 },
      { id: 2, code: 'ch02', name: '第2章·整除', subtitle: '整除基础', grade: 4, sortOrder: 2 }
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.knl_Chapter.findMany as any).mockResolvedValue(mockChapters)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/chapters',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.chapters).toHaveLength(2)
    expect(body.data.chapters[0].code).toBe('ch01')
  })

  it('should return empty array when no chapters exist', async () => {
    const prisma = await import('../utils/prisma')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.knl_Chapter.findMany as any).mockResolvedValue([])

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/chapters',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.data.chapters).toHaveLength(0)
  })
})

// ----------------------------------------------------------------
// POST /api/upload/presign
// ----------------------------------------------------------------
describe('POST /api/upload/presign', () => {
  const app = buildApp()

  beforeAll(async () => { await app.ready() })
  afterAll(async () => { await app.close() })
  afterEach(() => { vi.clearAllMocks() })

  it('should return 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/upload/presign',
      payload: { filename: 'test.jpg' }
    })
    expect(response.statusCode).toBe(401)
  })

  it('should return 400 when filename is missing', async () => {
    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/upload/presign',
      headers: { Authorization: `Bearer ${token}` },
      payload: {}
    })
    expect(response.statusCode).toBe(400)
  })

  it('should return uploadUrl and fileUrl for valid filename', async () => {
    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/upload/presign',
      headers: { Authorization: `Bearer ${token}` },
      payload: { filename: 'assignment-2026-04-22.jpg' }
    })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.uploadUrl).toBeTruthy()
    expect(body.data.fileUrl).toBeTruthy()
  })
})

// ----------------------------------------------------------------
// GET /api/problems/:id/dialogues
// ----------------------------------------------------------------
describe('GET /api/problems/:id/dialogues', () => {
  const app = buildApp()

  beforeAll(async () => { await app.ready() })
  afterAll(async () => { await app.close() })
  afterEach(() => { vi.clearAllMocks() })

  it('should return 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/problems/42/dialogues' })
    expect(response.statusCode).toBe(401)
  })

  it('should return 404 when problem not found', async () => {
    const prisma = await import('../utils/prisma')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Problem.findFirst as any).mockResolvedValue(null)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/problems/999/dialogues',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(404)
  })

  it('should return dialogue history for a valid problem', async () => {
    const prisma = await import('../utils/prisma')
    const mockProblem = { id: BigInt(42), assignmentId: BigInt(1), result: 'wrong' }
    const mockDialogues = [
      { id: BigInt(1), problemId: BigInt(42), role: 'ai', content: '你好！', audioUrl: null, createdAt: new Date() },
      { id: BigInt(2), problemId: BigInt(42), role: 'student', content: '我的思路是...', audioUrl: null, createdAt: new Date() }
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Problem.findFirst as any).mockResolvedValue(mockProblem)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Dialogue.findMany as any).mockResolvedValue(mockDialogues)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/problems/42/dialogues',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.dialogues).toHaveLength(2)
    expect(body.data.dialogues[0].role).toBe('ai')
    expect(body.data.dialogues[1].role).toBe('student')
  })

  it('should return empty dialogues array for a new problem', async () => {
    const prisma = await import('../utils/prisma')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Problem.findFirst as any).mockResolvedValue({ id: BigInt(42) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Dialogue.findMany as any).mockResolvedValue([])

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/problems/42/dialogues',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.data.dialogues).toHaveLength(0)
  })
})

// ----------------------------------------------------------------
// GET /api/problems/:id (single problem)
// ----------------------------------------------------------------
describe('GET /api/problems/:id', () => {
  const app = buildApp()

  beforeAll(async () => { await app.ready() })
  afterAll(async () => { await app.close() })
  afterEach(() => { vi.clearAllMocks() })

  it('should return 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/problems/1' })
    expect(response.statusCode).toBe(401)
  })

  it('should return 404 when problem not found', async () => {
    const prisma = await import('../utils/prisma')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Problem.findFirst as any).mockResolvedValue(null)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/problems/999',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(404)
  })

  it('should return problem detail', async () => {
    const prisma = await import('../utils/prisma')
    const mockProblem = {
      id: BigInt(1), assignmentId: BigInt(100), seq: 1,
      ocrText: '鸡兔同笼，头20脚56，鸡兔各几只？',
      studentAnswer: '鸡8只', correctAnswer: '鸡12只',
      result: 'wrong', knowledgePoint: '鸡兔同笼', trapDesc: '脚数',
      solutionText: '设鸡x只', rootCause: '脚数搞反', reviewStatus: 'pending'
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Problem.findFirst as any).mockResolvedValue(mockProblem)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/problems/1',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.result).toBe('wrong')
    expect(body.data.knowledgePoint).toBe('鸡兔同笼')
  })
})

// ----------------------------------------------------------------
// GET /api/assignments (list)
// ----------------------------------------------------------------
describe('GET /api/assignments', () => {
  const app = buildApp()

  beforeAll(async () => { await app.ready() })
  afterAll(async () => { await app.close() })
  afterEach(() => { vi.clearAllMocks() })

  it('should return 400 when studentId is missing', async () => {
    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/assignments',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(400)
  })

  it('should return 404 when student not found', async () => {
    const prisma = await import('../utils/prisma')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.usr_Student.findFirst as any).mockResolvedValue(null)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/assignments?studentId=99',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(404)
  })

  it('should return assignment list for a valid student', async () => {
    const prisma = await import('../utils/prisma')
    const mockStudent = { id: BigInt(1), userId: BigInt(1), name: '小明', grade: 4, isDefault: true }
    const mockAssignments = [
      {
        id: BigInt(100), studentId: BigInt(1), chapterId: 1,
        planDate: new Date('2026-04-22'), imageUrl: 'https://cos.../test.jpg',
        status: 'graded', totalCount: 3, correctCount: 2, wrongCount: 1, unknownCount: 0,
        chapter: { id: 1, name: '第4章·整除与余数' },
        createdAt: new Date()
      }
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.usr_Student.findFirst as any).mockResolvedValue(mockStudent)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Assignment.findMany as any).mockResolvedValue(mockAssignments)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/assignments?studentId=1',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.assignments).toHaveLength(1)
    expect(body.data.assignments[0].status).toBe('graded')
  })
})

// ----------------------------------------------------------------
// POST /api/assignments/:id/complete-review
// ----------------------------------------------------------------
describe('POST /api/assignments/:id/complete-review', () => {
  const app = buildApp()

  beforeAll(async () => { await app.ready() })
  afterAll(async () => { await app.close() })
  afterEach(() => { vi.clearAllMocks() })

  it('should return 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/assignments/1/complete-review'
    })
    expect(response.statusCode).toBe(401)
  })

  it('should return 404 when assignment not found', async () => {
    const prisma = await import('../utils/prisma')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Assignment.findFirst as any).mockResolvedValue(null)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/assignments/9999/complete-review',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(404)
  })

  it('should complete review and return summary', async () => {
    const prisma = await import('../utils/prisma')
    const mockAssignment = {
      id: BigInt(100),
      studentId: BigInt(1),
      totalCount: 5,
      correctCount: 3,
      wrongCount: 2,
      unknownCount: 0,
      problems: []
    }
    const mockSession = {
      id: BigInt(1),
      assignmentId: BigInt(100),
      summaryText: '复盘完成：共 5 道题，答对 3 道',
      notifiedParent: false,
      startedAt: new Date(),
      completedAt: new Date()
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Assignment.findFirst as any).mockResolvedValue(mockAssignment)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Assignment.update as any).mockResolvedValue({ ...mockAssignment, status: 'reviewed' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_ReviewSession.upsert as any).mockResolvedValue(mockSession)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/assignments/100/complete-review',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.summary).toContain('复盘完成')
    expect(body.data.parentNotified).toBe(false)
  })
})
