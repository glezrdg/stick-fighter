import { attackPatterns } from '@stick/content'
import {
  type ClientMsg,
  type LobbyMsg,
  type NetCosmetics,
  type NetEnemy,
  type NetPlayer,
  type PhaseMsg,
  type ServerMsg,
  type StateMsg,
  encodeMsg,
} from '@stick/shared'
import {
  ARENA,
  CombatSystem,
  type Enemy,
  EnemySystem,
  type EventBus as SimBus,
  type Player,
  ProjectileSystem,
  type Rng,
  WaveSystem,
  createEventBus,
  createPlayer,
  createRng,
  updateMovement,
} from '@stick/sim'
import type { WebSocket } from 'ws'

/**
 * One Room = one 2P co-op lobby. Lifecycle:
 *
 *   1. `new StickFightRoom(code)`     — empty, phase: 'lobby'
 *   2. `addClient(ws, name)`          — host or friend joins
 *   3. both flip ready → `startRun()` — phase: 'playing', sim systems boot
 *   4. `tick(dt)` runs at 30 Hz       — sim advances, full state broadcast
 *   5. last client leaves OR all dead → `dispose()` (server unregisters)
 *
 * Tick = full state broadcast. ~3-5 KB/tick at 30Hz = ~150 KB/s/client.
 * No delta encoding: easier to debug (DevTools → WS frames are readable JSON),
 * no codec to break (the lesson from the Colyseus attempts).
 */

/** Server-side default for clients that don't declare cosmetics at handshake. */
const DEFAULT_COSMETICS: NetCosmetics = {
  skin: 'default',
  weapon: 'katana',
  weaponLevel: 1,
  aura: 'yellow',
}

export interface RoomClient {
  ws: WebSocket
  sessionId: string
  name: string
  slot: 0 | 1
  ready: boolean
  /** What this player wants to look like — sent at handshake, retransmitted
   *  every tick in NetPlayer. Server treats it as opaque cosmetic data; the
   *  renderer on each client maps these ids to colors/shapes via
   *  `@stick/content`. */
  cosmetics: NetCosmetics
  /** Last input received from this client. Server samples it each tick. */
  input: { dx: number; dy: number; attack: boolean; shoot: boolean; skill: 0 | 1 | null }
  /** Authoritative sim entity (mirrors `sessionId`). */
  sim: Player
  /** Per-player combo state machine. */
  combat: CombatSystem
  /** Last echo of the server's ping nonce (for RTT, future use). */
  lastPongAt: number
}

const SIM_TICK_HZ = 30
const SIM_TICK_MS = 1000 / SIM_TICK_HZ
const RECONNECT_GRACE_MS = 120_000

export class StickFightRoom {
  readonly code: string
  /** Monotonic tick counter. Resets on phase transition to 'playing'. */
  private tick = 0
  private phase: 'lobby' | 'playing' | 'gameover' = 'lobby'
  private seed = 0

  private readonly clients = new Map<string, RoomClient>()
  private nextSessionSeq = 0

  // Sim systems (instantiated on phase transition lobby → playing).
  private bus: SimBus | null = null
  private rng: Rng | null = null
  private waves: WaveSystem | null = null
  private enemies: EnemySystem | null = null
  private projectiles: ProjectileSystem | null = null

  /** setInterval handle for the sim tick. */
  private tickHandle: NodeJS.Timeout | null = null
  /** Used to compute dt (real ms between ticks). */
  private lastTickAt = 0

  /** Run-level counters mirrored from sim events into the broadcast snapshot. */
  private gold = 0
  private wave = 0
  private alive = 0
  private total = 0

  constructor(
    code: string,
    private readonly onDispose: (code: string) => void,
  ) {
    this.code = code
  }

  /** Capacity check used by the server before calling `addClient`. */
  isFull(): boolean {
    return this.clients.size >= 2
  }

  isLocked(): boolean {
    return this.phase !== 'lobby'
  }

  /**
   * Add a freshly-connected client. Caller has already validated the
   * lobby code + capacity. Sends the lobby msg back over `ws`.
   */
  addClient(ws: WebSocket, name: string, cosmetics?: NetCosmetics): RoomClient {
    const sessionId = `s${this.code}-${this.nextSessionSeq++}`
    const slot: 0 | 1 = this.clients.size === 0 ? 0 : 1
    const spawnX = slot === 0 ? ARENA.width / 2 - 60 : ARENA.width / 2 + 60
    const spawnY = ARENA.height / 2
    const sim = createPlayer({ x: spawnX, y: spawnY })

    // The combat system needs `getEnemies` — we late-bind it via a closure so
    // the WaveSystem (created later in startRun) can be referenced safely.
    const combat = new CombatSystem({
      bus: this.busOrFallback(),
      attackPatterns,
      getEnemies: () => this.waves?.getEnemies() ?? [],
      rngNext: () => this.rng?.next() ?? 0,
    })

    const client: RoomClient = {
      ws,
      sessionId,
      name,
      slot,
      ready: false,
      cosmetics: cosmetics ?? DEFAULT_COSMETICS,
      input: { dx: 0, dy: 0, attack: false, shoot: false, skill: null },
      sim,
      combat,
      lastPongAt: Date.now(),
    }
    this.clients.set(sessionId, client)

    // Send lobby snapshot to the new client.
    this.send(client.ws, this.lobbyMsg())
    // Notify the others (peer joined → re-send fresh lobby snapshot).
    this.broadcastExcept(client.sessionId, this.lobbyMsg())

    return client
  }

