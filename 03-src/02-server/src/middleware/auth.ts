import { FastifyRequest, FastifyReply } from 'fastify'

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({ success: false, data: null, error: '未授权，请重新登录' })
  }
}
