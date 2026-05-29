import { FastifyInstance } from 'fastify'
import type { WebSocket } from '@fastify/websocket'

// assignmentId -> Set of active WebSocket connections
const subscribers = new Map<number, Set<WebSocket>>()

/**
 * Broadcast a progress event to all clients subscribed to the given assignmentId.
 * Called by processAssignment at each pipeline stage.
 */
export function broadcastProgress(
  assignmentId: number,
  status: string,
  progress: number,
  detail: string
): void {
  const clients = subscribers.get(assignmentId)
  if (!clients || clients.size === 0) return

  const payload = JSON.stringify({ type: 'progress', status, progress, detail })
  for (const ws of clients) {
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload)
      }
    } catch {
      // ignore individual send errors
    }
  }
}

/**
 * Register GET /api/ws/assignment/:id
 *
 * Auth: Bearer token passed as ?token=<jwt> query param (WS cannot set headers in wx.connectSocket).
 * On connection the client receives live progress updates until the assignment reaches
 * 'graded' / 'reviewed', at which point the server closes the socket.
 */
export async function wsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    '/ws/assignment/:id',
    { websocket: true },
    (socket: WebSocket, request) => {
      const assignmentId = Number(request.params.id)

      // Verify token via JWT (query param because WS headers can't be set in wx.connectSocket)
      const token = request.query?.token
      if (!token) {
        socket.send(JSON.stringify({ type: 'error', message: '未提供 token' }))
        socket.close(4001, 'Unauthorized')
        return
      }

      try {
        fastify.jwt.verify(token)
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'token 无效' }))
        socket.close(4001, 'Unauthorized')
        return
      }

      if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
        socket.send(JSON.stringify({ type: 'error', message: 'assignmentId 无效' }))
        socket.close(4000, 'Bad Request')
        return
      }

      // Register subscriber
      if (!subscribers.has(assignmentId)) {
        subscribers.set(assignmentId, new Set())
      }
      subscribers.get(assignmentId)!.add(socket)

      // Send immediate ack
      socket.send(JSON.stringify({ type: 'connected', assignmentId }))

      // Cleanup on disconnect
      socket.on('close', () => {
        const set = subscribers.get(assignmentId)
        if (set) {
          set.delete(socket)
          if (set.size === 0) {
            subscribers.delete(assignmentId)
          }
        }
      })

      socket.on('error', () => {
        const set = subscribers.get(assignmentId)
        if (set) set.delete(socket)
      })
    }
  )
}
