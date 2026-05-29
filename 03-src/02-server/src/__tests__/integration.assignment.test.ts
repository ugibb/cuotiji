/**
 * Integration-style tests: upload → OCR → grading pipeline (fully mocked DB + services)
 * Tests the async processAssignment pathway indirectly via route + mocked Prisma.
 * No real DB or network required.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { buildApp } from '../index'

// Full Prisma mock
vi.mock('../utils/prisma', () => ({
  default: {
    student: { findFirst: vi.fn() },
    chapter:  { findUnique: vi.fn() },
    assignment: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    problem: { create: vi.fn(), findFirst: vi.fn() },
    dialogue: { findMany: vi.fn(), create: vi.fn() },
    reviewSession: { upsert: vi.fn() }
  }
}))

// Mock OCR + AI so we control the pipeline output
vi.mock('../services/ocr.service', () => ({
  ocrService: {
    recognizeProblems: vi.fn().mockResolvedValue({
      problems: [
        { text: '鸡兔同笼，头20脚56，鸡兔各几只？', studentAnswer: '鸡8只，兔12只' },
        { text: '1到100的和', studentAnswer: '5050' }
      ]
    })
  }
}))

vi.mock('../services/ai.service', () => ({
  aiService: {
    gradeProblems: vi.fn().mockResolvedValue({
      result: 'wrong',
      correctAnswer: '鸡12只，兔8只',
      knowledgePoint: '鸡兔同笼',
      trapDesc: '脚数系数',
      solutionText: '设鸡x只',
      rootCause: '搞混了脚数'
    }),
    generateDialogueReply: vi.fn().mockResolvedValue('继续说说你的思路'),
    generateMoodText: vi.fn().mockResolvedValue('不错的练习！')
  }
}))

async function getTestToken(app: ReturnType<typeof buildApp>): Promise<string> {
  return app.jwt.sign({ userId: 1, openid: 'test_openid' })
}

describe('POST /api/assignments/upload — integration', () => {
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

  it('should return 400 when required fields are missing', async () => {
    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/assignments/upload',
      headers: { Authorization: `Bearer ${token}` },
      payload: { chapterId: 1, planDate: '2026-04-22' } // missing imageUrl, studentId
    })
    expect(response.statusCode).toBe(400)
  })

  it('should return 404 when student does not belong to user', async () => {
    const prisma = await import('../utils/prisma')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.usr_Student.findFirst as any).mockResolvedValue(null)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/assignments/upload',
      headers: { Authorization: `Bearer ${token}` },
      payload: { chapterId: 1, planDate: '2026-04-22', imageUrl: 'https://cos.../test.jpg', studentId: 999 }
    })
    expect(response.statusCode).toBe(404)
  })

  it('should return 404 when chapter does not exist', async () => {
    const prisma = await import('../utils/prisma')
    const mockStudent = { id: BigInt(1), userId: BigInt(1), name: '小明', grade: 4, isDefault: true }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.usr_Student.findFirst as any).mockResolvedValue(mockStudent)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.knl_Chapter.findUnique as any).mockResolvedValue(null)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/assignments/upload',
      headers: { Authorization: `Bearer ${token}` },
      payload: { chapterId: 99, planDate: '2026-04-22', imageUrl: 'https://cos.../test.jpg', studentId: 1 }
    })
    expect(response.statusCode).toBe(404)
  })

  it('should create assignment and return 201 with assignmentId + status', async () => {
    const prisma = await import('../utils/prisma')
    const mockStudent = { id: BigInt(1), userId: BigInt(1), name: '小明', grade: 4, isDefault: true }
    const mockChapter = { id: 1, code: 'ch04', name: '第4章·整除与余数', subtitle: null }
    const mockAssignment = {
      id: BigInt(100),
      studentId: BigInt(1),
      chapterId: 1,
      planDate: new Date('2026-04-22'),
      imageUrl: 'https://cos.../test.jpg',
      status: 'ocr_pending',
      totalCount: 0,
      correctCount: 0,
      wrongCount: 0,
      unknownCount: 0,
      moodText: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.usr_Student.findFirst as any).mockResolvedValue(mockStudent)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.knl_Chapter.findUnique as any).mockResolvedValue(mockChapter)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Assignment.create as any).mockResolvedValue(mockAssignment)
    // background grading will call update; mock to avoid unhandled rejections
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Assignment.update as any).mockResolvedValue(mockAssignment)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Problem.create as any).mockResolvedValue({
      id: BigInt(1), assignmentId: BigInt(100), seq: 1, result: 'wrong',
      ocrText: '题目', studentAnswer: '答案', correctAnswer: '正确答案',
      knowledgePoint: '知识点', trapDesc: '坑', solutionText: '解题', rootCause: '归因',
      reviewStatus: 'pending', createdAt: new Date()
    })

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/assignments/upload',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        chapterId: 1,
        planDate: '2026-04-22',
        imageUrl: 'https://cos.../test.jpg',
        studentId: 1
      }
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.assignmentId).toBe(100)
    expect(body.data.status).toBe('ocr_pending')
  })
})

describe('GET /api/assignments/:id — integration', () => {
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
      url: '/api/assignments/1'
    })
    expect(response.statusCode).toBe(401)
  })

  it('should return 404 when assignment not found', async () => {
    const prisma = await import('../utils/prisma')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Assignment.findFirst as any).mockResolvedValue(null)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/assignments/9999',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.statusCode).toBe(404)
  })

  it('should return assignment with problems when found', async () => {
    const prisma = await import('../utils/prisma')
    const mockAssignment = {
      id: BigInt(100),
      studentId: BigInt(1),
      chapterId: 1,
      planDate: new Date('2026-04-22'),
      imageUrl: 'https://cos.../test.jpg',
      imageUrlThumb: null,
      status: 'graded',
      totalCount: 2,
      correctCount: 1,
      wrongCount: 1,
      unknownCount: 0,
      moodText: '不错！',
      chapter: { id: 1, name: '第4章·整除与余数' },
      problems: [
        {
          id: BigInt(1), assignmentId: BigInt(100), seq: 1,
          ocrText: '鸡兔同笼', studentAnswer: '错误答案', correctAnswer: '正确答案',
          result: 'wrong', knowledgePoint: '鸡兔同笼', trapDesc: '坑',
          solutionText: '解法', rootCause: '归因', reviewStatus: 'pending'
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Assignment.findFirst as any).mockResolvedValue(mockAssignment)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'GET',
      url: '/api/assignments/100',
      headers: { Authorization: `Bearer ${token}` }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe(100)
    expect(body.data.status).toBe('graded')
    expect(body.data.problems).toHaveLength(1)
    expect(body.data.problems[0].result).toBe('wrong')
  })
})
