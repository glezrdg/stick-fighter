import jwtPlugin from '@fastify/jwt'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

/**
 * JWT plugin + auth decorators.
 *
 * - `app.authenticate` — required-auth route guard (401 if no/invalid token)
 * - `app.optionalAuthenticate` — best-effort guard (sets `request.user` when
 *   a valid token is present, leaves it undefined otherwise; never rejects).
 *
 * Access tokens are short-lived (15 min). Refresh tokens are stored in the
 * `sessions` table (bcrypt hashed) and used by `/auth/refresh` to mint new
 * access+refresh pairs with rotation.
 */

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    optionalAuthenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string }
    user: AuthUser
  }
}

export interface AuthUser {
  sub: string // user id (uuid)
  email: string
}

export const ACCESS_TOKEN_TTL = '15m'
export const REFRESH_TOKEN_TTL_DAYS = 30

const authPluginImpl: FastifyPluginAsync = async (app) => {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET env var must be set and ≥ 32 chars')
  }

  await app.register(jwtPlugin, {
    secret,
    sign: { expiresIn: ACCESS_TOKEN_TTL },
  })

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
    } catch {
      return reply.code(401).send({ error: 'unauthorized' })
    }
  })

  app.decorate('optionalAuthenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify()
    } catch {
      // Leave `req.user` undefined — anonymous flow.
    }
  })
}

export const authPlugin = fp(authPluginImpl, {
  name: 'auth',
})
