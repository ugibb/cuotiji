/**
 * Boundary tests for ocr.service — covers OCR text edge cases
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGeneralHandwritingOCR = vi.fn()
vi.mock('tencentcloud-sdk-nodejs-ocr', () => ({
  ocr: {
    v20181119: {
      Client: vi.fn().mockImplementation(() => ({
        GeneralHandwritingOCR: mockGeneralHandwritingOCR
      }))
    }
  }
}))

import { ocrService } from '../services/ocr.service'

describe('OCR Service — boundary conditions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TENCENT_SECRET_ID = 'test-id'
    process.env.TENCENT_SECRET_KEY = 'test-key'
  })

  it('handles multi-line handwriting with numbers and Chinese', async () => {
    mockGeneralHandwritingOCR.mockResolvedValueOnce({
      TextDetections: [
        { DetectedText: '解：设鸡x只，兔y只' },
        { DetectedText: 'x+y=20' },
        { DetectedText: '2x+4y=56' },
        { DetectedText: '答：鸡12只，兔8只' }
      ]
    })
    const result = await ocrService.extractHandwriting('https://example.com/solution.jpg')
    expect(result).toContain('鸡12只')
    expect(result).toContain('x+y=20')
    expect(result.split('\n').length).toBe(4)
  })

  it('handles undefined DetectedText gracefully', async () => {
    mockGeneralHandwritingOCR.mockResolvedValueOnce({
      TextDetections: [
        { DetectedText: undefined },
        { DetectedText: '5050' }
      ]
    })
    const result = await ocrService.extractHandwriting('https://example.com/partial.jpg')
    expect(result).toBe('5050')
  })

  it('handles very long detected text', async () => {
    const longText = '甲'.repeat(200)
    mockGeneralHandwritingOCR.mockResolvedValueOnce({
      TextDetections: [{ DetectedText: longText }]
    })
    const result = await ocrService.extractHandwriting('https://example.com/long.jpg')
    expect(result).toBe(longText)
  })

  it('handles whitespace-only entries', async () => {
    mockGeneralHandwritingOCR.mockResolvedValueOnce({
      TextDetections: [
        { DetectedText: '   ' },
        { DetectedText: '\t' },
        { DetectedText: '35' }
      ]
    })
    const result = await ocrService.extractHandwriting('https://example.com/ws.jpg')
    expect(result).toBe('35')
  })
})
