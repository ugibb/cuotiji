import { describe, it, expect, vi } from 'vitest'
import { aiService } from '../services/ai.service'

// Mock axios to avoid real API calls in tests
vi.mock('axios', () => ({
  default: {
    post: vi.fn()
  }
}))

describe('AI Service (mock mode)', () => {
  // In test environment, ANTHROPIC_API_KEY is not set, so mock mode is used

  describe('gradeProblems', () => {
    it('should return a valid GradeResult', async () => {
      const result = await aiService.gradeProblems(
        '1+1等于多少？',
        '2',
        '基础运算'
      )

      expect(result).toHaveProperty('result')
      expect(result).toHaveProperty('correctAnswer')
      expect(result).toHaveProperty('knowledgePoint')
      expect(result).toHaveProperty('trapDesc')
      expect(result).toHaveProperty('solutionText')
      expect(['correct', 'wrong', 'unknown']).toContain(result.result)
    })

    it('should return string types for all string fields', async () => {
      const result = await aiService.gradeProblems(
        '鸡兔同笼，共有头20个，脚56只，鸡兔各几只？',
        '鸡12只，兔8只',
        '鸡兔同笼'
      )

      expect(typeof result.correctAnswer).toBe('string')
      expect(typeof result.knowledgePoint).toBe('string')
      expect(typeof result.trapDesc).toBe('string')
      expect(typeof result.solutionText).toBe('string')
    })
  })

  describe('generateMoodText', () => {
    it('should return a non-empty string', async () => {
      const result = await aiService.generateMoodText({
        total: 5,
        correct: 3,
        wrong: 1,
        unknown: 1,
        chapter: '鸡兔同笼'
      })

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should return encouraging text for high accuracy', async () => {
      const result = await aiService.generateMoodText({
        total: 5,
        correct: 5,
        wrong: 0,
        unknown: 0,
        chapter: '整除与余数'
      })

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle zero total gracefully', async () => {
      const result = await aiService.generateMoodText({
        total: 0,
        correct: 0,
        wrong: 0,
        unknown: 0,
        chapter: '测试章节'
      })

      expect(typeof result).toBe('string')
    })
  })

  describe('generateDialogueReply', () => {
    it('should return a non-empty string reply', async () => {
      const mockProblem = {
        ocrText: '鸡兔同笼，共有头20个，脚56只，鸡兔各几只？',
        studentAnswer: '鸡8只，兔12只',
        correctAnswer: '鸡12只，兔8只',
        result: 'wrong',
        knowledgePoint: '鸡兔同笼·列方程法',
        trapDesc: '鸡和兔的脚数容易搞反',
        solutionText: '设鸡x只：x+y=20，2x+4y=56',
        rootCause: '混淆了鸡和兔的脚数'
      }

      const result = await aiService.generateDialogueReply(
        mockProblem,
        '我不知道怎么做',
        []
      )

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should work for correct problem result', async () => {
      const mockProblem = {
        ocrText: '1+1等于多少？',
        studentAnswer: '2',
        correctAnswer: '2',
        result: 'correct',
        knowledgePoint: '基础运算',
        trapDesc: '',
        solutionText: '直接相加',
        rootCause: null
      }

      const result = await aiService.generateDialogueReply(
        mockProblem,
        '我用凑十法做的',
        []
      )

      expect(typeof result).toBe('string')
    })

    it('should pass history to the dialogue', async () => {
      const mockProblem = {
        ocrText: '测试题目',
        studentAnswer: '',
        correctAnswer: '42',
        result: 'unknown',
        knowledgePoint: '测试',
        trapDesc: '',
        solutionText: '',
        rootCause: null
      }

      const history = [
        { role: 'ai' as const, content: '你好！我们来看看这道题' },
        { role: 'student' as const, content: '我看不懂题目' }
      ]

      const result = await aiService.generateDialogueReply(
        mockProblem,
        '能再解释一下吗',
        history
      )

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
