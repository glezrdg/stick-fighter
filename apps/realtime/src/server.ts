import { createServer } from 'node:http'

import {
  HostReqSchema,
  JoinReqSchema,
  RejoinReqSchema,
  type ClientMsg,
  type ErrorMsg,
  parseMsg,
  encodeMsg,
} from '@stick/shared'
import cors from 'cors'
import express from 'express'
import jwt from 'jsonwebtoken'
import { WebSocketServer, type WebSocket } from 'ws'

import { createRoom, findRoom, listRooms, registryStats, shutdownAll } from './registry'
import type { StickFightRoom, RoomClient } from './rooms/StickFightRoom'

/**
 * Stick Fighter realtime server (F5R'-B — pivot to raw WS + JSON).
 *
 * After two Colyseus attempts hit codec bugs, this server speaks plain JSON
 * over `ws@8`. The wire is human-readable in DevTools, every message is a
 * discrete object the type-checker can reason about, and there's no binary
 * encoder to debug.
 *
 * Architecture:
 *   - Express handles HTTP: /health, /lobby/:code, /debug/rooms.
 *   - One WebSocketServer at `/ws` shared by both host and join flows.
 *   - First message from a client must be `host` or `join` (handshake).
 *   - After handshake, the server attaches the WS to a Room; further
 *     messages route to `room.handleMessage(client, msg)`.
 *
 * Behind Traefik on the personal VPS — same pattern as apps/api and apps/game.
 * Subdomain: wss://stick-fighter-realtime.neomac.io
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

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true)
        if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
        try {
          const host = new URL(origin).host
          if (host.endsWith('.vercel.app')) return cb(null, true)
        } catch {
          // fall through
        }
        cb(new Error(`CORS rejected: ${origin}`), false)
      },
    }),
  )

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: process.env.API_VERSION ?? 'dev',
      uptimeSec: process.uptime(),
      ...registryStats(),
    })
  })

  app.get('/lobby/:code', (req, res) => {
    const code = String(req.params.code ?? '').toUpperCase()
    if (!/^[A-Z2-9]{4}$/.test(code)) {
      return res.status(400).json({ error: 'invalid code format' })
    }
    const room = findRoom(code)
    if (!room) return res.status(404).json({ error: 'no room with that code' })
    return res.json({ exists: true, full: room.isFull(), locked: room.isLocked() })
  })

  app.get('/debug/rooms', (_req, res) => {
    res.json({ ...registryStats(), rooms: listRooms() })
  })

  const httpServer = createServer(app)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  // Map ws → (room, client). When a connection upgrades we don't yet know
  // which room it belongs to; the first message is the handshake (host/join)
  // and only then we register it. Until then the entry is null.
  const sockets = new WeakMap<WebSocket, { room: StickFightRoom; client: RoomClient } | null>()

  wss.on('connection', (ws, req) => {
    sockets.set(ws, null)
    console.info(`[ws] connection from ${req.socket.remoteAddress}`)

    ws.on('message', (raw) => {
      const text = typeof raw === 'string' ? raw : raw.toString('utf-8')
      const msg = parseMsg<ClientMsg>(text)
      if (!msg) {
        sendError(ws, 'invalid-message', 'malformed JSON or missing `t`')
        return
      }

      const ctx = sockets.get(ws)
      // Handshake path — the first 'host' or 'join' upgrades this socket
      // into a registered client.
      if (!ctx) {
        if (msg.t === 'host') {
          const parsed = HostReqSchema.safeParse(msg)
          if (!parsed.success) {
            sendError(ws, 'invalid-message', `bad host payload: ${parsed.error.message}`)
            return
          }
          if (!authIfPresent(parsed.data.accessToken, ws)) return
          const room = createRoom()
          const client = room.addClient(
            ws,
            parsed.data.name,
            parsed.data.cosmetics,
            parsed.data.loadout,
          )
          sockets.set(ws, { room, client })
          return
        }
        if (msg.t === 'join') {
          const parsed = JoinReqSchema.safeParse(msg)
          if (!parsed.success) {
            sendError(ws, 'invalid-message', `bad join payload: ${parsed.error.message}`)
            return
          }
          if (!authIfPresent(parsed.data.accessToken, ws)) return
          const room = findRoom(parsed.data.code)
          if (!room) {
            sendError(ws, 'invalid-code', `no room with code ${parsed.data.code}`)
            return
          }
          if (room.isLocked()) {
            sendError(ws, 'lobby-locked', 'lobby already started a run')
            return
          }
          if (room.isFull()) {
            sendError(ws, 'lobby-full', 'lobby has 2 players already')
            return
          }
          const client = room.addClient(
            ws,
            parsed.data.name,
            parsed.data.cosmetics,
            parsed.data.loadout,
          )
          sockets.set(ws, { room, client })
          return
        }
        if (msg.t === 'rejoin') {
          // Reconexión a una sala existente: el cliente conserva su sessionId
          // en memoria entre sockets (mobile background, refresh accidental).
          const parsed = RejoinReqSchema.safeParse(msg)
          if (!parsed.success) {
            sendError(ws, 'invalid-message', `bad rejoin payload: ${parsed.error.message}`)
            return
          }
          if (!authIfPresent(parsed.data.accessToken, ws)) return
          const room = findRoom(parsed.data.code)
          if (!room) {
            sendError(ws, 'rejoin-failed', `no room with code ${parsed.data.code}`)
            return
          }
          const client = room.rejoinClient(ws, parsed.data.sessionId)
          if (!client) {
            sendError(ws, 'rejoin-failed', 'session expired or already connected')
            return
          }
          sockets.set(ws, { room, client })
          return
        }
        // Anything else before handshake is invalid.
        sendError(ws, 'invalid-message', 'first message must be `host`/`join`/`rejoin`')
        return
      }

      // Post-handshake: route to the room.
      ctx.room.handleMessage(ctx.client, msg)
    })

    ws.on('close', (code, reason) => {
      const ctx = sockets.get(ws)
      if (ctx) {
        console.info(
          `[ws] close room=${ctx.room.code} session=${ctx.client.sessionId} code=${code} reason="${reason}"`,
        )
        ctx.room.handleSocketClose(ctx.client)
      } else {
        console.info(`[ws] close (pre-handshake) code=${code}`)
      }
      sockets.delete(ws)
    })

    ws.on('error', (err) => {
      console.error('[ws] socket error:', err.message)
    })
  })

  // Graceful shutdown.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.info(`[realtime] received ${signal}, gracefully closing…`)
      shutdownAll()
      wss.close(() => {
        httpServer.close(() => process.exit(0))
      })
      // Hard-stop after 5s if something hangs.
      setTimeout(() => process.exit(1), 5000).unref()
    })
  }

  httpServer.listen(PORT, HOST, () => {
    console.info(`[realtime] listening on http://${HOST}:${PORT} (ws path: /ws)`)
  })
}

function sendError(ws: WebSocket, code: ErrorMsg['code'], msg: string): void {
  if (ws.readyState !== ws.OPEN) return
  try {
    ws.send(encodeMsg({ t: 'error', code, msg } satisfies ErrorMsg))
  } catch {
    // ignore
  }
}

/**
 * Best-effort JWT validation. Returns `false` (and sends an error + closes
 * the socket) if a token was provided and is invalid. Returns `true` if no
 * token was provided OR the token is valid (anonymous play is allowed).
 */
function authIfPresent(accessToken: string | undefined, ws: WebSocket): boolean {
  if (!accessToken) return true
  const secret = process.env.JWT_SECRET
  if (!secret) {
    sendError(ws, 'auth-failed', 'JWT_SECRET not configured on server')
    ws.close(1008, 'auth-failed')
    return false
  }
  try {
    jwt.verify(accessToken, secret)
    return true
  } catch {
    sendError(ws, 'auth-failed', 'invalid or expired token')
    ws.close(1008, 'auth-failed')
    return false
  }
}

main().catch((err) => {
  console.error('[realtime] fatal:', err)
  process.exit(1)
})
