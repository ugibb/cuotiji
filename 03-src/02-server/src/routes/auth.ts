import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import axios from 'axios'
import prisma from '../utils/prisma'
import { ok, fail } from '../types/index'

interface WxLoginBody {
  code: string
}

interface WxCodeResponse {
  openid?: string
  session_key?: string
  errcode?: number
  errmsg?: string
}

async function exchangeWxCode(code: string): Promise<string> {
  const appid = process.env.WX_APPID
  const secret = process.env.WX_SECRET

  // Mock mode: always return the fixed dev openid so seed data is accessible
  if (!appid || !secret || appid === 'your-wx-appid') {
    return 'mock_openid_test-wx-'
  }

  const url = `https://api.weixin.qq.com/sns/jscode2session`
  const res = await axios.get<WxCodeResponse>(url, {
    params: { appid, secret, js_code: code, grant_type: 'authorization_code' }
  })

  if (res.data.errcode || !res.data.openid) {
    throw new Error(res.data.errmsg || '微信登录失败')
  }

  return res.data.openid
}

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/login
  fastify.post<{ Body: WxLoginBody }>(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string' }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: WxLoginBody }>, reply: FastifyReply) => {
      try {
        const { code } = request.body

        if (!code) {
          return reply.status(400).send(fail('code 不能为空'))
        }

        // Exchange code for openid
        const openid = await exchangeWxCode(code)

        // Upsert user (find or create)
        const user = await prisma.usr_User.upsert({
          where: { openid },
          update: {},
          create: { openid, nickname: '家长' }
        })

        // Generate JWT
        const token = fastify.jwt.sign({
          userId: Number(user.id),
          openid: user.openid
        })

        // Get or create default student
        let student = await prisma.usr_Student.findFirst({
          where: { userId: user.id, isDefault: true }
        })

        if (!student) {
          student = await prisma.usr_Student.findFirst({
            where: { userId: user.id }
          })
        }

        return reply.send(ok({
          token,
          user: {
            id: Number(user.id),
            openid: user.openid,
            nickname: user.nickname,
            parentPhone: user.parentPhone
          },
          student: student ? {
            id: Number(student.id),
            name: student.name,
            grade: student.grade,
            isDefault: student.isDefault
          } : null
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '登录失败'
        return reply.status(500).send(fail(message))
      }
    }
  )
}
