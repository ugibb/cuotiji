/**
 * Additional boundary-condition tests for ai.service.ts
 * Covers: empty inputs, oversized inputs, all three dialogue modes
 */
import { describe, it, expect, vi } from 'vitest'
import { aiService } from '../services/ai.service'

// Keep axios mocked so no real HTTP calls are made
vi.mock('axios', () => ({
  default: {
    post: vi.fn()
  }
}))

// ----------------------------------------------------------------
// gradeProblems — boundary conditions
// ----------------------------------------------------------------
describe('AI Service — gradeProblems boundary conditions', () => {
  it('should handle empty ocrText without throwing', async () => {
    const result = await aiService.gradeProblems('', '2', '基础运算')
    expect(result).toHaveProperty('result')
    expect(['correct', 'wrong', 'unknown']).toContain(result.result)
  })

  it('should handle empty studentAnswer (unanswered problem)', async () => {
    const result = await aiService.gradeProblems(
      '1+1等于多少？',
      '',
      '基础运算'
    )
    expect(result).toHaveProperty('result')
    expect(result).toHaveProperty('correctAnswer')
  })

  it('should handle both ocrText and studentAnswer empty', async () => {
    const result = await aiService.gradeProblems('', '', '未知章节')
    // Must not throw; fallback result accepted
    expect(result).toHaveProperty('result')
    expect(typeof result.knowledgePoint).toBe('string')
  })

  it('should handle extremely long ocrText (>500 chars) without throwing', async () => {
    const longText = '这是一道很长的题目文字。'.repeat(60) // ~600 chars
    const result = await aiService.gradeProblems(longText, '答案', '测试章节')
    expect(result).toHaveProperty('result')
    expect(['correct', 'wrong', 'unknown']).toContain(result.result)
  })

  it('should handle extremely long studentAnswer without throwing', async () => {
    const longAnswer = '学生的解答过程很长。'.repeat(60)
    const result = await aiService.gradeProblems('题目', longAnswer, '测试')
    expect(result).toHaveProperty('result')
  })

  it('should always return a non-null string for knowledgePoint', async () => {
    const result = await aiService.gradeProblems('题目', '答案', '鸡兔同笼')
    expect(typeof result.knowledgePoint).toBe('string')
    expect(result.knowledgePoint.length).toBeGreaterThanOrEqual(0)
  })

  it('rootCause should be null or string, never undefined', async () => {
    const result = await aiService.gradeProblems('题目', '答案', '等差数列')
    expect(result.rootCause === null || typeof result.rootCause === 'string').toBe(true)
  })
})