  /** Apply an incoming message from a known client. */
  handleMessage(client: RoomClient, msg: ClientMsg): void {
    switch (msg.t) {
      case 'ready':
        client.ready = true
        this.broadcast(this.lobbyMsg())
        if (this.phase === 'lobby' && this.allReady()) this.startRun()
        return
      case 'input': {
        // Clamp to [-1, 1] and renormalize if magnitude > 1.
        const cx = clamp01(msg.dx)
        const cy = clamp01(msg.dy)
        const mag = Math.hypot(cx, cy)
        if (mag <= 1) {
          client.input.dx = cx
          client.input.dy = cy
        } else {
          client.input.dx = cx / mag
          client.input.dy = cy / mag
        }
        // Edge actions are one-shot: store true, the next tick consumes them.
        if (msg.attack) client.input.attack = true
        if (msg.shoot) client.input.shoot = true
        if (msg.skill === 0 || msg.skill === 1) client.input.skill = msg.skill
        return
      }
      case 'leave':
        this.removeClient(client.sessionId, 'consented')
        return
      case 'host':
      case 'join':
        // Already-connected client trying to handshake again — ignore.
        return
    }
  }

  /** Ungraceful disconnect (network drop, browser tab closed, etc.). */
  handleSocketClose(client: RoomClient): void {
    // For simplicity we don't hold the slot — drop-in/drop-out grace can
    // come later. F5R'-A scope: if you lose connection, you lose the slot.
    this.removeClient(client.sessionId, 'timeout')
  }

  // -------------------------------------------------------------------- inner

  private allReady(): boolean {
    if (this.clients.size === 0) return false
    for (const c of this.clients.values()) if (!c.ready) return false
    return true
  }

  private startRun(): void {
    this.seed = Math.floor(Math.random() * 0xffffffff)
    this.phase = 'playing'
    this.tick = 0
    this.lastTickAt = Date.now()

    this.bus = createEventBus()
    this.rng = createRng(this.seed)
    this.projectiles = new ProjectileSystem({ bus: this.bus })
    this.enemies = new EnemySystem({
      bus: this.bus,
      rng: this.rng,
      projectiles: this.projectiles,
    })
    this.waves = new WaveSystem({ bus: this.bus, rng: this.rng })

    // Mirror sim events into broadcast counters.
    this.bus.on('wave:start', ({ wave, totalEnemies }) => {
      this.wave = wave
      this.total = totalEnemies
      this.alive = totalEnemies
    })
    this.bus.on('wave:enemies:changed', ({ alive, total }) => {
      this.alive = alive
      this.total = total
    })
    this.bus.on('gold:changed', ({ gold }) => {
      this.gold = gold
    })

    // Re-bind each client's CombatSystem now that bus/rng are real (the
    // closures in the constructors already point to `this.waves` etc.).
    // Nothing to do — the closures resolve lazily.

    this.broadcast({ t: 'phase', phase: 'playing', seed: this.seed } satisfies PhaseMsg)
    this.broadcast(this.lobbyMsg())
    this.waves.startNextWave()

    this.tickHandle = setInterval(() => this.tickOnce(), SIM_TICK_MS)
  }

  private tickOnce(): void {
    const now = Date.now()
    const dt = (now - this.lastTickAt) / 1000
    this.lastTickAt = now
    if (dt <= 0 || dt > 1) {
      // Sanity: skip ticks with absurd dt (server hiccup, tab thaw).
      return
    }

    if (this.phase !== 'playing' || !this.waves || !this.enemies || !this.projectiles) return

    // Per-player: input + movement + combat tick + edge actions.
    for (const c of this.clients.values()) {
      updateMovement(c.sim, { x: c.input.dx, y: c.input.dy }, dt)
      c.combat.update(c.sim, dt)
      if (c.input.attack) {
        c.combat.tryAttack(c.sim)
        c.input.attack = false
      }
      if (c.input.shoot) {
        c.combat.tryShoot(c.sim)
        c.input.shoot = false
      }
      // Skills wiring lands when the SkillSystem is per-room (TODO post-smoke).
      c.input.skill = null
    }

    // Shared world tick. EnemySystem currently targets one player; we feed
    // the first one and re-target inside its behaviors. Per-enemy nearest-
    // target is a TODO once basic 2P sync is proven.
    const firstClient = this.clients.values().next().value
    if (firstClient) {
      const enemiesList = this.waves.getEnemies()
      this.enemies.update(enemiesList, firstClient.sim, dt)
      this.projectiles.update(firstClient.sim, dt)
      this.waves.update(dt)
      this.waves.reapDead()
    }

    this.tick++
    this.broadcast(this.stateMsg())
  }

