/**
 * Route-level tests for POST /api/problems/:id/dialogue
 * Covers: missing content field (400), problem not found (404),
 *         normal success path, and type field variants.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { buildApp } from '../index'

vi.mock('../utils/prisma', () => ({
  default: {
    problem: {
      findFirst: vi.fn()
    },
    dialogue: {
      findMany: vi.fn(),
      create: vi.fn()
    }
  }
}))

vi.mock('../services/ai.service', () => ({
  aiService: {
    generateDialogueReply: vi.fn().mockResolvedValue('很好，你继续说说你的解题思路。')
  }
}))

async function getTestToken(app: ReturnType<typeof buildApp>): Promise<string> {
  return app.jwt.sign({ userId: 1, openid: 'test_openid' })
}

function makeProblem(result: 'correct' | 'wrong' | 'unknown' = 'wrong') {
  return {
    id: BigInt(42),
    assignmentId: BigInt(1),
    seq: 1,
    ocrText: '鸡兔同笼，头20脚56，鸡兔各几只？',
    studentAnswer: '鸡8只，兔12只',
    correctAnswer: '鸡12只，兔8只',
    result,
    knowledgePoint: '鸡兔同笼',
    trapDesc: '脚数系数容易搞反',
    solutionText: '设鸡x只',
    rootCause: '搞混了脚数',
    reviewStatus: 'pending',
    createdAt: new Date()
  }
}

describe('POST /api/problems/:id/dialogue', () => {
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

  it('should return 401 without auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/problems/42/dialogue',
      payload: { content: '我用方程法', type: 'text' }
    })
    expect(response.statusCode).toBe(401)
  })

  it('should return 400 when content field is missing', async () => {
    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/problems/42/dialogue',
      headers: { Authorization: `Bearer ${token}` },
      payload: { type: 'text' } // missing content
    })
    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error).toBeTruthy()
  })

  it('should return 400 when content is empty string', async () => {
    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/problems/42/dialogue',
      headers: { Authorization: `Bearer ${token}` },
      payload: { content: '', type: 'text' }
    })
    expect(response.statusCode).toBe(400)
  })

  it('should return 404 when problem does not exist or is not owned', async () => {
    const prisma = await import('../utils/prisma')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Problem.findFirst as any).mockResolvedValue(null)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/problems/999/dialogue',
      headers: { Authorization: `Bearer ${token}` },
      payload: { content: '我的答案是5050', type: 'text' }
    })
    expect(response.statusCode).toBe(404)
  })

  it('should return 200 with dialogue + aiReply for a valid wrong-result problem', async () => {
    const prisma = await import('../utils/prisma')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Problem.findFirst as any).mockResolvedValue(makeProblem('wrong'))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Dialogue.findMany as any).mockResolvedValue([])

    const studentMsg = {
      id: BigInt(1), problemId: BigInt(42), role: 'student' as const,
      content: '我用了方程法', audioUrl: null, createdAt: new Date()
    }
    const aiMsg = {
      id: BigInt(2), problemId: BigInt(42), role: 'ai' as const,
      content: '很好，你继续说说你的解题思路。', audioUrl: null, createdAt: new Date()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Dialogue.create as any)
      .mockResolvedValueOnce(studentMsg)
      .mockResolvedValueOnce(aiMsg)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/problems/42/dialogue',
      headers: { Authorization: `Bearer ${token}` },
      payload: { content: '我用了方程法', type: 'text' }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.data.dialogue.role).toBe('student')
    expect(body.data.aiReply.role).toBe('ai')
    expect(body.data.aiReply.content).toBeTruthy()
  })

  it('should accept type=audio_transcribed in payload', async () => {
    const prisma = await import('../utils/prisma')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Problem.findFirst as any).mockResolvedValue(makeProblem('unknown'))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Dialogue.findMany as any).mockResolvedValue([])

    const studentMsg = {
      id: BigInt(3), problemId: BigInt(42), role: 'student' as const,
      content: '（语音转写）我不会做这题', audioUrl: null, createdAt: new Date()
    }
    const aiMsg = {
      id: BigInt(4), problemId: BigInt(42), role: 'ai' as const,
      content: '好，我们先读题，题目里有哪些已知条件？', audioUrl: null, createdAt: new Date()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Dialogue.create as any)
      .mockResolvedValueOnce(studentMsg)
      .mockResolvedValueOnce(aiMsg)

    const token = await getTestToken(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/problems/42/dialogue',
      headers: { Authorization: `Bearer ${token}` },
      payload: { content: '（语音转写）我不会做这题', type: 'audio_transcribed' }
    })

    expect(response.statusCode).toBe(200)
  })

  it('should pass conversation history to ai.service', async () => {
    const prisma = await import('../utils/prisma')
    const { aiService } = await import('../services/ai.service')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Problem.findFirst as any).mockResolvedValue(makeProblem('wrong'))

    const existingHistory = [
      { id: BigInt(10), problemId: BigInt(42), role: 'ai' as const, content: '你好！', audioUrl: null, createdAt: new Date() },
      { id: BigInt(11), problemId: BigInt(42), role: 'student' as const, content: '我用了方程法', audioUrl: null, createdAt: new Date() }
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Dialogue.findMany as any).mockResolvedValue(existingHistory)

    const studentMsg = {
      id: BigInt(12), problemId: BigInt(42), role: 'student' as const,
      content: '设鸡x只', audioUrl: null, createdAt: new Date()
    }
    const aiMsg = {
      id: BigInt(13), problemId: BigInt(42), role: 'ai' as const,
      content: '很好，继续', audioUrl: null, createdAt: new Date()
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.default.stu_Dialogue.create as any)
      .mockResolvedValueOnce(studentMsg)
      .mockResolvedValueOnce(aiMsg)

    const token = await getTestToken(app)
    await app.inject({
      method: 'POST',
      url: '/api/problems/42/dialogue',
      headers: { Authorization: `Bearer ${token}` },
      payload: { content: '设鸡x只', type: 'text' }
    })

    expect(aiService.generateDialogueReply).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(aiService.generateDialogueReply).mock.calls[0]
    // Third arg is the history array
    expect(Array.isArray(callArgs[2])).toBe(true)
    expect(callArgs[2].length).toBe(2)
  })
})
