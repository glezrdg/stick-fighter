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

import type { SaveCurrent } from '@stick/shared'
import {
  type ClientMsg,
  type ErrorMsg,
  type LobbyMsg,
  type NetCosmetics,
  type NetLoadout,
  type ServerMsg,
  type StateMsg,
  type WaveBuffOfferMsg,
  type WaveBuffResolvedMsg,
  type WaveBuffVotesMsg,
  encodeMsg,
  parseMsg,
} from '@stick/shared'

import { AuthStore } from '../platform/authStore'

/**
 * Derive what we should send the server about how this client wants to look.
 * Pulled from the equipped slots in `save.cosmetics` + the equipped weapon's
 * level. The server retransmits these verbatim — see protocol `NetCosmetics`.
 */
export function cosmeticsFromSave(save: SaveCurrent): NetCosmetics {
  const weaponId = save.cosmetics.sword.equipped
  return {
    skin: save.cosmetics.char.equipped,
    weapon: weaponId,
    weaponLevel: save.weaponLevels[weaponId] ?? 1,
    aura: save.cosmetics.aura.equipped,
  }
}

/**
 * Loadout efectivo del save: skills owned + equipped + arma + nivel.
 * El server lo pasa a `BuffSystem.computeStats()` para calcular daño,
 * HP máx, gold mul, cdMul. Sin esto el server usa defaults (todo en 1.0).
 */
export function loadoutFromSave(save: SaveCurrent): NetLoadout {
  const weaponId = save.cosmetics.sword.equipped
  return {
    ownedSkills: save.skills.owned,
    equippedSkills: [save.skills.equipped[0] ?? null, save.skills.equipped[1] ?? null],
    weaponId,
    weaponLevel: save.weaponLevels[weaponId] ?? 1,
  }
}

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
  /** Wave-buff voting abierta (server pausó). NetArenaScene escucha esto y
   *  monta WaveBuffCards con los buffIds. Null cuando no hay votación. */
  waveBuffOffer: { wave: number; buffIds: ReadonlyArray<string>; timeoutSec: number } | null
  /** Estado de votos en vivo. UI lo usa para "esperando al peer…". */
  waveBuffVotes: ReadonlyArray<{ sessionId: string; buffId: string | null }>
  /** Summary del run cuando el server flipea phase='gameover'. La escena lo
   *  consume para construir RunReport + submitear al leaderboard. Null hasta
   *  que llegue el final. */
  gameoverSummary: {
    seed: number
    wave: number
    kills: number
    gold: number
    durationSec: number
  } | null
}

const initialSnapshot: RoomSnapshot = {
  phase: 'idle',
  code: null,
  sessionId: null,
  slot: null,
  players: [],
  state: null,
  error: null,
  waveBuffOffer: null,
  waveBuffVotes: [],
  gameoverSummary: null,
}

class NetClient {
  private ws: WebSocket | null = null
  private snap: RoomSnapshot = initialSnapshot
  private listeners = new Set<(s: RoomSnapshot) => void>()
  private resolvedListeners = new Set<(msg: WaveBuffResolvedMsg) => void>()
  private peerLeftListeners = new Set<
    (info: { sessionId: string; name: string; reason: string }) => void
  >()
  private skillCastListeners = new Set<
    (info: {
      sessionId: string
      skillId: string
      x: number
      y: number
      facingX: number
      facingY: number
    }) => void
  >()
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
  async hostRoom(
    name: string,
    cosmetics?: NetCosmetics,
    loadout?: NetLoadout,
  ): Promise<RoomSnapshot | null> {
    return this.connectThen({
      t: 'host',
      name,
      accessToken: this.token(),
      ...(cosmetics ? { cosmetics } : {}),
      ...(loadout ? { loadout } : {}),
    })
  }

