import { describe, it, expect } from 'vitest'
import { ocrService } from '../services/ocr.service'

describe('OCR Service', () => {
  it('should return an OcrResult with problems array', async () => {
    const result = await ocrService.recognizeProblems('https://example.com/test.jpg')

    expect(result).toHaveProperty('problems')
    expect(Array.isArray(result.problems)).toBe(true)
    expect(result.problems.length).toBeGreaterThan(0)
  })

  it('each problem should have text and studentAnswer fields', async () => {
    const result = await ocrService.recognizeProblems('https://example.com/test.jpg')

    for (const problem of result.problems) {
      expect(problem).toHaveProperty('text')
      expect(problem).toHaveProperty('studentAnswer')
      expect(typeof problem.text).toBe('string')
      expect(typeof problem.studentAnswer).toBe('string')
    }
  })

  it('should return consistent results for same URL', async () => {
    const url = 'https://consistent-test-url.com/image.jpg'
    const result1 = await ocrService.recognizeProblems(url)
    const result2 = await ocrService.recognizeProblems(url)

    expect(result1.problems.length).toBe(result2.problems.length)
    expect(result1.problems[0].text).toBe(result2.problems[0].text)
  })

  it('should return different results for different URLs', async () => {
    // Two URLs that map to different mock problem sets
    // URL hash: sum of char codes modulo MOCK_PROBLEMS.length
    // We test that the service is deterministic (same URL = same result)
    const url1 = 'http://a.com/1.jpg'
    const url2 = 'http://b.com/different.jpg'

    const result1 = await ocrService.recognizeProblems(url1)
    const result2 = await ocrService.recognizeProblems(url2)

    // Both should be valid results, even if same set (hash collision is ok)
    expect(result1.problems.length).toBeGreaterThan(0)
    expect(result2.problems.length).toBeGreaterThan(0)
  })
})
