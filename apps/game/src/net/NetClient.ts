/**
 * Realtime client over plain WebSocket + JSON.
 *
 * No SDK, no codec. The browser's native `WebSocket` plus the typed protocol
 * defined in `@stick/shared/realtime/protocol`. Every message goes through
 * `parseMsg<ServerMsg>` and TypeScript narrows the union from `t`.
 *
 * URL resolution:
 *   - `VITE_REALTIME_URL` if set (e.g. `wss://stick-fighter-realtime.neomac.io`)
 *   - else derive from `VITE_API_URL`: replace `stick-fighter-api` →
 *     `stick-fighter-realtime`, and `https?://` → `wss://`/`ws://`. The path
 *     `/ws` is always appended.
 *
 * The client maintains a single connection per session. Disconnecting and
 * re-connecting is the user's job (close the lobby, open it again).
 */

import {
  type ClientMsg,
  type ErrorMsg,
  type LobbyMsg,
  type ServerMsg,
  type StateMsg,
  encodeMsg,
  parseMsg,
} from '@stick/shared'

import { AuthStore } from '../platform/authStore'

function resolveWsUrl(): string | null {
  const explicit = (import.meta.env?.VITE_REALTIME_URL as string | undefined)?.trim()
  if (explicit) {
    const base = explicit.replace(/\/$/, '')
    return base.endsWith('/ws') ? base : `${base}/ws`
  }
  const api = (import.meta.env?.VITE_API_URL as string | undefined)?.trim()
  if (!api) return null
  const wsBase = api
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://')
    .replace('stick-fighter-api', 'stick-fighter-realtime')
    .replace(/\/$/, '')
  return `${wsBase}/ws`
}

const REALTIME_URL = resolveWsUrl()

export type ConnectionPhase = 'idle' | 'connecting' | 'lobby' | 'playing' | 'gameover' | 'error'

/**
 * Snapshot the rest of the app subscribes to. Re-emitted on every server
 * message that changes anything visible: lobby roster, phase transition,
 * full state. Components that only care about state (NetArenaScene) ignore
 * lobby-only snapshots; the lobby UI ignores state-only snapshots, etc.
 */
export interface RoomSnapshot {
  phase: ConnectionPhase
  /** 4-letter lobby code, once known. */
  code: string | null
  /** The local client's session id. Stable for the room's lifetime. */
  sessionId: string | null
  /** The local client's slot (0 = host, 1 = friend). */
  slot: 0 | 1 | null
  /** Roster from the most recent lobby msg. */
  players: ReadonlyArray<{ sessionId: string; name: string; slot: 0 | 1; ready: boolean }>
  /** Latest gameplay snapshot. Null until phase transitions to 'playing'. */
  state: StateMsg | null
  /** Last error from the server, sticky until cleared. */
  error: { code: ErrorMsg['code']; msg: string } | null
}

const initialSnapshot: RoomSnapshot = {
  phase: 'idle',
  code: null,
  sessionId: null,
  slot: null,
  players: [],
  state: null,
  error: null,
}

class NetClient {
  private ws: WebSocket | null = null
  private snap: RoomSnapshot = initialSnapshot
  private listeners = new Set<(s: RoomSnapshot) => void>()
  /** Last input we sent — used to coalesce duplicate emissions. */
  private lastSentInput: { dx: number; dy: number } = { dx: 0, dy: 0 }

