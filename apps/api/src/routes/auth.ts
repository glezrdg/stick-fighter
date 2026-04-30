import { LoginRequestSchema, RefreshRequestSchema, RegisterRequestSchema } from '@stick/shared'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'

import { db } from '../db/client'
import { users } from '../db/schema'
import {
  BCRYPT_ROUNDS,
  buildAuthResponse,
  deleteSession,
  markSessionRotated,
  userToProfile,
  verifyRefreshToken,
} from '../services/tokens'

/**
 * Auth routes. Email is the login id; passwords are bcrypt-hashed (cost 12).
 *
 * Refresh-token rotation: each successful `/auth/refresh` invalidates the
 * presented token (sets `rotated_at`) and issues a fresh one. Replaying a
 * rotated token is treated as a token leak: in F5+ we'll also kill all
 * other sessions for that user. For now we just reject the replay.
 */
export const authRoutes: FastifyPluginAsync = async (app) => {
  // ---------- POST /auth/register ----------
  app.post('/auth/register', async (request, reply) => {
    const parsed = RegisterRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid payload', details: parsed.error.issues })
    }
    const { email, password, displayName } = parsed.data
    const normalizedEmail = email.toLowerCase()

    const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1)
    if (existing.length > 0) {
      return reply.code(409).send({ error: 'email already registered' })
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const [user] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        passwordHash,
        displayName,
        isAnonymous: false,
      })
      .returning()
    if (!user) return reply.code(500).send({ error: 'failed to create user' })

    const auth = await buildAuthResponse({
      app,
      user,
      deviceInfo: request.headers['user-agent'],
    })
    return reply.code(201).send(auth)
  })

  // ---------- POST /auth/login ----------
  app.post('/auth/login', async (request, reply) => {
    const parsed = LoginRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid payload' })
    }
    const { email, password } = parsed.data
    const normalizedEmail = email.toLowerCase()

    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1)
    if (!user || !user.passwordHash) {
      // Constant-time path: still hash a dummy password to avoid timing leaks.
      await bcrypt.compare(password, '$2a$12$invalidsaltinvalidsaltinval.lockoutLockoutLockoutLock')
      return reply.code(401).send({ error: 'invalid credentials' })
    }
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return reply.code(401).send({ error: 'invalid credentials' })

    const auth = await buildAuthResponse({
      app,
      user,
      deviceInfo: request.headers['user-agent'],
    })
    return reply.send(auth)
  })

  // ---------- POST /auth/refresh ----------
  app.post('/auth/refresh', async (request, reply) => {
    const parsed = RefreshRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid payload' })
    }

    const session = await verifyRefreshToken(parsed.data.refreshToken)
    if (!session) return reply.code(401).send({ error: 'invalid refresh token' })

    // Rotate: mark old session rotated, mint a new pair.
    await markSessionRotated(session.sessionId)

    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1)
    if (!user || !user.email) return reply.code(401).send({ error: 'user no longer exists' })

    const auth = await buildAuthResponse({
      app,
      user,
      deviceInfo: request.headers['user-agent'],
    })
    return reply.send(auth)
  })

  // ---------- POST /auth/logout ----------
  app.post('/auth/logout', async (request, reply) => {
    const parsed = RefreshRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      // Logout is idempotent — still return 204 so the client can clear state.
      return reply.code(204).send()
    }
    const session = await verifyRefreshToken(parsed.data.refreshToken)
    if (session) await deleteSession(session.sessionId)
    return reply.code(204).send()
  })

  // ---------- GET /auth/me ----------
  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const sub = request.user?.sub
    if (!sub) return reply.code(401).send({ error: 'unauthorized' })
    const [user] = await db.select().from(users).where(eq(users.id, sub)).limit(1)
    if (!user || !user.email) return reply.code(404).send({ error: 'user not found' })
    return userToProfile(user)
  })
}
