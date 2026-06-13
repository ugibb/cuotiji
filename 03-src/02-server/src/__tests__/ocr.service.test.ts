import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock tencentcloud SDK before importing ocrService
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

describe('OCR Service — extractHandwriting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TENCENT_SECRET_ID = 'test-id'
    process.env.TENCENT_SECRET_KEY = 'test-key'
  })

  it('returns joined text from TextDetections', async () => {
    mockGeneralHandwritingOCR.mockResolvedValueOnce({
      TextDetections: [
        { DetectedText: '鸡12只' },
        { DetectedText: '兔8只' }
      ]
    })
    const result = await ocrService.extractHandwriting('https://example.com/a.jpg')
    expect(result).toBe('鸡12只\n兔8只')
  })

  it('returns empty string when TextDetections is empty', async () => {
    mockGeneralHandwritingOCR.mockResolvedValueOnce({ TextDetections: [] })
    const result = await ocrService.extractHandwriting('https://example.com/blank.jpg')
    expect(result).toBe('')
  })

  it('returns empty string when TextDetections is undefined', async () => {
    mockGeneralHandwritingOCR.mockResolvedValueOnce({})
    const result = await ocrService.extractHandwriting('https://example.com/undef.jpg')
    expect(result).toBe('')
  })

  it('skips blank DetectedText entries', async () => {
    mockGeneralHandwritingOCR.mockResolvedValueOnce({
      TextDetections: [
        { DetectedText: '35' },
        { DetectedText: '' },
        { DetectedText: '  ' }
      ]
    })
    const result = await ocrService.extractHandwriting('https://example.com/sparse.jpg')
    expect(result).toBe('35')
  })

  it('throws when credentials are missing', async () => {
    delete process.env.TENCENT_SECRET_ID
    await expect(ocrService.extractHandwriting('https://example.com/a.jpg'))
      .rejects.toThrow('TENCENT_SECRET_ID')
  })

  it('propagates Tencent SDK errors', async () => {
    mockGeneralHandwritingOCR.mockRejectedValueOnce(new Error('network timeout'))
    await expect(ocrService.extractHandwriting('https://example.com/a.jpg'))
      .rejects.toThrow('network timeout')
  })
})