  /** Subscribe to snapshot changes. Returns an unsubscribe fn. */
  subscribe(fn: (s: RoomSnapshot) => void): () => void {
    this.listeners.add(fn)
    fn(this.snap)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot(): RoomSnapshot {
    return this.snap
  }

  /** True if we have a configured URL. The lobby UI shows "offline" otherwise. */
  isAvailable(): boolean {
    return REALTIME_URL !== null
  }

  /** Open a new room. Resolves to the snapshot after the server's lobby ack,
   *  or null on failure (no URL configured / connection refused / server error). */
  async hostRoom(name: string): Promise<RoomSnapshot | null> {
    return this.connectThen({ t: 'host', name, accessToken: this.token() })
  }

  /** Join an existing room by 4-letter code. */
  async joinRoom(name: string, code: string): Promise<RoomSnapshot | null> {
    return this.connectThen({
      t: 'join',
      name,
      code: code.toUpperCase(),
      accessToken: this.token(),
    })
  }

  /** Flip ready. Server transitions to 'playing' when all players are ready. */
  sendReady(): void {
    this.send({ t: 'ready' })
  }

  /** Per-tick movement vector. Coalesces duplicates so we don't spam the WS. */
  sendInput(
    dx: number,
    dy: number,
    edges?: { attack?: boolean; shoot?: boolean; skill?: 0 | 1 },
  ): void {
    const movementChanged =
      Math.abs(dx - this.lastSentInput.dx) > 0.001 || Math.abs(dy - this.lastSentInput.dy) > 0.001
    const hasEdge = !!(edges?.attack || edges?.shoot || edges?.skill !== undefined)
    if (!movementChanged && !hasEdge) return
    this.lastSentInput = { dx, dy }
    const msg: ClientMsg = {
      t: 'input',
      dx,
      dy,
      ...(edges?.attack ? { attack: true } : {}),
      ...(edges?.shoot ? { shoot: true } : {}),
      ...(edges?.skill !== undefined ? { skill: edges.skill } : {}),
    }
    this.send(msg)
  }

  /** Disconnect cleanly. The server frees the slot immediately. */
  async leave(): Promise<void> {
    if (!this.ws) return
    try {
      this.send({ t: 'leave' })
      this.ws.close(1000, 'leave')
    } catch {
      // ignore
    }
    this.ws = null
    this.update({ ...initialSnapshot })
  }

  // ------------------------------------------------------------------ inner

  private token(): string | undefined {
    return AuthStore.get()?.accessToken
  }

  /**
   * Open a WS, send the handshake, and resolve once the server replies with
   * either a `lobby` ack (success) or `error`. Subsequent server messages
   * keep flowing into the snapshot.
   */
  private connectThen(handshake: ClientMsg): Promise<RoomSnapshot | null> {
    if (!REALTIME_URL) {
      this.update({
        ...this.snap,
        phase: 'error',
        error: { code: 'internal', msg: 'realtime URL not configured' },
      })
      return Promise.resolve(null)
    }
    // Drop any prior connection.
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        // ignore
      }
      this.ws = null
    }

    this.update({ ...initialSnapshot, phase: 'connecting' })

    return new Promise((resolve) => {
      const ws = new WebSocket(REALTIME_URL!)
      this.ws = ws
      let settled = false

      ws.addEventListener('open', () => {
        ws.send(encodeMsg(handshake))
      })

      ws.addEventListener('message', (ev) => {
        const text = typeof ev.data === 'string' ? ev.data : ''
        const msg = parseMsg<ServerMsg>(text)
        if (!msg) return
        this.applyServerMsg(msg)

        // Resolve the handshake promise on the first lobby OR error.
        if (!settled) {
          if (msg.t === 'lobby') {
            settled = true
            resolve(this.snap)
          } else if (msg.t === 'error') {
            settled = true
            resolve(null)
          }
        }
      })

      ws.addEventListener('close', () => {
        if (!settled) {
          settled = true
          this.update({
            ...this.snap,
            phase: 'error',
            error: this.snap.error ?? { code: 'internal', msg: 'connection closed' },
          })
          resolve(null)
        } else if (this.snap.phase !== 'gameover') {
          this.update({
            ...this.snap,
            phase: 'error',
            error: { code: 'internal', msg: 'connection lost' },
          })
        }
        if (this.ws === ws) this.ws = null
      })

      ws.addEventListener('error', () => {
        // The 'close' handler will run right after; let it own the resolution.
      })
    })
  }

  private applyServerMsg(msg: ServerMsg): void {
    switch (msg.t) {
      case 'lobby':
        this.applyLobby(msg)
        return
      case 'phase':
        this.update({
          ...this.snap,
          phase:
            msg.phase === 'playing' ? 'playing' : msg.phase === 'gameover' ? 'gameover' : 'lobby',
        })
        return
      case 'state':
        this.update({ ...this.snap, state: msg })
        return
      case 'peer-left':
        this.update({
          ...this.snap,
          players: this.snap.players.filter((p) => p.sessionId !== msg.sessionId),
        })
        return
      case 'error':
        this.update({ ...this.snap, error: { code: msg.code, msg: msg.msg } })
        return
      case 'ping':
        // No PongMsg in the protocol yet; we just rely on TCP keepalive +
        // browser's automatic WS ping reply. Reserved for future RTT tracking.
        return
    }
  }

  private applyLobby(msg: LobbyMsg): void {
    // Server sends per-receiver lobby msgs with our scoped sessionId/slot.
    this.update({
      ...this.snap,
      phase: this.snap.phase === 'playing' ? 'playing' : 'lobby',
      code: msg.code,
      // sessionId/slot are sticky once we know them — re-broadcasts keep them.
      sessionId: this.snap.sessionId ?? (msg.sessionId || null),
      slot: this.snap.slot ?? (msg.sessionId ? msg.slot : null),
      players: msg.players,
    })
  }

  private send(msg: ClientMsg): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    try {
      this.ws.send(encodeMsg(msg))
    } catch (err) {
      console.error('[net] send failed:', err)
    }
  }

  private update(next: RoomSnapshot): void {
    this.snap = next
    for (const fn of this.listeners) fn(next)
  }
}

export const netClient = new NetClient()
