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
  type EnemyDespawnMsg,
  type EnemySpawnMsg,
  type ErrorMsg,
  type LobbyMsg,
  type NetCosmetics,
  type NetEnemy,
  type NetLoadout,
  type NetObstacle,
  type ObstacleDespawnMsg,
  type ObstacleSpawnMsg,
  type RestartVotesMsg,
  type ServerMsg,
  type StateMsg,
  type WaveBuffEndMsg,
  type WaveBuffOfferMsg,
  type WaveBuffResolvedMsg,
  type WaveBuffVotesMsg,
  encodeMsg,
  parseMsg,
} from '@stick/shared'

import { getValidAccessToken } from '../platform/api'

/**
 * Métricas en vivo sobre el WS — leídas por `<TelemetryOverlay>` cuando se
 * activa con `?debug=1`. Ring-buffer rolling para que ningún spike puntual
 * arruine el p95 y todas las cifras se reseteen al reconnectarse.
 */
export interface NetTelemetry {
  /** Tickrate efectivo recibido (server msgs/s rolling 2s). */
  tickRateHz: number
  /** Bytes promedio por segundo (rolling 2s). */
  bytesPerSec: number
  /** p95 parse time (JSON.parse) sobre los últimos 60 mensajes. */
  parseP95Ms: number
  /** Tamaño del último mensaje recibido. */
  lastMsgBytes: number
  /** Parse time del último mensaje. */
  lastMsgParseMs: number
  /** Versión del protocolo netcode declarada por este cliente. */
  netcodeVersion: number
}

/** Versión del protocolo netcode que el cliente soporta hoy. Se manda en
 *  cada handshake (`HostReq`/`JoinReq`/`RejoinReq`). El server detecta el
 *  máximo común a todos los clientes en sala y emite acorde — permite
 *  cliente viejo + cliente nuevo durante deploys parciales.
 *
 *    1 = legacy
 *    2 = static/dynamic split (Spawn/Despawn msgs + entityCache local)
 */
export const CLIENT_NETCODE_VERSION = 2

/** Window de medición rolling para tickrate y bytes/s (ms). */
const TELEMETRY_WINDOW_MS = 2000
/** Cuántos parse times mantener para p95. */
const PARSE_SAMPLES = 60

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
  /** Restart consensus desde gameover. Cliente lo lee para mostrar
   *  "REINTENTAR (1/2)" y "esperando al peer". Null cuando no hay restart
   *  pendiente o no estamos en gameover. */
  restartVotes: { votes: ReadonlyArray<string>; needed: number } | null
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
  restartVotes: null,
}

class NetClient {
  private ws: WebSocket | null = null
  private snap: RoomSnapshot = initialSnapshot
  private listeners = new Set<(s: RoomSnapshot) => void>()
  /** Set true durante un tryRejoin loop activo, evita duplicar intentos
   *  cuando el visibilitychange dispara mientras ya hay backoff en curso. */
  private rejoining = false
  /** Listener instalado una vez para reaccionar al volver del background.
   *  Mobile Safari mata WS al backgroundear ~30s y al volver tab vemos
   *  conexión perdida — esto la trata de reanimar automáticamente. */
  private visibilityHookInstalled = false
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

  // ---- Telemetry --------------------------------------------------------
  /** Cada entrada: { ts, bytes }. Rolling window de TELEMETRY_WINDOW_MS. */
  private telMsgs: Array<{ ts: number; bytes: number }> = []
  /** Ring buffer de parse times (ms). */
  private telParseTimes: number[] = []
  private telParseIdx = 0
  private telLastBytes = 0
  private telLastParseMs = 0

