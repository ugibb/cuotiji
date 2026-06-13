import COS from 'cos-nodejs-sdk-v5'
import { Readable } from 'stream'
import { randomBytes } from 'crypto'

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID || '',
  SecretKey: process.env.COS_SECRET_KEY || '',
})

const BUCKET = process.env.COS_BUCKET || ''
const REGION = process.env.COS_REGION || 'ap-guangzhou'

export async function uploadBuffer(
  buffer: Buffer,
  problemId: string,
  mimeType: string
): Promise<string> {
  const ext = mimeType.includes('png') ? 'png' : 'jpg'
  const rand = randomBytes(4).toString('hex')
  const key = `review/${problemId}/${Date.now()}-${rand}.${ext}`

  const stream = Readable.from(buffer)

  await new Promise<void>((resolve, reject) => {
    cos.putObject(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
        Body: stream,
        ContentType: mimeType,
        ContentLength: buffer.length,
      },
      (err) => {
        if (err) reject(err)
        else resolve()
      }
    )
  })

  return `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}`
}

export const cosService = { uploadBuffer }
