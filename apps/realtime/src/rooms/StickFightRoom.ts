import { attackPatterns } from '@stick/content'
import {
  type ClientMsg,
  type LobbyMsg,
  type NetCosmetics,
  type NetEnemy,
  type NetObstacle,
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
  type Obstacle,
  ObstacleSystem,
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

/** Left4Dead-style revival: peer must kill this many enemies to bring you back. */
const REVIVAL_KILLS_REQUIRED = 5
/** Max time spent downed before the run ends if no revive happens. */
const DOWNED_TIMEOUT_MS = 30_000
/** HP fraction the revived player gets restored to. */
const REVIVAL_HP_FRACTION = 0.5
/** Invulnerability seconds granted after revive so you don't insta-die again. */
const REVIVAL_IFRAMES_SEC = 2.0

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
  /** Downed (Left4Dead-style) state. While true, sim isn't ticked — the
   *  player lies on the floor at hp=0 until peer kills enough enemies. */
  downed: boolean
  /** Timestamp (Date.now()) when this player went down; null otherwise. */
  downedAt: number | null
  /** Counter of enemies the peer has killed since this player went down. */
  killsByPeerSinceDown: number
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
  private obstacles: ObstacleSystem | null = null

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
      downed: false,
      downedAt: null,
      killsByPeerSinceDown: 0,
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
    this.obstacles = new ObstacleSystem({ bus: this.bus, rng: this.rng })
    this.obstacles.generate()

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

    // Each enemy kill counts toward reviving any downed teammates.
    // We don't know who landed the killing blow (bus event has no attacker),
    // so any kill counts — that's fine for co-op.
    this.bus.on('enemy:death', () => {
      for (const c of this.clients.values()) {
        if (!c.downed) continue
        c.killsByPeerSinceDown++
        if (c.killsByPeerSinceDown >= REVIVAL_KILLS_REQUIRED) {
          this.reviveClient(c)
        }
      }
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
    // Downed players are skipped — they lie on the floor at hp=0 waiting
    // for a peer to revive them.
    for (const c of this.clients.values()) {
      if (c.downed) {
        // Pin the sim so it doesn't drift (no input, no AI consequences).
        c.sim.vx = 0
        c.sim.vy = 0
        c.input.attack = false
        c.input.shoot = false
        c.input.skill = null
        continue
      }
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

      // Did this player just go down?
      if (c.sim.hp <= 0) {
        this.markDowned(c)
      }
    }

    // Shared world tick. EnemySystem needs an "alive player" target — pick
    // the first non-downed client. If both are downed, the watchdog below
    // will flip phase=gameover anyway, but the sim still advances harmlessly.
    const target = this.firstAlive() ?? this.clients.values().next().value
    if (target) {
      const enemiesList = this.waves.getEnemies()
      this.enemies.update(enemiesList, target.sim, dt)
      this.projectiles.update(target.sim, dt)
      this.waves.update(dt)
      this.waves.reapDead()
      // Obstacles: hit-flash decay + AOE on death (handled inside .update).
      // Then push every actor out of obstacles via collision response.
      if (this.obstacles) {
        this.obstacles.update(dt)
        for (const c of this.clients.values()) {
          if (!c.downed) this.obstacles.applyPlayerCollision(c.sim)
        }
        for (const e of enemiesList) {
          this.obstacles.applyCollision(e, 16)
        }
      }
    }

    // Watchdog: end the run if everyone is downed, or if the downed peer's
    // timer expired with no rescue. Only one player downed → the run keeps
    // going until either the revival happens or the survivor also falls.
    this.checkGameOver()

    this.tick++
    this.broadcast(this.stateMsg())
  }

  /** Returns the first non-downed client (used by EnemySystem for AI target). */
  private firstAlive(): RoomClient | undefined {
    for (const c of this.clients.values()) if (!c.downed) return c
    return undefined
  }

  /** Transition a client from alive → downed: hp=0, sim frozen, peer's
   *  revival counter reset, broadcast handled implicitly by next tick. */
  private markDowned(c: RoomClient): void {
    c.downed = true
    c.downedAt = Date.now()
    c.killsByPeerSinceDown = 0
    c.sim.hp = 0
    c.sim.vx = 0
    c.sim.vy = 0
    c.sim.iframes = 0
    c.sim.attackTimer = 0
    c.sim.attackKind = null
    console.info(`[stick_fight] ${this.code}: ${c.sessionId} (${c.name}) downed`)
  }

  /** Revive a downed client at REVIVAL_HP_FRACTION of maxHp + iframes grace. */
  private reviveClient(c: RoomClient): void {
    c.downed = false
    c.downedAt = null
    c.killsByPeerSinceDown = 0
    c.sim.hp = Math.max(1, Math.floor(c.sim.maxHp * REVIVAL_HP_FRACTION))
    c.sim.iframes = REVIVAL_IFRAMES_SEC
    console.info(`[stick_fight] ${this.code}: ${c.sessionId} (${c.name}) revived`)
  }

  /** End the run if (a) everyone is downed, or (b) the downed timer expired. */
  private checkGameOver(): void {
    if (this.clients.size === 0) return
    const all = Array.from(this.clients.values())
    const alive = all.filter((c) => !c.downed)
    if (alive.length === 0) {
      this.endRun('all-downed')
      return
    }
    // Single downed: did its rescue clock expire?
    const now = Date.now()
    for (const c of all) {
      if (c.downed && c.downedAt && now - c.downedAt > DOWNED_TIMEOUT_MS) {
        this.endRun('rescue-timeout')
        return
      }
    }
  }

  private endRun(reason: 'all-downed' | 'rescue-timeout'): void {
    if (this.phase !== 'playing') return
    this.phase = 'gameover'
    console.info(`[stick_fight] ${this.code}: gameover (${reason})`)
    this.broadcast({ t: 'phase', phase: 'gameover', seed: null } satisfies PhaseMsg)
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
        downed: c.downed,
        revivalProgress: c.downed
          ? Math.min(1, c.killsByPeerSinceDown / REVIVAL_KILLS_REQUIRED)
          : 0,
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

    const obstaclesList: NetObstacle[] = []
    if (this.obstacles) {
      for (const o of this.obstacles.getAll() as Obstacle[]) {
        obstaclesList.push({
          id: o.id,
          type: o.type,
          x: o.x,
          y: o.y,
          r: o.r,
          hp: Math.max(0, Math.floor(o.hp)),
          hpMax: o.hpMax,
          hitFlash: o.hitFlash,
        })
      }
    }

    return {
      t: 'state',
      tick: this.tick,
      players,
      enemies: enemiesList,
      obstacles: obstaclesList,
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
