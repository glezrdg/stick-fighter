import { type Client, Room } from '@colyseus/core'
import { attackPatterns } from '@stick/content'
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
import jwt from 'jsonwebtoken'

import { registerLobby, unregisterLobby } from '../lobbyRegistry'
import { EnemyState, PlayerState, WorldState } from '../schema/WorldState'

/**
 * StickFightRoom — 2-player co-op against the wave system.
 *
 * **Lobby flow (server-authoritative codes):**
 *   1. Host calls `client.create('stick_fight')` → room is created, server
 *      generates a 4-letter code, emits a `lobby:info` message with it.
 *   2. Friend hits `GET /lobby/CODE` (REST), gets the roomId, then
 *      `client.joinById(roomId)`.
 *   3. Both clients flip `ready=true` → server transitions phase 'lobby'
 *      → 'playing' and seeds the run.
 *
 * **Why server-generated codes (changed from the experimental branch):**
 *   The experimental approach had the host generate the code client-side
 *   and pass it in `create()` options — but that meant the client
 *   couldn't reliably read it back from the schema before showing it
 *   to the user (without sharing schema classes the round trip is fragile).
 *   Generating it server-side and pushing it via `client.send('lobby:info')`
 *   avoids the whole class.
 */

interface JoinOptions {
  /** JWT access token from `/auth/login`. Optional — guests allowed. */
  accessToken?: string
  /** Anonymous handle when no JWT supplied. */
  playerName?: string
}

const SIM_TICK_HZ = 30 // server-authoritative tick rate (33ms)
const LOBBY_CODE_LEN = 4

interface PlayerInputState {
  /** Last move vector received (-1..1 each axis, normalized). */
  moveX: number
  moveY: number
}

export class StickFightRoom extends Room<WorldState> {
  override state = new WorldState()
  override maxClients = 2
  /** Set when the second player joins so we know not to advertise. */
  private isLocked = false

  /** Authoritative sim entities, indexed by sessionId. */
  private readonly simPlayers = new Map<string, Player>()
  private readonly inputs = new Map<string, PlayerInputState>()

  /** Sim systems instantiated when phase: 'lobby' → 'playing'. */
  private simBus!: SimBus
  private simRng!: Rng
  private waves: WaveSystem | null = null
  private enemySys: EnemySystem | null = null
  private projectiles: ProjectileSystem | null = null
  /** One CombatSystem per player so each combo state machine is independent. */
  private readonly combats = new Map<string, CombatSystem>()
  /** Mirror of `enemy.id` → schema row. Used to delete on death. */
  private readonly enemySchemaIndex = new Map<string, EnemyState>()

