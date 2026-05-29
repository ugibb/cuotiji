import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Knl_Chapter } from '@prisma/client'
import prisma from '../utils/prisma'
import { ok, fail } from '../types/index'
import { authenticate } from '../middleware/auth'

export async function chapterRoutes(fastify: FastifyInstance) {
  // GET /api/chapters - list all active chapters
  fastify.get(
    '/chapters',
    { preHandler: authenticate },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const chapters = await prisma.knl_Chapter.findMany({
          where: { isActive: true },
          orderBy: [{ grade: 'asc' }, { sortOrder: 'asc' }]
        })

        return reply.send(ok({
          chapters: chapters.map((c: Knl_Chapter) => ({
            id: c.id,
            code: c.code,
            name: c.name,
            subtitle: c.subtitle,
            grade: c.grade,
            sortOrder: c.sortOrder
          }))
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取章节列表失败'
        return reply.status(500).send(fail(message))
      }
    }
  )
}
