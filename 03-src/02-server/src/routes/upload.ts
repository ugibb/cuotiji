import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { ok, fail } from '../types/index'
import { authenticate } from '../middleware/auth'
import { storageService } from '../services/storage.service'

interface PresignBody {
  filename: string
}

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
}
