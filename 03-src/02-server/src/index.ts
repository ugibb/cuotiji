import 'dotenv/config'
import http from 'node:http'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'

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
    // 移除所有 upgrade 监听器（包括 @fastify/websocket 注册的）
    fastify.server.removeAllListeners('upgrade')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wsServer = (fastify as any).websocketServer as import('ws').WebSocketServer | undefined

    fastify.server.on('upgrade', (req: http.IncomingMessage, socket: import('node:net').Socket, head: Buffer) => {
      const isRealWs =
        req.headers.upgrade?.toLowerCase() === 'websocket' &&
        !!req.headers['sec-websocket-key']

      if (isRealWs && wsServer) {
        wsServer.handleUpgrade(req, socket, head, (ws) => {
          wsServer.emit('connection', ws, req)
        })
        return
      }

      // WeChat DevTools 假升级：删除 Upgrade 头后重新走 HTTP 管道
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

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

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
