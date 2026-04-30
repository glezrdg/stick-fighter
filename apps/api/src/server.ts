import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'

import { authPlugin } from './plugins/auth'
import { authRoutes } from './routes/auth'
import { healthRoutes } from './routes/health'
import { leaderboardRoutes } from './routes/leaderboard'
import { runRoutes } from './routes/runs'

/**
 * Stick Fighter API — Fastify server (F4).
 *
 * Behind Traefik on the personal VPS, exposed at api.stick-fighter.neomac.io.
 * Endpoints accept anonymous submissions for now; auth lands in F5.
 */

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'
const ALLOWED_ORIGINS = (
  process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173,https://stick-fighter.vercel.app'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

async function buildServer() {
  const isProd = process.env.NODE_ENV === 'production'
  const app = Fastify({
    logger: isProd ? true : { transport: { target: 'pino-pretty', options: { colorize: true } } },
    trustProxy: true,
  })

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true) // curl / server-side
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
      cb(new Error('CORS rejected'), false)
    },
    credentials: true,
  })
  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
  })

  await app.register(authPlugin)

  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(leaderboardRoutes)
  await app.register(runRoutes)

  return app
}

async function main() {
  const app = await buildServer()
  try {
    await app.listen({ port: PORT, host: HOST })
    app.log.info(`api listening on http://${HOST}:${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  // Graceful shutdown for Docker SIGTERM.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      app.log.info(`received ${signal}, closing…`)
      await app.close()
      process.exit(0)
    })
  }
}

main().catch((err) => {
  console.error('[api] fatal:', err)
  process.exit(1)
})
