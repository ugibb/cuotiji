import { describe, it, expect } from 'vitest'
import { storageService } from '../services/storage.service'

describe('Storage Service (mock mode)', () => {
  describe('getPresignedUrl', () => {
    it('should return uploadUrl and fileUrl', async () => {
      const result = await storageService.getPresignedUrl('test-image.jpg')

      expect(result).toHaveProperty('uploadUrl')
      expect(result).toHaveProperty('fileUrl')
      expect(typeof result.uploadUrl).toBe('string')
      expect(typeof result.fileUrl).toBe('string')
    })

    it('should return URLs with the filename context', async () => {
      const result = await storageService.getPresignedUrl('assignment-123.jpg')

      expect(result.uploadUrl).toBeTruthy()
      expect(result.fileUrl).toBeTruthy()
      // Both should be valid URL strings
      expect(result.uploadUrl).toMatch(/^https?:\/\//)
      expect(result.fileUrl).toMatch(/^https?:\/\//)
    })

    it('should return different URLs for sequential calls', async () => {
      const result1 = await storageService.getPresignedUrl('file1.jpg')
      await new Promise(r => setTimeout(r, 1)) // ensure different timestamp
      const result2 = await storageService.getPresignedUrl('file2.jpg')

      // Each upload should get a unique target URL
      expect(result1.fileUrl).not.toBe(result2.fileUrl)
    })

    it('should handle various file extensions', async () => {
      const jpgResult = await storageService.getPresignedUrl('photo.jpg')
      const pngResult = await storageService.getPresignedUrl('photo.png')

      expect(jpgResult.fileUrl).toContain('.jpg')
      expect(pngResult.fileUrl).toContain('.png')
    })

    it('should handle filename without extension', async () => {
      const result = await storageService.getPresignedUrl('noextension')

      expect(result).toHaveProperty('uploadUrl')
      expect(result).toHaveProperty('fileUrl')
      // Should default to .jpg
      expect(result.fileUrl).toContain('.jpg')
    })
  })
})
