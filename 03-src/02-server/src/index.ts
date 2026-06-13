import 'dotenv/config'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'
import multipart from '@fastify/multipart'
import staticPlugin from '@fastify/static'

import { authRoutes } from './routes/auth'
import { studentRoutes } from './routes/students'
import { calendarRoutes } from './routes/calendar'
import { chapterRoutes } from './routes/chapters'
import { assignmentRoutes } from './routes/assignments'
import { uploadRoutes } from './routes/upload'
import { analyticsRoutes } from './routes/analytics'
import { reviewRoutes } from './routes/review'
import { wsRoutes } from './routes/ws'
import { sprintRoutes } from './routes/sprint'
import { intakeRoutes } from './routes/intake'
import { trainingPlanRoutes } from './routes/training-plans'
import { sttRoutes } from './routes/stt'

export function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info'
    }
  })

  // WeChat DevTools v2.x 在普通 HTTP 请求里附带 Connection: Upgrade 头，
  // Node.js 会把它路由到 'upgrade' 事件而不是 'request' 事件，导致 426。
  // 需要在所有插件（含 @fastify/websocket）就绪后统一接管 upgrade 事件：
  // - 真 WebSocket 握手（含 Sec-WebSocket-Key）→ 交给 ws.Server
  // - 其他（WeChat 假升级）→ 删除 Upgrade 头后重新派发到 Fastify HTTP 链路
  fastify.addHook('onReady', async () => {
    // @fastify/websocket 已在 fastify.server 上注册了 upgrade 处理器（含路由匹配逻辑）
    // 保留它，只额外拦截 WeChat DevTools 发出的「假升级」请求（无 Sec-WebSocket-Key）
    // 真实 WebSocket 握手直接放行给已有的 @fastify/websocket 处理器，保证路由正常工作
    const realWsListeners = fastify.server.listeners('upgrade').slice()
    fastify.server.removeAllListeners('upgrade')

    fastify.server.on('upgrade', (req: http.IncomingMessage, socket: import('node:net').Socket, head: Buffer) => {
      const isRealWs =
        req.headers.upgrade?.toLowerCase() === 'websocket' &&
        !!req.headers['sec-websocket-key']

      if (isRealWs) {
        // 真 WebSocket 握手 → 交回给 @fastify/websocket 的原始处理器（含路由匹配）
        for (const listener of realWsListeners) {
          (listener as Function)(req, socket, head)
        }
        return
      }

      // WeChat DevTools 假升级（无 Key）→ 删 Upgrade 头后重新走 HTTP 管道
      delete (req.headers as Record<string, unknown>).upgrade
      req.headers.connection = 'close'
      const res = new http.ServerResponse(req)
      res.assignSocket(socket)
      if (head?.length > 0) req.push(head)
      fastify.server.emit('request', req, res)
    })
  })

  // Plugins
  fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  })

  fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production'
  })

  fastify.register(websocket)
  fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }) // 10MB

  // 本地开发：静态服务 /uploads 目录
  const uploadDir = path.resolve(process.env.LOCAL_UPLOAD_DIR || './uploads')
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
  fastify.register(staticPlugin, { root: uploadDir, prefix: '/uploads/' })

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // 静默处理 DevTools 自动请求的 favicon
  fastify.get('/favicon.ico', async (_req, reply) => { reply.status(204).send() })

  // API routes with /api prefix
  fastify.register(async (api) => {
    api.register(authRoutes)
    api.register(studentRoutes)
    api.register(calendarRoutes)
    api.register(chapterRoutes)
    api.register(assignmentRoutes)
    api.register(uploadRoutes)
    api.register(analyticsRoutes)
    api.register(reviewRoutes)
    api.register(sprintRoutes)
    api.register(intakeRoutes, { prefix: '/intake' })
    api.register(trainingPlanRoutes)
    api.register(sttRoutes)
    api.register(wsRoutes)
  }, { prefix: '/api' })

  // Error handler
  fastify.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const statusCode = error.statusCode || 500
    reply.status(statusCode).send({
      success: false,
      data: null,
      error: error.message || '服务器内部错误'
    })
  })

  return fastify
}

async function start() {
  const app = buildApp()
  const port = parseInt(process.env.PORT || '3001', 10)

  try {
    await app.listen({ port, host: '0.0.0.0' })
    console.log(`Server running on http://localhost:${port}`)
  } catch (err: unknown) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

// Only start if this file is run directly (not imported in tests)
if (require.main === module) {
  start()
}

export default buildApp
