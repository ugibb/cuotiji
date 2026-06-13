import fs from 'fs'
import path from 'path'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { ok, fail } from '../types/index'
import { authenticate } from '../middleware/auth'
import { storageService } from '../services/storage.service'

interface PresignBody {
  filename: string
}

const UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || './uploads'

export async function uploadRoutes(fastify: FastifyInstance) {
  // POST /api/upload/presign - get upload presigned URL
  fastify.post<{ Body: PresignBody }>(
    '/upload/presign',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Body: PresignBody }>, reply: FastifyReply) => {
      try {
        const { filename } = request.body

        if (!filename) {
          return reply.status(400).send(fail('文件名不能为空'))
        }

        const result = await storageService.getPresignedUrl(filename)

        return reply.send(ok({
          uploadUrl: result.uploadUrl,
          fileUrl: result.fileUrl
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取上传地址失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  // POST /api/upload/local/:filename - wx.uploadFile 实际接收端点
  fastify.post<{ Params: { filename: string } }>(
    '/upload/local/:filename',
    async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
      try {
        const { filename } = request.params
        if (!filename || filename.includes('/') || filename.includes('..')) {
          return reply.status(400).send(fail('无效文件名'))
        }

        const data = await request.file()
        if (!data) return reply.status(400).send(fail('未收到文件'))

        const buffer = await data.toBuffer()
        if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
        fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)

        return reply.send({ success: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : '文件保存失败'
        return reply.status(500).send(fail(message))
      }
    }
  )
}
