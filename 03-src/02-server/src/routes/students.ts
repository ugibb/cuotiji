import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Usr_Student } from '@prisma/client'
import prisma from '../utils/prisma'
import { ok, fail, JwtPayload } from '../types/index'
import { authenticate } from '../middleware/auth'

export async function studentRoutes(fastify: FastifyInstance) {
  // GET /api/students - list students for authenticated user
  fastify.get(
    '/students',
    { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload

        const students = await prisma.usr_Student.findMany({
          where: { userId: BigInt(payload.userId) },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
        })

        return reply.send(ok({
          students: students.map((s: Usr_Student) => ({
            id: Number(s.id),
            userId: Number(s.userId),
            name: s.name,
            grade: s.grade,
            avatar: s.avatar,
            isDefault: s.isDefault
          }))
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取学生列表失败'
        return reply.status(500).send(fail(message))
      }
    }
  )

  // POST /api/students - create student
  fastify.post<{
    Body: { name: string; grade: number; isDefault?: boolean }
  }>(
    '/students',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Body: { name: string; grade: number; isDefault?: boolean } }>, reply: FastifyReply) => {
      try {
        const payload = request.user as JwtPayload
        const { name, grade, isDefault = false } = request.body

        if (!name || !grade) {
          return reply.status(400).send(fail('姓名和年级不能为空'))
        }

        if (grade < 1 || grade > 6) {
          return reply.status(400).send(fail('年级必须在1-6之间'))
        }

        if (isDefault) {
          await prisma.usr_Student.updateMany({
            where: { userId: BigInt(payload.userId) },
            data: { isDefault: false }
          })
        }

        const student = await prisma.usr_Student.create({
          data: {
            userId: BigInt(payload.userId),
            name,
            grade,
            isDefault
          }
        })

        return reply.status(201).send(ok({
          id: Number(student.id),
          userId: Number(student.userId),
          name: student.name,
          grade: student.grade,
          isDefault: student.isDefault
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : '创建学生失败'
        return reply.status(500).send(fail(message))
      }
    }
  )
}
