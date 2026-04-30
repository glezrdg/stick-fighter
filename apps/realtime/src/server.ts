import { createServer } from 'node:http'

import { Server } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
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

async function main() {
  const app = express()

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: process.env.API_VERSION ?? 'dev',
      uptimeSec: process.uptime(),
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

  // `filterBy` tells the Colyseus matchmaker to match rooms by their
  // `lobbyCode` metadata when a client calls `.join('stick_fight', { lobbyCode })`.
  // The host's `.create('stick_fight')` ignores this filter (no code passed),
  // and the room's `onCreate` populates the metadata with a generated code.
  gameServer.define('stick_fight', StickFightRoom).filterBy(['lobbyCode'])

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
