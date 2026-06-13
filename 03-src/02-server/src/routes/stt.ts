import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../middleware/auth'
import { ok, fail } from '../types/index'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tencentcloud = require('tencentcloud-sdk-nodejs-asr')

const AsrClient = tencentcloud.asr.v20190614.Client

function getAsrClient() {
  return new AsrClient({
    credential: {
      secretId:  process.env.TENCENT_SECRET_ID  || '',
      secretKey: process.env.TENCENT_SECRET_KEY || '',
    },
    region: 'ap-guangzhou',
    profile: {
      httpProfile: { endpoint: 'asr.tencentcloudapi.com', reqTimeout: 60 },
    },
  })
}

export async function sttRoutes(fastify: FastifyInstance) {
  // POST /stt  multipart/form-data  field: audio (mp3 file)
  fastify.post(
    '/stt',
    { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = await request.file()
      if (!data) return reply.status(400).send(fail('未收到音频文件'))

      const buffer = await data.toBuffer()
      if (buffer.length === 0) return reply.status(400).send(fail('音频文件为空'))

      const secretId  = process.env.TENCENT_SECRET_ID
      const secretKey = process.env.TENCENT_SECRET_KEY
      if (!secretId || !secretKey) {
        return reply.status(500).send(fail('STT 服务未配置，请检查环境变量'))
      }

      try {
        const client = getAsrClient()
        const result = await client.SentenceRecognition({
          ProjectId:      0,
          SubServiceType: 2,
          EngSerViceType: '16k_zh',
          SourceType:     1,
          VoiceFormat:    'mp3',
          Data:           buffer.toString('base64'),
          DataLen:        buffer.length,
        })

        return reply.send(ok({ text: result.Result || '' }))
      } catch (err: unknown) {
        fastify.log.error({ err }, 'STT recognition failed')
        const isTimeout = err instanceof Error && err.message.includes('network timeout')
        const message = isTimeout ? '识别超时，请录短一点再试' : '语音识别失败，请重试'
        return reply.status(500).send(fail(message))
      }
    }
  )
}
