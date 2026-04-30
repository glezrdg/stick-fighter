/**
 * Single-tick orchestrator for the arena simulation.
 *
 * `tickArena()` advances the deterministic part of the game by one frame.
 * It mutates `RunState`, the player, and the system instances in place,
 * and emits sync-safe events on the bus. Same `(state, input, realDt, deps)` +
 * same RNG sequence ⇒ same state out — that's the contract that makes
 * server-authoritative multiplayer (F5) and replays possible.
 *
 * What lives HERE (sim-only):
 *   - hit-stop / slow-mo decay → effective dt
 *   - tornado AOE damage tick
 *   - player movement / combat / skills / regen
 *   - enemy AI / projectiles / wave spawning
 *   - obstacle physics + collisions
 *
 * What lives in the CLIENT scene (`ArenaScene.update()`):
 *   - gore, particles, deathFx, arena props (cosmetic)
 *   - footstep dust spawn
 *   - camera shake decay + camera follow offset
 *   - HUD reactions to events
 *
 * The split lines up with the `sync-safe` vs `client-only` taxonomy
 * documented in `eventBus.ts`.
 */

import type { Player } from './entities/Player'
import type { EventBus } from './eventBus'
import type { Rng } from './rng'
import type { RunState } from './runState'
import {
  SWORD_TORNADO_DMG_MUL,
  SWORD_TORNADO_RADIUS,
  SWORD_TORNADO_TICK_SEC,
} from './skills/SwordTornado'
import type { CombatSystem } from './systems/CombatSystem'
import type { EnemySystem } from './systems/EnemySystem'
import { tickHitStop } from './systems/hitStop'
import { updateMovement } from './systems/MovementSystem'
import type { ObstacleSystem } from './systems/ObstacleSystem'
import type { ProjectileSystem } from './systems/ProjectileSystem'
import type { SkillSystem } from './systems/SkillSystem'
import type { WaveSystem } from './systems/WaveSystem'

/**
 * Per-tick input for one player. Continuous fields only — discrete actions
 * (attack, shoot, skill cast) flow through the bus today (`input:attack` etc.)
 * and will be folded in here when F5R-B wires the server, so the same struct
 * can be serialized over the wire.
 */
export interface PlayerInput {
  /** Movement vector x in [-1, 1]. */
  dx: number
  /** Movement vector y in [-1, 1]. */
  dy: number
}

/** Inputs for every player in the room. `p2` will be set in F5R-B (multi). */
export interface SimInputs {
  p1: PlayerInput
  p2?: PlayerInput
}

/**
 * Effective stats snapshot the tick reads. Recomputed by the caller whenever
 * buffs/skills/weapon change (see `BuffSystem.computeStats()`); we just use
 * the cached values here so the tick stays a function of (state, deps, dt).
 */
export interface SimStats {
  /** HP/sec to refill the player when not at max. */
  regenPerSec: number
  /** Multiplier applied to tornado damage. */
  dmgMul: number
}

/** Dependency bag. The caller (single-player scene OR multi server) creates
 *  the system instances once and passes them in every tick. */
export interface SimDeps {
  bus: EventBus
  rng: Rng
  combat: CombatSystem
  skills: SkillSystem
  enemies: EnemySystem
  projectiles: ProjectileSystem
  waves: WaveSystem
  obstacles: ObstacleSystem
  /** The player entity. Lives outside `RunState` because some fields (skin
   *  id, render-only flags) are cosmetic and don't need to round-trip. */
  player: Player
  /** Stats snapshot for this tick. */
  stats: SimStats
  /** Collision radius for an enemy by typeId. Owned by content/enemies, not
   *  by sim — passed in so sim doesn't need to depend on content. */
  enemyRadius: (typeId: string) => number
}

/** Side-effect summary returned by a tick — handy for the client to sync
 *  HUD or logs without re-querying the dep bag. */
export interface TickReport {
  /** Effective dt used this tick (after hit-stop/slow-mo). 0 during freeze. */
  dt: number
  /** Alive enemy count after the tick. */
  alive: number
}

