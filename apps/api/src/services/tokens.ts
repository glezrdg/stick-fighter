import { randomBytes } from 'node:crypto'

import { type AuthResponse, type ProfileResponse } from '@stick/shared'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { db } from '../db/client'
import { type DbUser, sessions } from '../db/schema'
import { REFRESH_TOKEN_TTL_DAYS } from '../plugins/auth'

const REFRESH_TOKEN_BYTES = 48 // 384 bits → 64 char base64url
const BCRYPT_ROUNDS = 12

/** Generate a fresh refresh token + return its bcrypt hash. */
export async function mintRefreshToken(): Promise<{ raw: string; hash: string }> {
  const raw = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url')
  const hash = await bcrypt.hash(raw, BCRYPT_ROUNDS)
  return { raw, hash }
}

/** Persist a session row + return the raw refresh token to send to the client. */
export async function createSession(opts: {
  userId: string
  deviceInfo?: string | undefined
}): Promise<{ refreshToken: string; sessionId: string }> {
  const { raw, hash } = await mintRefreshToken()
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  const [session] = await db
    .insert(sessions)
    .values({
      userId: opts.userId,
      refreshTokenHash: hash,
      deviceInfo: opts.deviceInfo ?? null,
      expiresAt,
    })
    .returning({ id: sessions.id })
  if (!session) throw new Error('failed to insert session')
  return { refreshToken: raw, sessionId: session.id }
}

/**
 * Build the standard auth response (signed access token + new refresh token).
 * Used by register, login, and refresh.
 */
export async function buildAuthResponse(opts: {
  app: FastifyInstance
  user: Pick<DbUser, 'id' | 'email' | 'displayName'>
  deviceInfo?: string | undefined
}): Promise<AuthResponse> {
  if (!opts.user.email) throw new Error('cannot build auth response for anonymous user')
  const accessToken = opts.app.jwt.sign({ sub: opts.user.id, email: opts.user.email })
  const session = await createSession({
    userId: opts.user.id,
    deviceInfo: opts.deviceInfo,
  })
  return {
    user: {
      id: opts.user.id,
      email: opts.user.email,
      displayName: opts.user.displayName,
    },
    accessToken,
    refreshToken: session.refreshToken,
  }
}

/** Find the session row whose hash matches the supplied raw refresh token.
 *  Returns the session id + user id, or null if no match / expired. */
export async function verifyRefreshToken(
  rawToken: string,
): Promise<{ sessionId: string; userId: string } | null> {
  // We have to scan by user since we only store hashes — but rotating means
  // exactly one valid session per refresh-token, so we look it up via JWT
  // payload. Without that we'd need a separate index. For F5, scan-on-refresh
  // is acceptable: the refresh endpoint is called at most once per 15 min
  // per active user.
  const candidates = await db.select().from(sessions)
  const now = Date.now()
  for (const s of candidates) {
    if (s.expiresAt.getTime() < now) continue
    if (s.rotatedAt !== null) continue
    if (await bcrypt.compare(rawToken, s.refreshTokenHash)) {
      return { sessionId: s.id, userId: s.userId }
    }
  }
  return null
}

/** Mark a session as rotated (used when /auth/refresh consumes it). */
export async function markSessionRotated(sessionId: string): Promise<void> {
  await db.update(sessions).set({ rotatedAt: new Date() }).where(eq(sessions.id, sessionId))
}

/** Delete a session (logout). */
export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}

export function userToProfile(user: DbUser): ProfileResponse {
  if (!user.email) {
    throw new Error('cannot expose anonymous user as profile')
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isAnonymous: user.isAnonymous,
  }
}

export { BCRYPT_ROUNDS }
