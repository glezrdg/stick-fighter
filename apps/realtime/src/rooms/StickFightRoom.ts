import { type Client, Room } from '@colyseus/core'
import { ARENA, type Player, createPlayer, updateMovement } from '@stick/sim'
import jwt from 'jsonwebtoken'

import { PlayerState, WorldState } from '../schema/WorldState'

/**
 * StickFightRoom — 2-player co-op against the wave system.
 *
 * Skeleton for F5 phase 3a:
 *   - up to 2 clients per room
 *   - JWT auth on join (anonymous allowed via `playerName` option)
 *   - heartbeat-only loop; the real sim tick lands in phase 3b
 *
 * Lobby flow:
 *   1. Host calls `joinOrCreate('stick_fight')` with no roomId → creates a
 *      room + 4-letter lobby code is broadcast in WorldState.lobbyCode.
 *   2. Friend calls `join('stick_fight', { lobbyCode })` → matchmaker filter
 *      routes to the right room.
 *   3. Both clients flip `ready=true` → server flips `phase` to 'playing'
 *      and seeds the run.
 */

interface JoinOptions {
  /** JWT access token from `/auth/login`. Optional — guests allowed. */
  accessToken?: string
  /** Used by friends to find the host's room. */
  lobbyCode?: string
  /** Anonymous handle when no JWT supplied. */
  playerName?: string
}

const SIM_TICK_HZ = 30 // server-authoritative tick rate (33ms)
const LOBBY_CODE_LEN = 4

interface PlayerInputState {
  /** Last move vector received (-1..1 each axis). */
  moveX: number
  moveY: number
}

export class StickFightRoom extends Room<WorldState> {
  override state = new WorldState()
  override maxClients = 2
  /** Set when the second player joins so we know not to advertise. */
  private isLocked = false

  /** Authoritative sim entities, indexed by sessionId. The schema's
   *  PlayerState mirrors a subset of these every tick. */
  private readonly simPlayers = new Map<string, Player>()
  private readonly inputs = new Map<string, PlayerInputState>()

  override onCreate(): void {
    this.state.lobbyCode = generateLobbyCode()

    // Make the room joinable by lobbyCode via matchmaker filter.
    // Setting metadata is what `getAvailableRooms()` reads on the client.
    this.setMetadata({ lobbyCode: this.state.lobbyCode })

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), 1000 / SIM_TICK_HZ)

    this.onMessage('player:ready', (client) => {
      const p = this.state.players.get(client.sessionId)
      if (!p) return
      p.ready = true
      const all = Array.from(this.state.players.values())
      if (all.length >= 1 && all.every((q) => q.ready)) {
        this.state.phase = 'playing'
        this.state.seed = Math.floor(Math.random() * 0xffffffff)
      }
    })

    /**
     * Movement input. Compact: both axes in -1..1, normalized to a unit
     * vector before being applied to MovementSystem. Spam-tolerant — the
     * server only consumes whatever it has at tick time, so the rate at
     * which the client emits doesn't affect simulation determinism.
     */
    this.onMessage('input:move', (client, raw: unknown) => {
      const input = parseMoveInput(raw)
      if (!input) return
      this.inputs.set(client.sessionId, input)
    })

    console.info(`[stick_fight] room ${this.roomId} created (lobby ${this.state.lobbyCode})`)
  }

  /**
   * Validate the join attempt. Returning `false` rejects the client; this
   * is also where we authenticate the JWT (when present) and reject
   * mismatched lobby codes.
   */
  override onAuth(_client: Client, options: JoinOptions): JoinAuth {
    if (this.isLocked) return false
    if (this.state.phase !== 'lobby') return false

    // If a lobbyCode is provided, it must match this room's. Colyseus's
    // matchmaker normally routes by metadata, but we double-check here.
    if (options.lobbyCode && options.lobbyCode.toUpperCase() !== this.state.lobbyCode) {
      return false
    }

    if (options.accessToken) {
      const secret = process.env.JWT_SECRET
      if (!secret) {
        // Fail closed if the secret isn't configured — better than letting
        // the client think it's logged in.
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

    // Anonymous join — must supply a name.
    if (!options.playerName?.trim()) return false
    return { sub: null, displayName: options.playerName.trim().slice(0, 20) }
  }

  override onJoin(client: Client, _options: JoinOptions, auth: JoinAuth): void {
    if (auth === false) return
    const slot = this.state.players.size
    const spawnX = slot === 0 ? ARENA.width / 2 - 60 : ARENA.width / 2 + 60
    const spawnY = ARENA.height / 2

    // Build the authoritative sim Player.
    const sim = createPlayer({ x: spawnX, y: spawnY })
    this.simPlayers.set(client.sessionId, sim)
    this.inputs.set(client.sessionId, { moveX: 0, moveY: 0 })

    // Mirror to the schema so the client renders this player.
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
    console.info(
      `[stick_fight] ${client.sessionId} joined room ${this.roomId} (slot ${slot}, name=${auth.displayName})`,
    )
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId)
    if (!player) return

    if (consented) {
      this.cleanupClient(client.sessionId)
      return
    }
    // Hold the slot for up to 2 minutes so a backgrounded mobile Safari /
    // a flaky network can rejoin without losing the run.
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
    console.info(`[stick_fight] room ${this.roomId} disposed`)
  }

  private cleanupClient(sessionId: string): void {
    this.state.players.delete(sessionId)
    this.simPlayers.delete(sessionId)
    this.inputs.delete(sessionId)
  }

  /**
   * Server tick — runs at SIM_TICK_HZ. For phase 3b we only update player
   * movement; combat/enemies/waves land in 3c. Each tick:
   *  1. Apply each client's last input vector via MovementSystem
   *  2. Mirror the resulting (x, y, vx, vy) into the schema (Colyseus diffs
   *     it to all clients automatically)
   */
  private tick(dt: number): void {
    if (this.state.phase !== 'playing') return

    for (const [sessionId, sim] of this.simPlayers) {
      const input = this.inputs.get(sessionId) ?? { moveX: 0, moveY: 0 }
      updateMovement(sim, { x: input.moveX, y: input.moveY }, dt)

      const schema = this.state.players.get(sessionId)
      if (!schema) continue
      schema.x = sim.x
      schema.y = sim.y
      schema.vx = sim.vx
      schema.vy = sim.vy
      schema.hp = sim.hp
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
  // Clamp components to [-1, 1] then renormalize if magnitude > 1 so a
  // client can't send (10, 10) and gain extra speed.
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