/**
 * Run one simulation tick. Mutates `state`, the player, and system internals.
 *
 * The order matches the legacy single-player loop exactly so behavior doesn't
 * shift; if you need to reorder, write a determinism test first.
 */
export function tickArena(
  state: RunState,
  inputs: SimInputs,
  realDt: number,
  deps: SimDeps,
): TickReport {
  // 1. Hit-stop decays on REAL dt; the helper drains the throttle window
  //    too so AOE / over-buffed players can't stack freezes into a slideshow.
  const hsState = { hitStop: state.hitStop, cooldown: state.hitStopCooldown }
  tickHitStop(hsState, realDt)
  state.hitStop = hsState.hitStop
  state.hitStopCooldown = hsState.cooldown

  // 2. Slow-mo also decays on real dt.
  if (state.slowMo > 0) state.slowMo = Math.max(0, state.slowMo - realDt)

  // 3. Compute the effective gameplay dt.
  const dt = state.hitStop > 0 ? 0 : state.slowMo > 0 ? realDt * 0.4 : realDt

  // 4. Tornado AOE — drains its timer + accumulates ticks. Damages enemies.
  if (state.tornadoTimer > 0) {
    state.tornadoTimer = Math.max(0, state.tornadoTimer - dt)
    state.tornadoTickAcc += dt
    while (state.tornadoTickAcc >= SWORD_TORNADO_TICK_SEC) {
      state.tornadoTickAcc -= SWORD_TORNADO_TICK_SEC
      tornadoTickDamage(deps, deps.stats.dmgMul * SWORD_TORNADO_DMG_MUL)
    }
  } else {
    state.tornadoTickAcc = 0
  }

  // 5. Player tick: movement + combat + skills + regen.
  updateMovement(deps.player, { x: inputs.p1.dx, y: inputs.p1.dy }, dt)
  deps.combat.update(deps.player, dt)
  deps.skills.update(state, dt)

  if (deps.stats.regenPerSec > 0 && deps.player.hp > 0 && deps.player.hp < deps.player.maxHp) {
    deps.player.regenAcc += deps.stats.regenPerSec * dt
    if (deps.player.regenAcc >= 1) {
      const heal = Math.floor(deps.player.regenAcc)
      deps.player.hp = Math.min(deps.player.maxHp, deps.player.hp + heal)
      deps.player.regenAcc -= heal
      deps.bus.emit('player:hp:changed', {
        hp: deps.player.hp,
        maxHp: deps.player.maxHp,
      })
    }
  }

  // 6. World tick: enemies + projectiles + waves + obstacles.
  const enemies = deps.waves.getEnemies()
  deps.enemies.update(enemies, deps.player, dt)
  deps.projectiles.update(deps.player, dt)
  deps.waves.update(dt)
  deps.waves.reapDead()
  deps.obstacles.update(dt)

  // 7. Obstacle collisions vs player and enemies.
  deps.obstacles.applyPlayerCollision(deps.player)
  for (const e of enemies) {
    deps.obstacles.applyCollision(e, deps.enemyRadius(e.typeId))
  }

  return { dt, alive: deps.waves.getEnemies().length }
}

function tornadoTickDamage(deps: SimDeps, damage: number): void {
  const enemies = deps.waves.getEnemies()
  for (const e of enemies) {
    if (e.hp <= 0) continue
    const dx = e.x - deps.player.x
    const dy = e.y - deps.player.y
    if (Math.hypot(dx, dy) > SWORD_TORNADO_RADIUS) continue
    const wasAlive = e.hp > 0
    e.hp -= damage
    e.hurtFlash = 0.12
    deps.bus.emit('combat:hit', {
      attackerId: 'player',
      targetId: e.id,
      dmg: damage,
      crit: false,
    })
    if (wasAlive && e.hp <= 0) {
      deps.bus.emit('enemy:death', { enemyId: e.id, byPlayer: true })
    }
  }
}