  // ---- Entity cache (netcode v2+) ---------------------------------------
  /** Campos inmutables de cada enemy — populated por `EnemySpawnMsg` y
   *  removed por `EnemyDespawnMsg`. El cliente los merge con los dinámicos
   *  del state msg para reconstruir un `NetEnemy` full sin que el server
   *  los retransmita cada tick. */
  private enemySpawnCache = new Map<
    string,
    { typeId: string; maxHp: number; lastX: number; lastY: number }
  >()
  private obstacleSpawnCache = new Map<
    string,
    { type: 'barrel' | 'crate' | 'column'; x: number; y: number; r: number; hpMax: number }
  >()

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
    const accessToken = await getValidAccessToken()
    return this.connectThen({
      t: 'host',
      name,
      netcodeVersion: CLIENT_NETCODE_VERSION,
      ...(accessToken ? { accessToken } : {}),
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
    const accessToken = await getValidAccessToken()
    return this.connectThen({
      t: 'join',
      name,
      code: code.toUpperCase(),
      netcodeVersion: CLIENT_NETCODE_VERSION,
      ...(accessToken ? { accessToken } : {}),
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

  /** Pide restart desde la pantalla de gameover. Server requiere consenso
   *  de todos los clientes activos. Cuando llegue, snapshot.phase pasa a
   *  'lobby' y los players ven el LobbyOverlay con la sala intacta. */
  requestRestart(): void {
    this.send({ t: 'restart' })
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
    this.enemySpawnCache.clear()
    this.obstacleSpawnCache.clear()
    this.update({ ...initialSnapshot })
  }

  // ------------------------------------------------------------------ inner

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
    this.installVisibilityHook()

    return new Promise((resolve) => {
      const ws = new WebSocket(REALTIME_URL!)
      this.ws = ws
      let settled = false

      ws.addEventListener('open', () => {
        ws.send(encodeMsg(handshake))
      })

      ws.addEventListener('message', (ev) => {
        const text = typeof ev.data === 'string' ? ev.data : ''
        const msg = this.parseAndMeasure(text)
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
        } else if (
          (this.snap.phase === 'playing' || this.snap.phase === 'lobby') &&
          this.snap.code &&
          this.snap.sessionId
        ) {
          // Disconnect mid-session → server holds our slot for ~60s en CUALQUIER
          // phase (incluyendo lobby). Intentamos reconnect via `rejoin` con
          // backoff. Si falla todo, caemos a error.
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
    this.rejoining = true
    if (attempt > 30) {
      // 75s ≈ pasamos el grace window — abandonar.
      this.rejoining = false
      this.update({
        ...this.snap,
        phase: 'error',
        error: { code: 'internal', msg: 'reconnect grace expired' },
      })
      return
    }
    if (!REALTIME_URL) {
      this.rejoining = false
      return
    }
    const ws = new WebSocket(REALTIME_URL)
    this.ws = ws
    let settled = false

    ws.addEventListener('open', () => {
      // Refresca si el access token está por vencer; sino el server WS rechaza
      // con auth-failed y entramos en loop de "connection lost".
      void getValidAccessToken().then((accessToken) => {
        if (ws.readyState !== WebSocket.OPEN) return
        ws.send(
          encodeMsg({
            t: 'rejoin',
            code,
            sessionId,
            netcodeVersion: CLIENT_NETCODE_VERSION,
            ...(accessToken ? { accessToken } : {}),
          }),
        )
      })
    })
    ws.addEventListener('message', (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : ''
      const msg = this.parseAndMeasure(text)
      if (!msg) return
      this.applyServerMsg(msg)
      if (!settled) {
        if (msg.t === 'lobby') {
          settled = true
          this.rejoining = false
          // Conservamos la phase actual del snapshot (el server podía estar en
          // 'lobby' o 'playing'); applyServerMsg ya la setea según viene del
          // mensaje. Si volvimos a un room en lobby, no forzamos 'playing'.
          this.update({ ...this.snap, error: null })
        } else if (msg.t === 'error') {
          settled = true
          this.rejoining = false
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
      case 'phase': {
        const nextPhase: ConnectionPhase =
          msg.phase === 'playing' ? 'playing' : msg.phase === 'gameover' ? 'gameover' : 'lobby'
        // Saliendo de gameover (post-restart) → tirá el summary y los votes.
        const leavingGameover = this.snap.phase === 'gameover' && nextPhase !== 'gameover'
        // Volviendo a lobby = run nuevo arrancando — cache de spawns vieja
        // ya no aplica. Server va a remandar spawns con el primer state msg.
        if (nextPhase === 'lobby') {
          this.enemySpawnCache.clear()
          this.obstacleSpawnCache.clear()
        }
        this.update({
          ...this.snap,
          phase: nextPhase,
          // En gameover el server adjunta el summary final. Lo guardamos en
          // el snapshot para que NetArenaScene lo lea y submitee el run.
          gameoverSummary:
            msg.phase === 'gameover' && msg.summary && typeof msg.seed === 'number'
              ? { seed: msg.seed, ...msg.summary }
              : leavingGameover
                ? null
                : this.snap.gameoverSummary,
          restartVotes: leavingGameover ? null : this.snap.restartVotes,
          // Si volvimos a 'lobby' (restart), el state previo ya no aplica.
          state: nextPhase === 'lobby' ? null : this.snap.state,
        })
        return
      }
      case 'state':
        this.update({ ...this.snap, state: this.reconstructStateMsg(msg) })
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
      case 'wave-buff:end':
        this.applyBuffEnd(msg)
        return
      case 'restart:votes':
        this.applyRestartVotes(msg)
        return
      case 'spawn:enemy':
        this.applyEnemySpawn(msg)
        return
      case 'despawn:enemy':
        this.applyEnemyDespawn(msg)
        return
      case 'spawn:obstacle':
        this.applyObstacleSpawn(msg)
        return
      case 'despawn:obstacle':
        this.applyObstacleDespawn(msg)
        return
    }
  }

  /** Reconstruye un StateMsg "v1-shape" desde el wire que puede venir como
   *  v2 (enemiesDynamic + cache) o v1 (enemies full). Centralizamos acá para
   *  que el resto del código (NetArenaScene) consuma siempre `state.enemies`
   *  y `state.obstacles` con full fields, transparente al netcode version. */
  private reconstructStateMsg(msg: StateMsg): StateMsg {
    if (!msg.enemiesDynamic && !msg.obstaclesDynamic) return msg // v1 puro

    let enemies: NetEnemy[] | undefined
    if (msg.enemiesDynamic) {
      enemies = []
      for (const d of msg.enemiesDynamic) {
        const cached = this.enemySpawnCache.get(d.id)
        if (!cached) {
          // Spawn msg llegó después que el primer state (race posible).
          // Saltamos este enemy en este tick — el próximo tick ya estará.
          continue
        }
        const e: NetEnemy = {
          id: d.id,
          typeId: cached.typeId,
          maxHp: cached.maxHp,
          x: d.x,
          y: d.y,
          vx: d.vx,
          vy: d.vy,
          facingX: d.facingX,
          facingY: d.facingY,
          walkPhase: d.walkPhase,
          attackKind: d.attackKind ?? '',
          attackTimer: d.attackTimer,
          attackDuration: 0.4,
          hp: d.hp,
          hurtFlash: d.hurtFlash,
        }
        if (d.attackDirX !== undefined) e.attackDirX = d.attackDirX
        if (d.attackDirY !== undefined) e.attackDirY = d.attackDirY
        enemies.push(e)
        cached.lastX = d.x
        cached.lastY = d.y
      }
    }

    let obstacles: NetObstacle[] | undefined
    if (msg.obstaclesDynamic) {
      obstacles = []
      for (const d of msg.obstaclesDynamic) {
        const cached = this.obstacleSpawnCache.get(d.id)
        if (!cached) continue
        obstacles.push({
          id: d.id,
          type: cached.type,
          x: cached.x,
          y: cached.y,
          r: cached.r,
          hp: d.hp,
          hpMax: cached.hpMax,
          hitFlash: d.hitFlash,
        })
      }
    }

    const out: StateMsg = { ...msg }
    if (enemies) out.enemies = enemies
    if (obstacles) out.obstacles = obstacles
    return out
  }

  private applyEnemySpawn(msg: EnemySpawnMsg): void {
    this.enemySpawnCache.set(msg.id, {
      typeId: msg.typeId,
      maxHp: msg.maxHp,
      lastX: msg.x,
      lastY: msg.y,
    })
  }

  private applyEnemyDespawn(msg: EnemyDespawnMsg): void {
    this.enemySpawnCache.delete(msg.id)
  }

  private applyObstacleSpawn(msg: ObstacleSpawnMsg): void {
    this.obstacleSpawnCache.set(msg.id, {
      type: msg.type,
      x: msg.x,
      y: msg.y,
      r: msg.r,
      hpMax: msg.hpMax,
    })
  }

  private applyObstacleDespawn(msg: ObstacleDespawnMsg): void {
    this.obstacleSpawnCache.delete(msg.id)
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
    // En multi llega un resolved POR PLAYER (cada quien recibe su propia
    // bendición). NO limpiamos `waveBuffOffer` acá — eso pasa con
    // `wave-buff:end` cuando el server cierra la fase. Mientras tanto el
    // UI muestra "✓ TU VOTO REGISTRADO — ESPERANDO AL OTRO" si solo uno picó.
    for (const fn of this.resolvedListeners) fn(msg)
  }

  private applyBuffEnd(_msg: WaveBuffEndMsg): void {
    this.update({ ...this.snap, waveBuffOffer: null, waveBuffVotes: [] })
  }

  private applyRestartVotes(msg: RestartVotesMsg): void {
    this.update({
      ...this.snap,
      restartVotes: { votes: msg.votes, needed: msg.needed },
    })
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

  /** Parsea un msg + actualiza telemetría (bytes, parse time, msg counter).
   *  Reemplaza `parseMsg` directo. Sin overhead notable: performance.now ×2
   *  + push/shift de un array, costo de ~µs. */
  private parseAndMeasure(text: string): ServerMsg | null {
    const bytes = text.length
    const t0 = performance.now()
    const msg = parseMsg<ServerMsg>(text)
    const dt = performance.now() - t0
    this.telLastBytes = bytes
    this.telLastParseMs = dt
    const now = performance.now()
    this.telMsgs.push({ ts: now, bytes })
    // Trim entries fuera del window (rolling 2s).
    const cutoff = now - TELEMETRY_WINDOW_MS
    while (this.telMsgs.length > 0 && (this.telMsgs[0]?.ts ?? 0) < cutoff) {
      this.telMsgs.shift()
    }
    // Ring buffer de parse times — pisamos el más viejo cuando llenamos.
    if (this.telParseTimes.length < PARSE_SAMPLES) {
      this.telParseTimes.push(dt)
    } else {
      this.telParseTimes[this.telParseIdx] = dt
      this.telParseIdx = (this.telParseIdx + 1) % PARSE_SAMPLES
    }
    return msg
  }

  /** Snapshot de telemetría — leído por TelemetryOverlay cada 500ms. */
  getTelemetry(): NetTelemetry {
    const span = TELEMETRY_WINDOW_MS / 1000
    const totalBytes = this.telMsgs.reduce((sum, m) => sum + m.bytes, 0)
    const tickRateHz = this.telMsgs.length / span
    const bytesPerSec = totalBytes / span
    let parseP95Ms = 0
    if (this.telParseTimes.length >= 5) {
      const sorted = this.telParseTimes.slice().sort((a, b) => a - b)
      const idx = Math.floor(sorted.length * 0.95)
      parseP95Ms = sorted[Math.min(idx, sorted.length - 1)] ?? 0
    }
    return {
      tickRateHz,
      bytesPerSec,
      parseP95Ms,
      lastMsgBytes: this.telLastBytes,
      lastMsgParseMs: this.telLastParseMs,
      netcodeVersion: CLIENT_NETCODE_VERSION,
    }
  }

  /** Mobile Safari + tabs en background matan WS al ratito. Cuando el user
   *  vuelve a la pestaña/app, intentamos reconnect si tenemos sessionId.
   *  Idempotente: lo instalamos una sola vez por pageload. */
  private installVisibilityHook(): void {
    if (this.visibilityHookInstalled) return
    if (typeof document === 'undefined') return
    this.visibilityHookInstalled = true
    const reconnectIfStale = () => {
      if (document.visibilityState !== 'visible') return
      if (this.rejoining) return
      const wsClosed = !this.ws || this.ws.readyState === WebSocket.CLOSED
      if (!wsClosed) return
      const { phase, code, sessionId } = this.snap
      if ((phase === 'lobby' || phase === 'playing') && code && sessionId) {
        this.tryRejoin(code, sessionId)
      }
    }
    document.addEventListener('visibilitychange', reconnectIfStale)
    // Algunos browsers (mobile Safari) disparan 'pageshow' al volver del bfcache.
    window.addEventListener('pageshow', reconnectIfStale)
    // Volvió la red → reintento inmediato.
    window.addEventListener('online', reconnectIfStale)
  }
}

export const netClient = new NetClient()
