import { createServer } from 'node:http'

import { Server } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import cors from 'cors'
import express from 'express'

import { listLobbies, lookupLobby, registryStats } from './lobbyRegistry'
import { StickFightRoom } from './rooms/StickFightRoom'

/**
 * Stick Fighter realtime server (F5R-B retry).
 *
 * Runs the deterministic sim core (`@stick/sim`) authoritatively for 2-player
 * co-op rooms. Clients connect over WebSocket, send compact input updates
 * (move vector + button presses), and receive Colyseus schema diffs of the
 * world state.
 *
 * **Stack (PINNED EXACT — see package.json comments):**
 *   - colyseus 0.15.57, @colyseus/schema 2.0.36, @colyseus/ws-transport 0.15.3
 *   - The 0.16 line + schema 3.x triggers the Symbol.metadata bug we hit
 *     last time. Don't bump majors without writing a smoke test for
 *     `broadcastPatch` first.
 *
 * Deployed alongside api on the same VPS, exposed via Traefik at
 * `wss://stick-fighter-realtime.neomac.io` (cert wildcard `*.neomac.io`).
 */

const PORT = Number(process.env.PORT ?? 2567)
const HOST = process.env.HOST ?? '0.0.0.0'

const ALLOWED_ORIGINS = (
  process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173,https://stick-fighter.neomac.io'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

async function main() {
  const app = express()

  // Colyseus matchmaking goes over plain HTTP (POST /matchmake/...) before
  // the WS handshake, so the browser enforces CORS on those calls.
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true)
        if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
        // Allow any *.vercel.app preview (kept for parity with api) — even
        // though the canonical frontend lives at stick-fighter.neomac.io now.
        try {
          const host = new URL(origin).host
          if (host.endsWith('.vercel.app')) return cb(null, true)
        } catch {
          // fall through
        }
        cb(new Error(`CORS rejected: ${origin}`), false)
      },
      credentials: true,
    }),
  )

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: process.env.API_VERSION ?? 'dev',
      uptimeSec: process.uptime(),
      activeLobbies: registryStats().active,
    })
  })

  /**
   * Lobby code lookup: resolves a 4-letter code to a roomId so the friend
   * can call `client.joinById(roomId)`. We use this instead of Colyseus's
   * `filterBy` because that didn't reliably match in our setup.
   */
  app.get('/lobby/:code', (req, res) => {
    const code = String(req.params.code ?? '').toUpperCase()
    if (!/^[A-Z2-9]{4}$/.test(code)) {
      return res.status(400).json({ error: 'invalid code format' })
    }
    const roomId = lookupLobby(code)
    if (!roomId) return res.status(404).json({ error: 'no room with that code' })
    return res.json({ roomId })
  })

  /** Debug — registry state + counters. */
  app.get('/debug/rooms', (_req, res) => {
    res.json({
      lobbies: listLobbies(),
      stats: registryStats(),
      uptimeSec: process.uptime(),
      pid: process.pid,
    })
  })

  const httpServer = createServer(app)
  const gameServer = new Server({
    transport: new WebSocketTransport({
      server: httpServer,
      // Colyseus pings every 3s by default; raise tolerance for mobile
      // backgrounding (Safari kills WS at ~30s). Combined with
      // `room.allowReconnection(120)` per StickFightRoom this gives 2 min
      // grace before we consider a client dropped.
      pingInterval: 6000,
      pingMaxRetries: 4,
    }),
  })

  gameServer.define('stick_fight', StickFightRoom)

  // Graceful shutdown for Docker SIGTERM.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      console.info(`[realtime] received ${signal}, gracefully closing…`)
      await gameServer.gracefullyShutdown(false)
      process.exit(0)
    })
  }

  await gameServer.listen(PORT, HOST)
  console.info(`[realtime] listening on ws://${HOST}:${PORT} (rooms: stick_fight)`)
}

main().catch((err) => {
  console.error('[realtime] fatal:', err)
  process.exit(1)
})
