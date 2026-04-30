// @vitest-environment node
import { attackPatterns } from '@stick/content'
import { describe, expect, it } from 'vitest'

import { createPlayer } from './entities/Player'
import { createEventBus } from './eventBus'
import { tickArena, type SimDeps, type SimInputs } from './loop'
import { createRng } from './rng'
import { createRunState, type RunState } from './runState'
import { CombatSystem } from './systems/CombatSystem'
import { EnemySystem } from './systems/EnemySystem'
import { ObstacleSystem } from './systems/ObstacleSystem'
import { ProjectileSystem } from './systems/ProjectileSystem'
import { SkillSystem } from './systems/SkillSystem'
import { WaveSystem } from './systems/WaveSystem'

/**
 * Builds a complete sim setup with everything wired up. Used to test
 * determinism: same seed + same inputs across N ticks ⇒ same state out.
 *
 * The dependency graph here is the same one ArenaScene wires for single-player
 * (and the realtime room will wire for multi). Nothing Phaser-specific.
 */
function buildSim(seed: number) {
  const bus = createEventBus()
  const rng = createRng(seed)
  const state = createRunState({ seed, playerMaxHp: 100 })
  const player = createPlayer({ x: 600, y: 400, maxHp: 100 })

  const projectiles = new ProjectileSystem({ bus })
  const obstacles = new ObstacleSystem({ bus, rng })
  const waves = new WaveSystem({ bus, rng })
  const enemies = new EnemySystem({ bus, rng, projectiles })
  const skills = new SkillSystem({ bus })
  const combat = new CombatSystem({
    bus,
    attackPatterns,
    getEnemies: () => waves.getEnemies(),
    rngNext: () => rng.next(),
  })

  const deps: SimDeps = {
    bus,
    rng,
    combat,
    skills,
    enemies,
    projectiles,
    waves,
    obstacles,
    player,
    stats: { regenPerSec: 0, dmgMul: 1 },
    enemyRadius: () => 16,
  }

  return { state, player, deps }
}

/**
 * Snapshot the parts of the sim that two-deterministic-runs must match
 * byte-for-byte. We avoid serializing the systems themselves (they hold
 * non-data fields like bus refs) — only the state that the wire would carry.
 */
function snapshot(state: RunState, deps: SimDeps): string {
  return JSON.stringify({
    state,
    player: deps.player,
    enemies: deps.waves.getEnemies(),
    projectiles: deps.projectiles.getAll(),
    obstacles: deps.obstacles.getAll(),
  })
}

describe('tickArena determinism', () => {
  it('produces identical state after N ticks given the same seed + inputs', () => {
    const A = buildSim(42)
    const B = buildSim(42)

    // Same input every tick — what matters is reproducibility, not realism.
    const input: SimInputs = { p1: { dx: 1, dy: 0 } }
    const realDt = 1 / 60

    for (let i = 0; i < 240; i++) {
      tickArena(A.state, input, realDt, A.deps)
      tickArena(B.state, input, realDt, B.deps)
    }

    expect(snapshot(A.state, A.deps)).toBe(snapshot(B.state, B.deps))
  })

  it('diverges when seed differs', () => {
    const A = buildSim(42)
    const B = buildSim(43)
    const input: SimInputs = { p1: { dx: 1, dy: 0 } }
    const realDt = 1 / 60

    for (let i = 0; i < 240; i++) {
      tickArena(A.state, input, realDt, A.deps)
      tickArena(B.state, input, realDt, B.deps)
    }

    // Different seeds drive different RNG → wave spawning + crit rolls
    // differ → snapshots must differ. (If they don't, sim has a hidden
    // non-RNG dependency we need to find.)
    expect(snapshot(A.state, A.deps)).not.toBe(snapshot(B.state, B.deps))
  })

  it('keeps state self-contained (no hidden timers outside RunState)', () => {
    // Tornado tick acc and hit-stop cooldown live in RunState now (added
    // in F5R-A). Sanity: their initial values are 0 and they're typed numbers.
    const { state } = buildSim(42)
    expect(state.tornadoTickAcc).toBe(0)
    expect(state.hitStopCooldown).toBe(0)
    expect(typeof state.tornadoTickAcc).toBe('number')
    expect(typeof state.hitStopCooldown).toBe('number')
  })

  it('respects hit-stop: dt is forced to 0 while hitStop > 0', () => {
    const { state, deps } = buildSim(42)
    state.hitStop = 0.1

    const report = tickArena(state, { p1: { dx: 1, dy: 0 } }, 1 / 60, deps)
    expect(report.dt).toBe(0)
  })

  it('respects slow-mo: dt is scaled to 0.4× while slowMo > 0', () => {
    const { state, deps } = buildSim(42)
    state.slowMo = 0.5

    const report = tickArena(state, { p1: { dx: 1, dy: 0 } }, 1 / 60, deps)
    expect(report.dt).toBeCloseTo((1 / 60) * 0.4)
  })
})