  private removeClient(sessionId: string, reason: 'consented' | 'timeout' | 'kicked'): void {
    const client = this.clients.get(sessionId)
    if (!client) return
    this.clients.delete(sessionId)
    try {
      client.ws.close()
    } catch {
      // ignore — already closed
    }

    if (this.clients.size === 0) {
      // Empty room — stop ticking and tell the registry to forget us.
      if (this.tickHandle) {
        clearInterval(this.tickHandle)
        this.tickHandle = null
      }
      this.onDispose(this.code)
      return
    }

    this.broadcast({ t: 'peer-left', sessionId, reason } satisfies ServerMsg)
    this.broadcast(this.lobbyMsg())
  }

  // -------------------------------------------------------------------- msgs

  private lobbyMsg(): LobbyMsg | LobbyMsg {
    return {
      t: 'lobby',
      code: this.code,
      // Lobby is a snapshot — `sessionId` is per-receiver, not "the" id.
      // Each client should match by their own connection's sessionId in
      // the players array (we put their full list here).
      sessionId: '',
      slot: 0,
      players: Array.from(this.clients.values()).map((c) => ({
        sessionId: c.sessionId,
        name: c.name,
        slot: c.slot,
        ready: c.ready,
      })),
    }
  }

  /** Like `lobbyMsg()` but with sessionId/slot scoped to the receiver — used
   *  when sending to a specific client so they know which row is "them". */
  private lobbyMsgFor(client: RoomClient): LobbyMsg {
    return { ...this.lobbyMsg(), sessionId: client.sessionId, slot: client.slot }
  }

  private stateMsg(): StateMsg {
    const players: NetPlayer[] = []
    for (const c of this.clients.values()) {
      players.push({
        sessionId: c.sessionId,
        name: c.name,
        slot: c.slot,
        x: c.sim.x,
        y: c.sim.y,
        vx: c.sim.vx,
        vy: c.sim.vy,
        facingX: c.sim.facingX,
        facingY: c.sim.facingY,
        walkPhase: c.sim.walkPhase,
        attackKind: c.sim.attackKind ?? '',
        attackTimer: c.sim.attackTimer,
        attackDuration: c.sim.attackDuration,
        attackDirX: c.sim.attackDirX,
        attackDirY: c.sim.attackDirY,
        hp: Math.max(0, Math.floor(c.sim.hp)),
        maxHp: c.sim.maxHp,
        cosmetics: c.cosmetics,
      })
    }

    const enemiesList: NetEnemy[] = []
    if (this.waves) {
      for (const e of this.waves.getEnemies() as Enemy[]) {
        enemiesList.push({
          id: e.id,
          typeId: e.typeId,
          x: e.x,
          y: e.y,
          vx: e.vx,
          vy: e.vy,
          facingX: e.facingX,
          facingY: e.facingY,
          walkPhase: e.walkPhase,
          attackTimer: e.attackTimer,
          attackDuration: e.attackDuration,
          hp: Math.max(0, Math.floor(e.hp)),
          maxHp: e.maxHp,
          hurtFlash: e.hurtFlash,
        })
      }
    }

    return {
      t: 'state',
      tick: this.tick,
      players,
      enemies: enemiesList,
      wave: this.wave,
      alive: this.alive,
      total: this.total,
      gold: this.gold,
    }
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    if (ws.readyState !== ws.OPEN) return
    try {
      ws.send(encodeMsg(msg))
    } catch (err) {
      console.error('[room] send failed:', err)
    }
  }

  private broadcast(msg: ServerMsg): void {
    if (msg.t === 'lobby') {
      // Lobby msg is per-receiver (sessionId/slot scoped) so we send a
      // fresh one per client.
      for (const c of this.clients.values()) this.send(c.ws, this.lobbyMsgFor(c))
      return
    }
    for (const c of this.clients.values()) this.send(c.ws, msg)
  }

  private broadcastExcept(sessionId: string, msg: ServerMsg): void {
    for (const c of this.clients.values()) {
      if (c.sessionId === sessionId) continue
      this.send(c.ws, msg.t === 'lobby' ? this.lobbyMsgFor(c) : msg)
    }
  }

  /** Returns `this.bus` if it's ready, otherwise a throwaway bus so
   *  CombatSystem can construct in lobby phase before startRun(). The
   *  combat system doesn't emit until tick(), by which point bus is real. */
  private busOrFallback(): SimBus {
    if (this.bus) return this.bus
    this.bus = createEventBus()
    return this.bus
  }

  /** Used by callers (e.g. graceful shutdown). */
  closeAll(): void {
    for (const c of this.clients.values()) {
      try {
        c.ws.close(1001, 'server-shutdown')
      } catch {
        // ignore
      }
    }
    this.clients.clear()
    if (this.tickHandle) {
      clearInterval(this.tickHandle)
      this.tickHandle = null
    }
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < -1) return -1
  if (n > 1) return 1
  return n
}

// Suppress unused warning until reconnect flow lands.
void RECONNECT_GRACE_MS
