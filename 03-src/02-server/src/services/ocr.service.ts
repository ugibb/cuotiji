import fs from 'fs'
import path from 'path'
import * as tencentcloud from 'tencentcloud-sdk-nodejs-ocr'

const OcrClient = tencentcloud.ocr.v20181119.Client

function createClient() {
  const secretId = process.env.TENCENT_SECRET_ID
  const secretKey = process.env.TENCENT_SECRET_KEY
  if (!secretId || !secretKey) {
    throw new Error('TENCENT_SECRET_ID / TENCENT_SECRET_KEY 未配置')
  }
  return new OcrClient({
    credential: { secretId, secretKey },
    region: 'ap-guangzhou',
    profile: { httpProfile: { endpoint: 'ocr.tencentcloudapi.com', reqTimeout: 15 } }
  })
}

function isLocalUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url)
}

function readLocalImageAsBase64(imageUrl: string): string {
  const uploadDir = process.env.LOCAL_UPLOAD_DIR || './uploads'
  const filename = imageUrl.split('/uploads/').pop() || ''
  const filePath = path.join(uploadDir, filename)
  return fs.readFileSync(filePath).toString('base64')
}

// 提取图片中的手写文字，返回合并后的原始文本
async function extractHandwriting(imageUrl: string): Promise<string> {
  const client = createClient()

  // Tencent OCR 是公网服务，无法访问 localhost，本地开发改用 base64
  const params = isLocalUrl(imageUrl)
    ? { ImageBase64: readLocalImageAsBase64(imageUrl) }
    : { ImageUrl: imageUrl }

  const res = await client.GeneralHandwritingOCR(params)
  const blocks: string[] = (res.TextDetections ?? []).map(d => (d.DetectedText ?? '').trim()).filter(Boolean)
  return blocks.join('\n')
}

export const ocrService = { extractHandwriting }
