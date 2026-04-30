import { z } from 'zod'

/**
 * Auth payloads — shared between Fastify (request validation) and the game
 * client (response parsing). Player nicknames follow the same charset as
 * `RunReportSchema.playerName` for consistency on the leaderboard.
 */

const NameRegex = /^[\p{L}\p{N} _-]+$/u
const PasswordSchema = z.string().min(8).max(72) // bcrypt 72-byte hard limit

export const RegisterRequestSchema = z.object({
  email: z.string().email().max(120),
  password: PasswordSchema,
  /** Display name for the leaderboard. Trimmed; 2-20 chars; alphanumerics+space+_-. */
  displayName: z.string().trim().min(2).max(20).regex(NameRegex, 'invalid characters'),
})
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>

export const LoginRequestSchema = z.object({
  email: z.string().email().max(120),
  password: PasswordSchema,
})
export type LoginRequest = z.infer<typeof LoginRequestSchema>

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1).max(512),
})
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>

/** What the server returns on register / login / refresh. */
export const AuthResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string(),
  }),
  /** Short-lived JWT (15 min) — sent in the `Authorization: Bearer` header. */
  accessToken: z.string(),
  /** Long-lived (30 days). Rotated on every refresh. */
  refreshToken: z.string(),
})
export type AuthResponse = z.infer<typeof AuthResponseSchema>

/** Lightweight profile fetched by `GET /auth/me`. */
export const ProfileResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  isAnonymous: z.boolean(),
})
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>
