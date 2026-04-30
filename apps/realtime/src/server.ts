import { createServer } from 'node:http'

import { Server, matchMaker } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import cors from 'cors'
import express from 'express'

import { StickFightRoom } from './rooms/StickFightRoom'

/**
 * Stick Fighter realtime server.
 *
 * Runs the deterministic sim core (`@stick/sim`) authoritatively for 2-player
 * co-op rooms. Clients connect over WebSocket, send compact input updates
 * (move vector + button presses), and receive Colyseus schema diffs of the
 * full world state.
 *
 * Deployed alongside the REST API on the same VPS (`docker-compose.prod.yml`),
 * exposed via Traefik at `wss://stick-fighter-realtime.neomac.io`.
 */

const PORT = Number(process.env.PORT ?? 2567)
const HOST = process.env.HOST ?? '0.0.0.0'

const ALLOWED_ORIGINS = (
  process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173,https://stick-fighter.vercel.app'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

async function main() {
  const app = express()

  // Colyseus matchmaking goes over plain HTTP (POST /matchmake/...) before the
  // WS handshake, so the browser enforces CORS on those calls. Without this,
  // `client.create('stick_fight')` from Vercel fails with "blocked by CORS".
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true)
        if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
        // Allow any *.vercel.app preview to ease testing of branch deploys.
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
    })
  })

  /**
   * Lobby code lookup: resolves a 4-letter code to a roomId so the friend
   * can call `client.joinById(roomId)`. We use this instead of Colyseus's
   * `filterBy` because that didn't reliably match in 0.16 with options.
   */
  app.get('/lobby/:code', async (req, res) => {
    const code = String(req.params.code ?? '').toUpperCase()
    if (!/^[A-Z2-9]{4}$/.test(code)) {
      return res.status(400).json({ error: 'invalid code format' })
    }
    try {
      const rooms = await matchMaker.query({ name: 'stick_fight' })
      console.info(
        `[realtime] /lobby/${code} — query returned ${rooms.length} rooms:`,
        rooms.map((r) => ({ roomId: r.roomId, metadata: r.metadata, clients: r.clients })),
      )
      const match = rooms.find(
        (r) => (r.metadata as { lobbyCode?: string } | null | undefined)?.lobbyCode === code,
      )
      if (!match) return res.status(404).json({ error: 'no room with that code' })
      return res.json({ roomId: match.roomId, locked: match.locked, clients: match.clients })
    } catch (err) {
      console.error('[realtime] /lobby lookup failed:', err)
      return res.status(500).json({ error: 'internal error' })
    }
  })

  /** Debug — list all rooms (used to diagnose lobby lookup issues). */
  app.get('/debug/rooms', async (_req, res) => {
    try {
      const rooms = await matchMaker.query({})
      return res.json({
        count: rooms.length,
        rooms: rooms.map((r) => ({
          roomId: r.roomId,
          name: r.name,
          clients: r.clients,
          locked: r.locked,
          metadata: r.metadata,
        })),
      })
    } catch (err) {
      return res.status(500).json({ error: String(err) })
    }
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
