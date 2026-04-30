import * as Colyseus from 'colyseus.js'

import { AuthStore } from '../platform/authStore'

/**
 * Colyseus client wrapper. Resolves the realtime URL from `VITE_REALTIME_URL`
 * (Vite env). Falls back to deriving from `VITE_API_URL` by swapping host
 * (replace `stick-fighter-api` with `stick-fighter-realtime`) and scheme
 * (`https://` → `wss://`). If neither is configured the client returns null
 * and the lobby UI shows the "multiplayer offline" state.
 */

function resolveRealtimeUrl(): string | null {
  const explicit = (import.meta.env?.VITE_REALTIME_URL as string | undefined)?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const api = (import.meta.env?.VITE_API_URL as string | undefined)?.trim()
  if (!api) return null
  const wsUrl = api
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://')
    .replace('stick-fighter-api', 'stick-fighter-realtime')
    .replace(/\/$/, '')
  return wsUrl
}

const REALTIME_URL = resolveRealtimeUrl()

export interface RoomPlayer {
  sessionId: string
  displayName: string
  slot: number
  ready: boolean
  x: number
  y: number
  vx: number
  vy: number
  hp: number
  maxHp: number
}

export interface RoomSnapshot {
  lobbyCode: string
  phase: 'lobby' | 'playing' | 'gameover'
  seed: number
  wave: number
  waveAlive: number
  waveTotal: number
  players: RoomPlayer[]
}

type Listener = (snap: RoomSnapshot) => void

export class NetClient {
  static isConfigured(): boolean {
    return REALTIME_URL !== null
  }

  static get url(): string | null {
    return REALTIME_URL
  }

  private client: Colyseus.Client | null = null
  private room: Colyseus.Room | null = null
  private listeners = new Set<Listener>()
  private lastSnapshot: RoomSnapshot | null = null

  /** Lazy-instantiate the Colyseus client. */
  private getClient(): Colyseus.Client {
    if (this.client) return this.client
    if (!REALTIME_URL) {
      throw new Error('NetClient: realtime URL not configured (VITE_REALTIME_URL)')
    }
    this.client = new Colyseus.Client(REALTIME_URL)
    return this.client
  }

  /** Common joinOptions: forwards JWT (if logged in) + a player name. */
  private joinOptions(playerName: string, lobbyCode?: string): Record<string, unknown> {
    const auth = AuthStore.get()
    const opts: Record<string, unknown> = { playerName }
    if (auth) opts.accessToken = auth.accessToken
    if (lobbyCode) opts.lobbyCode = lobbyCode.toUpperCase()
    return opts
  }

  /** Host: create a new room, get a lobby code back. */
  async hostRoom(playerName: string): Promise<RoomSnapshot | null> {
    try {
      const room = await this.getClient().create('stick_fight', this.joinOptions(playerName))
      this.bindRoom(room)
      return this.lastSnapshot
    } catch (err) {
      console.warn('[net] hostRoom failed:', err)
      return null
    }
  }

  /** Friend: join an existing room by 4-letter code. The Colyseus matchmaker
   *  matches via `filterBy(['lobbyCode'])` on the server. */
  async joinRoom(playerName: string, lobbyCode: string): Promise<RoomSnapshot | null> {
    try {
      const room = await this.getClient().join(
        'stick_fight',
        this.joinOptions(playerName, lobbyCode),
      )
      this.bindRoom(room)
      return this.lastSnapshot
    } catch (err) {
      console.warn('[net] joinRoom failed:', err)
      return null
    }
  }

  /** Subscribe to room state updates. Fires immediately with the current snapshot. */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    if (this.lastSnapshot) fn(this.lastSnapshot)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** Send a movement input. Components in -1..1 each axis. */
  sendMove(x: number, y: number): void {
    this.room?.send('input:move', { x, y })
  }

  sendReady(): void {
    this.room?.send('player:ready')
  }

  /** Disconnect cleanly. */
  async leave(consented = true): Promise<void> {
    try {
      await this.room?.leave(consented)
    } catch {
      // ignore
    }
    this.room = null
    this.lastSnapshot = null
    this.listeners.clear()
  }

  get sessionId(): string | undefined {
    return this.room?.sessionId
  }

  get joined(): boolean {
    return this.room !== null
  }

  private bindRoom(room: Colyseus.Room): void {
    this.room = room
    room.onStateChange((state: unknown) => {
      this.lastSnapshot = stateToSnapshot(state)
      for (const fn of [...this.listeners]) {
        try {
          fn(this.lastSnapshot)
        } catch (err) {
          console.error('[net] listener threw:', err)
        }
      }
    })
    room.onLeave(() => {
      this.room = null
      this.lastSnapshot = null
    })
  }
}

/**
 * Best-effort coerce of the Colyseus state object to our flat snapshot.
 * Colyseus 0.16 hands us a typed Schema instance, but we don't share the
 * schema classes between server + client, so we read by name with `unknown`.
 */
function stateToSnapshot(state: unknown): RoomSnapshot {
  const s = state as {
    lobbyCode?: string
    phase?: 'lobby' | 'playing' | 'gameover'
    seed?: number
    wave?: number
    waveAlive?: number
    waveTotal?: number
    players?: Map<string, unknown> | { forEach: (cb: (p: unknown, key: string) => void) => void }
  }
  const players: RoomPlayer[] = []
  s.players?.forEach((p: unknown, key: string) => {
    const pp = p as Partial<RoomPlayer>
    players.push({
      sessionId: pp.sessionId ?? key,
      displayName: pp.displayName ?? '',
      slot: pp.slot ?? 0,
      ready: pp.ready ?? false,
      x: pp.x ?? 0,
      y: pp.y ?? 0,
      vx: pp.vx ?? 0,
      vy: pp.vy ?? 0,
      hp: pp.hp ?? 0,
      maxHp: pp.maxHp ?? 100,
    })
  })
  return {
    lobbyCode: s.lobbyCode ?? '',
    phase: s.phase ?? 'lobby',
    seed: s.seed ?? 0,
    wave: s.wave ?? 0,
    waveAlive: s.waveAlive ?? 0,
    waveTotal: s.waveTotal ?? 0,
    players,
  }
}

export const netClient = new NetClient()
