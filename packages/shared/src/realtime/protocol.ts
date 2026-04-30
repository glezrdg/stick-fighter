/**
 * Realtime WebSocket protocol — plain JSON over WS@8.
 *
 * Pivoted away from Colyseus after two F5 attempts hit codec bugs (Symbol.metadata
 * in 0.16/schema 3, then `bytes is not iterable` in 0.15/schema 2). With raw WS +
 * JSON the wire is human-readable in DevTools (Network → WS → Frames), every
 * message is a discrete object the type-checker can reason about, and there's
 * zero binary-encoder magic to debug.
 *
 * Design rules:
 *   - Discriminated union by `t` (one-letter `type`) on every message.
 *   - Server is authoritative for state; client only sends inputs/intents.
 *   - State broadcast is full snapshot (every tick, ~30 Hz). 2P co-op + ~20
 *     enemies = ~3-5 KB/tick = ~150 KB/s/client. Acceptable. Delta-encoding
 *     can come later if it ever matters.
 *   - No Zod at the hot-path: parsing 30 messages/sec/client through Zod is
 *     wasteful. We parse with `JSON.parse` and trust the type, then validate
 *     **only the joining handshake** (`hostReq` / `joinReq`) where it's worth.
 */

import { z } from 'zod'

// ============================================================================
// Client → Server
// ============================================================================

/** Open a brand-new room. Server picks a fresh 4-letter lobby code. */
export const HostReqSchema = z.object({
  t: z.literal('host'),
  /** Display name for the leaderboard / HUD. 1..20 chars. */
  name: z.string().trim().min(1).max(20),
  /** Optional JWT from `/auth/login`. If valid, room caches `userId`. */
  accessToken: z.string().optional(),
})
export type HostReq = z.infer<typeof HostReqSchema>

/** Join an existing room by 4-letter code. */
export const JoinReqSchema = z.object({
  t: z.literal('join'),
  code: z.string().regex(/^[A-Z2-9]{4}$/, '4-letter code'),
  name: z.string().trim().min(1).max(20),
  accessToken: z.string().optional(),
})
export type JoinReq = z.infer<typeof JoinReqSchema>

/** Flip "ready". When all players in the room are ready, server starts the run. */
export interface ReadyReq {
  t: 'ready'
}

/**
 * Per-tick input. Continuous fields (movement vector + pressed flags). The
 * server samples the latest received input each tick — extra emissions get
 * coalesced, missing ones get re-applied. Cliente debe emitir cada cambio.
 */
export interface InputReq {
  t: 'input'
  /** Movement x in [-1, 1]. */
  dx: number
  /** Movement y in [-1, 1]. */
  dy: number
  /** Edge flag: client sets true ONCE the frame the user pressed attack.
   *  Server consumes it (one-shot — does NOT re-fire on subsequent tick). */
  attack?: boolean
  shoot?: boolean
  /** Skill slot to cast (0 or 1), one-shot. */
  skill?: 0 | 1
}

/** Voluntary disconnect — frees the slot immediately, no reconnect grace. */
export interface LeaveReq {
  t: 'leave'
}

export type ClientMsg = HostReq | JoinReq | ReadyReq | InputReq | LeaveReq

// ============================================================================
// Server → Client
// ============================================================================

/** Sent right after host/join succeeds. Identifies the client's slot + code. */
export interface LobbyMsg {
  t: 'lobby'
  /** 4-letter code the host (and friends) can see/share. */
  code: string
  /** Server-assigned id for this connection. Stable for the room's lifetime. */
  sessionId: string
  /** 0 = host, 1 = friend. */
  slot: 0 | 1
  /** Snapshot of all players in the lobby right now (incl. self). */
  players: ReadonlyArray<{ sessionId: string; name: string; slot: 0 | 1; ready: boolean }>
}

/** Phase changed (lobby → playing → gameover). */
export interface PhaseMsg {
  t: 'phase'
  phase: 'lobby' | 'playing' | 'gameover'
  /** When entering 'playing', the server sends the deterministic seed so
   *  clients can reproduce non-essential RNG-driven cosmetics if they want.
   *  When 'gameover', null. */
  seed: number | null
}

/** Full state snapshot. Sent every server tick (~30 Hz) while phase='playing'.
 *  Only carries renderable fields — anything not on this struct is owned
 *  exclusively by the server (combat resolution, damage, etc.). */
export interface StateMsg {
  t: 'state'
  /** Server tick number (monotonic, for client-side smoothing/interp). */
  tick: number
  players: ReadonlyArray<NetPlayer>
  enemies: ReadonlyArray<NetEnemy>
  wave: number
  alive: number
  total: number
  gold: number
}

export interface NetPlayer {
  sessionId: string
  name: string
  slot: 0 | 1
  x: number
  y: number
  vx: number
  vy: number
  facingX: number
  facingY: number
  walkPhase: number
  attackKind: string
  attackTimer: number
  attackDuration: number
  attackDirX: number
  attackDirY: number
  hp: number
  maxHp: number
}

export interface NetEnemy {
  id: string
  typeId: string
  x: number
  y: number
  vx: number
  vy: number
  facingX: number
  facingY: number
  walkPhase: number
  attackTimer: number
  attackDuration: number
  hp: number
  maxHp: number
  hurtFlash: number
}

/** A peer left (drop-out, network failure). The other player keeps going solo. */
export interface PeerLeftMsg {
  t: 'peer-left'
  sessionId: string
  reason: 'consented' | 'timeout' | 'kicked'
}

/** Server rejected a request. `code` is machine-readable, `msg` human-readable. */
export interface ErrorMsg {
  t: 'error'
  code:
    | 'invalid-code'
    | 'lobby-full'
    | 'lobby-locked'
    | 'invalid-message'
    | 'auth-failed'
    | 'internal'
  msg: string
}

/** Server-side ping — the client echoes it back. Used to measure RTT and
 *  also keeps mobile-Safari WS connections alive past the ~30s background timer. */
export interface PingMsg {
  t: 'ping'
  /** Server-issued nonce. Client must echo it verbatim in `pong`. */
  nonce: number
}

export type ServerMsg = LobbyMsg | PhaseMsg | StateMsg | PeerLeftMsg | ErrorMsg | PingMsg

// ============================================================================
// Helpers
// ============================================================================

/** Encode for the wire. Centralized so we can swap to msgpack later if needed. */
export function encodeMsg(msg: ClientMsg | ServerMsg): string {
  return JSON.stringify(msg)
}

/** Best-effort parse. Returns `null` on malformed JSON or missing `t`. The
 *  caller switches on `msg.t` and the type system narrows from there. */
export function parseMsg<T extends { t: string }>(raw: string): T | null {
  try {
    const obj = JSON.parse(raw) as unknown
    if (obj && typeof obj === 'object' && typeof (obj as { t: unknown }).t === 'string') {
      return obj as T
    }
    return null
  } catch {
    return null
  }
}