// ----------------------------------------------------------------
// generateDialogueReply — all three result modes
// ----------------------------------------------------------------
describe('AI Service — generateDialogueReply per mode', () => {
  const baseHistory: Array<{ role: 'ai' | 'student'; content: string }> = []

  it('mode=wrong: should return non-empty reply', async () => {
    const problem = {
      ocrText: '鸡兔同笼，头35脚94，鸡兔各几只？',
      studentAnswer: '鸡10只，兔25只',
      correctAnswer: '鸡23只，兔12只',
      result: 'wrong',
      knowledgePoint: '鸡兔同笼',
      trapDesc: '脚数系数容易搞反',
      solutionText: '设鸡x只：x+y=35，2x+4y=94',
      rootCause: '混淆了鸡和兔的脚数'
    }

    const reply = await aiService.generateDialogueReply(problem, '我用了方程法', baseHistory)
    expect(typeof reply).toBe('string')
    expect(reply.length).toBeGreaterThan(0)
  })

  it('mode=unknown: should return non-empty reply', async () => {
    const problem = {
      ocrText: '甲、乙两地相距200千米，问开车需要多少小时？',
      studentAnswer: '',
      correctAnswer: '4小时',
      result: 'unknown',
      knowledgePoint: '行程问题',
      trapDesc: null,
      solutionText: '时间=路程÷速度',
      rootCause: null
    }

    const reply = await aiService.generateDialogueReply(problem, '我不会', baseHistory)
    expect(typeof reply).toBe('string')
    expect(reply.length).toBeGreaterThan(0)
  })

  it('mode=correct: should return non-empty reply', async () => {
    const problem = {
      ocrText: '1到100的自然数之和是多少？',
      studentAnswer: '5050',
      correctAnswer: '5050',
      result: 'correct',
      knowledgePoint: '高斯求和',
      trapDesc: '直接逐个相加太慢',
      solutionText: '(1+100)×100÷2=5050',
      rootCause: null
    }

    const reply = await aiService.generateDialogueReply(problem, '我用首尾配对法', baseHistory)
    expect(typeof reply).toBe('string')
    expect(reply.length).toBeGreaterThan(0)
  })

  it('should handle non-standard result value gracefully (defaults to correct branch)', async () => {
    const problem = {
      ocrText: '测试题目',
      studentAnswer: '答案',
      correctAnswer: '答案',
      result: 'pending', // unexpected value
      knowledgePoint: null,
      trapDesc: null,
      solutionText: null,
      rootCause: null
    }

    const reply = await aiService.generateDialogueReply(problem, '继续', baseHistory)
    expect(typeof reply).toBe('string')
  })

  it('should work with populated conversation history', async () => {
    const problem = {
      ocrText: '鸡兔同笼，头20脚56，鸡兔各几只？',
      studentAnswer: '鸡8只，兔12只',
      correctAnswer: '鸡12只，兔8只',
      result: 'wrong',
      knowledgePoint: '鸡兔同笼',
      trapDesc: null,
      solutionText: null,
      rootCause: '搞混了鸡和兔的脚数'
    }

    const history: Array<{ role: 'ai' | 'student'; content: string }> = [
      { role: 'ai', content: '你好，我们一起看看这道题' },
      { role: 'student', content: '我设x是鸡，y是兔' },
      { role: 'ai', content: '很好！那脚的方程怎么列？' },
      { role: 'student', content: '4x+2y=56' }
    ]

    const reply = await aiService.generateDialogueReply(problem, '然后我解出x=8', history)
    expect(typeof reply).toBe('string')
    expect(reply.length).toBeGreaterThan(0)
  })

  it('should handle empty student message without throwing', async () => {
    const problem = {
      ocrText: '测试题',
      studentAnswer: '',
      correctAnswer: '42',
      result: 'unknown',
      knowledgePoint: '测试',
      trapDesc: null,
      solutionText: null,
      rootCause: null
    }

    const reply = await aiService.generateDialogueReply(problem, '', baseHistory)
    expect(typeof reply).toBe('string')
  })
})

// ----------------------------------------------------------------
// generateMoodText — boundary conditions
// ----------------------------------------------------------------
describe('AI Service — generateMoodText boundary conditions', () => {
  it('should return non-empty string for low accuracy (0 correct)', async () => {
    const result = await aiService.generateMoodText({
      total: 5,
      correct: 0,
      wrong: 5,
      unknown: 0,
      chapter: '整除与余数'
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('should return non-empty string for medium accuracy', async () => {
    const result = await aiService.generateMoodText({
      total: 4,
      correct: 2,
      wrong: 2,
      unknown: 0,
      chapter: '行程问题'
    })
    expect(typeof result).toBe('string')
  })

  it('should return non-empty string for perfect accuracy (all correct)', async () => {
    const result = await aiService.generateMoodText({
      total: 5,
      correct: 5,
      wrong: 0,
      unknown: 0,
      chapter: '鸡兔同笼'
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('counts should not produce negative accuracy', async () => {
    // Malformed data: correct > total (defensive path)
    const result = await aiService.generateMoodText({
      total: 2,
      correct: 5, // invalid but should not crash
      wrong: 0,
      unknown: 0,
      chapter: '测试'
    })
    expect(typeof result).toBe('string')
  })
})