  /** Join an existing room by 4-letter code. */
  async joinRoom(
    name: string,
    code: string,
    cosmetics?: NetCosmetics,
    loadout?: NetLoadout,
  ): Promise<RoomSnapshot | null> {
    return this.connectThen({
      t: 'join',
      name,
      code: code.toUpperCase(),
      accessToken: this.token(),
      ...(cosmetics ? { cosmetics } : {}),
      ...(loadout ? { loadout } : {}),
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

  /** Vota una de las cartas mostradas tras `wave-buff:offer`. Server resuelve
   *  cuando ambos votan o cuando el timeout expira (autopick). */
  sendWaveBuffVote(buffId: string): void {
    this.send({ t: 'wave-buff:vote', buffId })
  }

  /** Suscripción ad-hoc a la resolución de la carta. NetArenaScene la usa
   *  para mostrar un toast tipo "Wave 2: +regen 1.0/s". */
  onWaveBuffResolved(fn: (msg: WaveBuffResolvedMsg) => void): () => void {
    this.resolvedListeners.add(fn)
    return () => {
      this.resolvedListeners.delete(fn)
    }
  }

  /** Suscripción al evento "peer se fue". NetArenaScene lo escucha para
   *  mostrar un toast tipo "yermino se desconectó — seguís solo". */
  onPeerLeft(fn: (info: { sessionId: string; name: string; reason: string }) => void): () => void {
    this.peerLeftListeners.add(fn)
    return () => {
      this.peerLeftListeners.delete(fn)
    }
  }

  /** Suscripción a casts de skills (locales o del peer). NetArenaScene
   *  spawnea aura burst + shockwave + camera shake en cada cast. */
  onSkillCast(
    fn: (info: {
      sessionId: string
      skillId: string
      x: number
      y: number
      facingX: number
      facingY: number
    }) => void,
  ): () => void {
    this.skillCastListeners.add(fn)
    return () => {
      this.skillCastListeners.delete(fn)
    }
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
        } else if (this.snap.phase === 'playing' && this.snap.code && this.snap.sessionId) {
          // Disconnect during play → server holds our slot for ~60s. Try to
          // reconnect via `rejoin` with backoff. Si falla todo, caemos a error.
          this.tryRejoin(this.snap.code, this.snap.sessionId)
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

  /**
   * Backoff loop attempting to rejoin a room after an unexpected disconnect.
   * Server holds the slot for ~60s; intentamos cada 2.5s hasta éxito o
   * hasta que el server diga `rejoin-failed` (slot expiró).
   */
  private tryRejoin(code: string, sessionId: string, attempt = 1): void {
    if (attempt > 30) {
      // 75s ≈ pasamos el grace window — abandonar.
      this.update({
        ...this.snap,
        phase: 'error',
        error: { code: 'internal', msg: 'reconnect grace expired' },
      })
      return
    }
    if (!REALTIME_URL) return
    const ws = new WebSocket(REALTIME_URL)
    this.ws = ws
    let settled = false

    ws.addEventListener('open', () => {
      ws.send(encodeMsg({ t: 'rejoin', code, sessionId, accessToken: this.token() }))
    })
    ws.addEventListener('message', (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : ''
      const msg = parseMsg<ServerMsg>(text)
      if (!msg) return
      this.applyServerMsg(msg)
      if (!settled) {
        if (msg.t === 'lobby') {
          settled = true
          // Mantenemos `phase: 'playing'` por si llega antes que el próximo state.
          this.update({ ...this.snap, phase: 'playing', error: null })
        } else if (msg.t === 'error') {
          settled = true
          if (msg.code === 'rejoin-failed') {
            this.update({
              ...this.snap,
              phase: 'error',
              error: { code: msg.code, msg: msg.msg },
            })
          }
        }
      }
    })
    ws.addEventListener('close', () => {
      if (!settled) {
        // Attempt didn't complete — schedule next retry.
        setTimeout(() => this.tryRejoin(code, sessionId, attempt + 1), 2500)
      }
      if (this.ws === ws) this.ws = null
    })
    ws.addEventListener('error', () => {
      // El 'close' va a correr después; ahí decidimos si reintentar.
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
          // En gameover el server adjunta el summary final. Lo guardamos en
          // el snapshot para que NetArenaScene lo lea y submitee el run.
          gameoverSummary:
            msg.phase === 'gameover' && msg.summary && typeof msg.seed === 'number'
              ? { seed: msg.seed, ...msg.summary }
              : this.snap.gameoverSummary,
        })
        return
      case 'state':
        this.update({ ...this.snap, state: msg })
        return
      case 'peer-left': {
        const left = this.snap.players.find((p) => p.sessionId === msg.sessionId)
        this.update({
          ...this.snap,
          players: this.snap.players.filter((p) => p.sessionId !== msg.sessionId),
        })
        const name = left?.name ?? 'tu compañero'
        for (const fn of this.peerLeftListeners)
          fn({ sessionId: msg.sessionId, name, reason: msg.reason })
        return
      }
      case 'error':
        this.update({ ...this.snap, error: { code: msg.code, msg: msg.msg } })
        return
      case 'ping':
        // No PongMsg in the protocol yet; we just rely on TCP keepalive +
        // browser's automatic WS ping reply. Reserved for future RTT tracking.
        return
      case 'skill:cast':
        for (const fn of this.skillCastListeners) {
          fn({
            sessionId: msg.sessionId,
            skillId: msg.skillId,
            x: msg.x,
            y: msg.y,
            facingX: msg.facingX,
            facingY: msg.facingY,
          })
        }
        return
      case 'wave-buff:offer':
        this.applyBuffOffer(msg)
        return
      case 'wave-buff:votes':
        this.applyBuffVotes(msg)
        return
      case 'wave-buff:resolved':
        this.applyBuffResolved(msg)
        return
    }
  }

  private applyBuffOffer(msg: WaveBuffOfferMsg): void {
    this.update({
      ...this.snap,
      waveBuffOffer: { wave: msg.wave, buffIds: msg.buffIds, timeoutSec: msg.timeoutSec },
      waveBuffVotes: [],
    })
  }

  private applyBuffVotes(msg: WaveBuffVotesMsg): void {
    this.update({ ...this.snap, waveBuffVotes: msg.votes })
  }

  private applyBuffResolved(msg: WaveBuffResolvedMsg): void {
    // Limpiamos el offer para que el overlay desaparezca.
    this.update({ ...this.snap, waveBuffOffer: null, waveBuffVotes: [] })
    for (const fn of this.resolvedListeners) fn(msg)
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
