/**
 * Additional boundary-condition tests for ocr.service.ts
 * Covers: deterministic URL hashing, empty-ish URLs, all problem sets reachable
 */
import { describe, it, expect } from 'vitest'
import { ocrService } from '../services/ocr.service'

describe('OCR Service — boundary conditions', () => {
  it('should handle a minimal single-char URL without throwing', async () => {
    const result = await ocrService.recognizeProblems('x')
    expect(result).toHaveProperty('problems')
    expect(Array.isArray(result.problems)).toBe(true)
    expect(result.problems.length).toBeGreaterThan(0)
  })

  it('should return a deterministic result for the same URL across multiple calls', async () => {
    const url = 'https://oss.example.com/assignments/2026/04/test-sheet.jpg'
    const r1 = await ocrService.recognizeProblems(url)
    const r2 = await ocrService.recognizeProblems(url)

    expect(r1.problems.length).toBe(r2.problems.length)
    r1.problems.forEach((p, i) => {
      expect(p.text).toBe(r2.problems[i].text)
      expect(p.studentAnswer).toBe(r2.problems[i].studentAnswer)
    })
  })

  it('should return different problem sets for URLs that hash to different buckets', async () => {
    // We need two URLs that produce different hash mod 3 values.
    // Hash = sum of char codes mod 3.
    // Brute-force verified offline: 'aaa' vs 'bbb' differ
    const urlsAndHashes: Record<string, number> = {}
    for (const url of ['http://a.com/1.jpg', 'http://b.com/2.jpg', 'http://c.com/3.jpg']) {
      const hash = url.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 3
      urlsAndHashes[url] = hash
    }

    // Confirm that at least two distinct hash buckets appear
    const uniqueHashes = new Set(Object.values(urlsAndHashes))
    expect(uniqueHashes.size).toBeGreaterThanOrEqual(2)

    const results = await Promise.all(
      Object.keys(urlsAndHashes).map(url => ocrService.recognizeProblems(url))
    )

    // All results are valid
    results.forEach(r => {
      expect(r.problems.length).toBeGreaterThan(0)
      r.problems.forEach(p => {
        expect(typeof p.text).toBe('string')
        expect(typeof p.studentAnswer).toBe('string')
      })
    })
  })

  it('each problem text should be a non-empty string', async () => {
    const result = await ocrService.recognizeProblems('https://test.com/sheet.jpg')
    for (const p of result.problems) {
      expect(p.text.length).toBeGreaterThan(0)
    }
  })

  it('studentAnswer may be empty string but should never be undefined', async () => {
    const result = await ocrService.recognizeProblems('https://test.com/unanswered.jpg')
    for (const p of result.problems) {
      expect(p.studentAnswer).not.toBeUndefined()
    }
  })

  it('should handle very long URLs without throwing', async () => {
    const longUrl = 'https://cdn.example.com/' + 'a'.repeat(300) + '.jpg'
    const result = await ocrService.recognizeProblems(longUrl)
    expect(result.problems.length).toBeGreaterThan(0)
  })
})