  override onCreate(): void {
    this.state.lobbyCode = generateLobbyCode()
    console.info(`[stick_fight] onCreate roomId=${this.roomId} lobbyCode=${this.state.lobbyCode}`)

    registerLobby(this.state.lobbyCode, this.roomId)
    this.setMetadata({ lobbyCode: this.state.lobbyCode })

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), 1000 / SIM_TICK_HZ)

    this.onMessage('player:ready', (client) => {
      const p = this.state.players.get(client.sessionId)
      if (!p) return
      p.ready = true
      const all = Array.from(this.state.players.values())
      if (all.length >= 1 && all.every((q) => q.ready) && this.state.phase === 'lobby') {
        this.startRun()
      }
    })

    this.onMessage('input:move', (client, raw: unknown) => {
      const input = parseMoveInput(raw)
      if (!input) return
      this.inputs.set(client.sessionId, input)
    })

    this.onMessage('input:attack', (client) => {
      if (this.state.phase !== 'playing') return
      const sim = this.simPlayers.get(client.sessionId)
      const combat = this.combats.get(client.sessionId)
      if (!sim || !combat) return
      combat.tryAttack(sim)
    })
  }

  /**
   * Validate the join attempt. Returning `false` rejects the client.
   * JWT verification is best-effort — a guest path with `playerName` is
   * always allowed, since matching the api's anonymous run flow.
   */
  override onAuth(_client: Client, options: JoinOptions): JoinAuth {
    if (this.isLocked) return false
    if (this.state.phase !== 'lobby') return false

    if (options.accessToken) {
      const secret = process.env.JWT_SECRET
      if (!secret) {
        console.error('[stick_fight] JWT_SECRET not set; rejecting authed joins')
        return false
      }
      try {
        const payload = jwt.verify(options.accessToken, secret) as {
          sub?: string
          email?: string
        }
        if (!payload.sub) return false
        return { sub: payload.sub, displayName: deriveDisplayName(options) }
      } catch {
        return false
      }
    }

    if (!options.playerName?.trim()) return false
    return { sub: null, displayName: options.playerName.trim().slice(0, 20) }
  }

  override onJoin(client: Client, _options?: JoinOptions, auth?: JoinAuth): void {
    if (!auth) return
    const slot = this.state.players.size
    const spawnX = slot === 0 ? ARENA.width / 2 - 60 : ARENA.width / 2 + 60
    const spawnY = ARENA.height / 2

    const sim = createPlayer({ x: spawnX, y: spawnY })
    this.simPlayers.set(client.sessionId, sim)
    this.inputs.set(client.sessionId, { moveX: 0, moveY: 0 })

    const player = new PlayerState()
    player.sessionId = client.sessionId
    player.displayName = auth.displayName
    player.slot = slot
    player.x = sim.x
    player.y = sim.y
    player.hp = sim.hp
    player.maxHp = sim.maxHp
    this.state.players.set(client.sessionId, player)

    if (this.state.players.size >= this.maxClients) {
      this.isLocked = true
      this.lock().catch(() => {})
    }

    // One-shot lobby info — the schema's `lobbyCode` field works too once
    // the client subscribes to state changes, but a direct message lets the
    // UI show the code instantly after join.
    client.send('lobby:info', {
      lobbyCode: this.state.lobbyCode,
      sessionId: client.sessionId,
      slot,
    })

    console.info(
      `[stick_fight] ${client.sessionId} joined ${this.roomId} (slot ${slot}, name=${auth.displayName})`,
    )
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId)
    if (!player) return

    if (consented) {
      this.cleanupClient(client.sessionId)
      return
    }
    // 2-min grace for backgrounded mobile Safari / flaky networks.
    try {
      await this.allowReconnection(client, 120)
      console.info(`[stick_fight] ${client.sessionId} reconnected`)
    } catch {
      this.cleanupClient(client.sessionId)
      this.isLocked = false
      this.unlock().catch(() => {})
    }
  }

  override onDispose(): void {
    unregisterLobby(this.state.lobbyCode)
    console.info(`[stick_fight] room ${this.roomId} disposed`)
  }

  private cleanupClient(sessionId: string): void {
    this.state.players.delete(sessionId)
    this.simPlayers.delete(sessionId)
    this.inputs.delete(sessionId)
    this.combats.delete(sessionId)
  }

  private startRun(): void {
    const seed = Math.floor(Math.random() * 0xffffffff)
    this.state.seed = seed
    this.state.phase = 'playing'

    this.simBus = createEventBus()
    this.simRng = createRng(seed)
    this.projectiles = new ProjectileSystem({ bus: this.simBus })
    this.enemySys = new EnemySystem({
      bus: this.simBus,
      rng: this.simRng,
      projectiles: this.projectiles,
    })
    this.waves = new WaveSystem({ bus: this.simBus, rng: this.simRng })

    this.simBus.on('wave:start', ({ wave, totalEnemies }) => {
      this.state.wave = wave
      this.state.waveTotal = totalEnemies
      this.state.waveAlive = totalEnemies
    })
    this.simBus.on('wave:enemies:changed', ({ alive, total }) => {
      this.state.waveAlive = alive
      this.state.waveTotal = total
    })
    this.simBus.on('enemy:death', ({ enemyId }) => {
      const row = this.enemySchemaIndex.get(enemyId)
      if (!row) return
      const idx = this.state.enemies.indexOf(row)
      if (idx >= 0) this.state.enemies.splice(idx, 1)
      this.enemySchemaIndex.delete(enemyId)
    })

    for (const sessionId of this.simPlayers.keys()) {
      const combat = new CombatSystem({
        bus: this.simBus,
        attackPatterns,
        getEnemies: () => this.waves?.getEnemies() ?? [],
        rngNext: () => this.simRng.next(),
      })
      this.combats.set(sessionId, combat)
    }

    this.waves.startNextWave()
  }

  /**
   * Server tick — runs at SIM_TICK_HZ. We don't use `tickArena()` from sim
   * because that's single-player-shaped (one Player in deps). The multi
   * loop iterates per-player and shares the world systems. When sim grows
   * a `tickArenaMulti(state, players[], ...)` API we'll call it here.
   */
  private tick(dt: number): void {
    if (this.state.phase !== 'playing') return

    // Players: apply inputs + movement + tick combat timers.
    for (const [sessionId, sim] of this.simPlayers) {
      const input = this.inputs.get(sessionId) ?? { moveX: 0, moveY: 0 }
      updateMovement(sim, { x: input.moveX, y: input.moveY }, dt)
      this.combats.get(sessionId)?.update(sim, dt)
    }

    // Enemies + projectiles + waves. EnemySystem currently targets one
    // Player; we feed it the first one and the AI re-targets in its
    // behaviors. Refining to per-enemy nearest-target is a TODO once
    // sync is proven to work.
    const firstPlayer = this.simPlayers.values().next().value as Player | undefined
    if (firstPlayer && this.enemySys && this.waves && this.projectiles) {
      const enemies = this.waves.getEnemies()
      this.enemySys.update(enemies, firstPlayer, dt)
      this.projectiles.update(firstPlayer, dt)
      this.waves.update(dt)
      this.waves.reapDead()
    }

    // ---- Mirror to schema ----
    for (const [sessionId, sim] of this.simPlayers) {
      const schema = this.state.players.get(sessionId)
      if (!schema) continue
      schema.x = sim.x
      schema.y = sim.y
      schema.vx = sim.vx
      schema.vy = sim.vy
      schema.facingX = sim.facingX
      schema.facingY = sim.facingY
      schema.walkPhase = sim.walkPhase
      schema.attackKind = sim.attackKind ?? ''
      schema.attackTimer = sim.attackTimer
      schema.attackDuration = sim.attackDuration
      schema.attackDirX = sim.attackDirX
      schema.attackDirY = sim.attackDirY
      schema.hp = Math.max(0, Math.floor(sim.hp))
      schema.maxHp = sim.maxHp
    }

    if (this.waves) this.syncEnemiesToSchema(this.waves.getEnemies())
  }

  private syncEnemiesToSchema(enemies: readonly Enemy[]): void {
    for (const e of enemies) {
      let row = this.enemySchemaIndex.get(e.id)
      if (!row) {
        row = new EnemyState()
        row.id = e.id
        row.typeId = e.typeId
        row.maxHp = e.maxHp
        this.enemySchemaIndex.set(e.id, row)
        this.state.enemies.push(row)
      }
      row.x = e.x
      row.y = e.y
      row.vx = e.vx
      row.vy = e.vy
      row.facingX = e.facingX
      row.facingY = e.facingY
      row.walkPhase = e.walkPhase
      row.attackTimer = e.attackTimer
      row.attackDuration = e.attackDuration
      row.hp = Math.max(0, Math.floor(e.hp))
      row.hurtFlash = e.hurtFlash
    }
  }
}

type JoinAuth = false | { sub: string | null; displayName: string }

function deriveDisplayName(options: JoinOptions): string {
  return (options.playerName?.trim() || 'Player').slice(0, 20)
}

function parseMoveInput(raw: unknown): PlayerInputState | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as { x?: unknown; y?: unknown }
  const x = typeof obj.x === 'number' ? obj.x : NaN
  const y = typeof obj.y === 'number' ? obj.y : NaN
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  // Clamp to [-1,1] then renormalize if magnitude > 1.
  const cx = Math.max(-1, Math.min(1, x))
  const cy = Math.max(-1, Math.min(1, y))
  const mag = Math.hypot(cx, cy)
  if (mag <= 1) return { moveX: cx, moveY: cy }
  return { moveX: cx / mag, moveY: cy / mag }
}

function generateLobbyCode(): string {
  // Excludes I/O/0/1 so codes are unambiguous over voice / phone.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < LOBBY_CODE_LEN; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}
