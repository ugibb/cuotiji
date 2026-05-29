import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export interface PresignResult {
  uploadUrl: string
  fileUrl: string
}

// Mock local storage implementation
// Production: replace with Tencent Cloud COS SDK

const UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || './uploads'

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  }
}

async function getPresignedUrl(filename: string): Promise<PresignResult> {
  const cosSecretId = process.env.COS_SECRET_ID
  const cosSecretKey = process.env.COS_SECRET_KEY

  // Production COS implementation (commented out, requires SDK)
  // if (cosSecretId && cosSecretKey && cosSecretId !== 'your-cos-secret-id') {
  //   const COS = require('cos-nodejs-sdk-v5')
  //   const cos = new COS({ SecretId: cosSecretId, SecretKey: cosSecretKey })
  //   const ext = path.extname(filename)
  //   const key = `assignments/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`
  //   const uploadUrl = await cos.getObjectUrl({ Bucket, Region, Key: key, Method: 'PUT', Sign: true })
  //   const fileUrl = `https://${Bucket}.cos.${Region}.myqcloud.com/${key}`
  //   return { uploadUrl, fileUrl }
  // }

  // Mock mode: return a local file endpoint
  ensureUploadDir()

  const ext = path.extname(filename) || '.jpg'
  const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`
  const serverPort = process.env.PORT || 3000
  const baseUrl = `http://localhost:${serverPort}`

  return {
    uploadUrl: `${baseUrl}/api/upload/local/${uniqueName}`,
    fileUrl: `${baseUrl}/uploads/${uniqueName}`
  }
}

async function saveLocalFile(filename: string, buffer: Buffer): Promise<string> {
  ensureUploadDir()
  const filePath = path.join(UPLOAD_DIR, filename)
  fs.writeFileSync(filePath, buffer)
  const serverPort = process.env.PORT || 3000
  return `http://localhost:${serverPort}/uploads/${filename}`
}

async function deleteFile(fileUrl: string): Promise<void> {
  // For local files, extract filename and delete
  if (fileUrl.includes('localhost')) {
    const filename = fileUrl.split('/').pop()
    if (filename) {
      const filePath = path.join(UPLOAD_DIR, filename)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    }
    return
  }
  // For COS files, call COS delete API
  // cos.deleteObject(...)
}

export const storageService = {
  getPresignedUrl,
  saveLocalFile,
  deleteFile
}
