// @vitest-environment node
import { getEnemyType } from '@stick/content'
import { beforeEach, describe, expect, it } from 'vitest'

import { _resetEnemyIdsForTest, createEnemy, type Enemy } from '../../entities/Enemy'
import { createPlayer, type Player } from '../../entities/Player'
import { _resetProjectileIdsForTest } from '../../entities/Projectile'
import { createEventBus, type EventBus } from '../../eventBus'
import { createRng } from '../../rng'
import { ProjectileSystem } from '../../systems/ProjectileSystem'

import { rangedKite } from './rangedKite'

const mage = getEnemyType('mage')
const spear = getEnemyType('spear')

describe('rangedKite behavior', () => {
  let player: Player
  let bus: EventBus
  let projectiles: ProjectileSystem

  beforeEach(() => {
    _resetEnemyIdsForTest()
    _resetProjectileIdsForTest()
    bus = createEventBus()
    projectiles = new ProjectileSystem({ bus })
    player = createPlayer({ x: 600, y: 400 })
  })

  /** Run the behavior repeatedly until either a projectile spawns or we
   *  exceed `maxTicks` (windup is ~0.55s × 0.6 = 0.33s, so ~25 ticks @60Hz).
   *  EnemySystem normally decrements `attackTimer`; we mirror that here so
   *  unit tests can run the behavior in isolation. */
  const tickUntilFire = (
    enemy: Enemy,
    type: typeof mage,
    maxTicks = 60,
  ): { fired: boolean; ticks: number } => {
    const dt = 1 / 60
    for (let i = 0; i < maxTicks; i++) {
      rangedKite({ enemy, type, player, bus, rng: createRng(0), dt, projectiles })
      if (enemy.attackTimer > 0) enemy.attackTimer = Math.max(0, enemy.attackTimer - dt)
      if (projectiles.getAll().length > 0) return { fired: true, ticks: i + 1 }
    }
    return { fired: false, ticks: maxTicks }
  }

  it('fires a projectile after a windup, not on the same tick', () => {
    const enemy = createEnemy({ type: mage, x: player.x + 130, y: player.y }) // in band
    // First tick triggers windup but does NOT spawn the projectile.
    rangedKite({ enemy, type: mage, player, bus, rng: createRng(0), dt: 1 / 60, projectiles })
    expect(projectiles.getAll().length).toBe(0)
    expect(enemy.attackTimer).toBeGreaterThan(0)
    expect(enemy.behaviorState['winding']).toBe(true)
    expect(enemy.attackCooldown).toBeCloseTo(mage.attackCooldown, 5)

    // After the windup finishes, the projectile must have spawned.
    const result = tickUntilFire(enemy, mage)
    expect(result.fired).toBe(true)
    expect(projectiles.getAll()[0]!.type).toBe('orb')
  })

  it('uses the spear projType for spear enemies', () => {
    const enemy = createEnemy({ type: spear, x: player.x + 130, y: player.y })
    const result = tickUntilFire(enemy, spear)
    expect(result.fired).toBe(true)
    expect(projectiles.getAll()[0]!.type).toBe('spear')
  })

  it('does NOT fire when the player is beyond MAX_FIRE_DIST (off-screen)', () => {
    // 500 px is well beyond the 360 px hard cap.
    const enemy = createEnemy({ type: mage, x: player.x + 500, y: player.y })
    rangedKite({ enemy, type: mage, player, bus, rng: createRng(0), dt: 1 / 60, projectiles })
    expect(enemy.behaviorState['winding']).not.toBe(true)
    expect(projectiles.getAll().length).toBe(0)
  })

  it('does NOT fire while on cooldown', () => {
    const enemy = createEnemy({ type: mage, x: 800, y: 400 })
    enemy.attackCooldown = 1.0
    rangedKite({ enemy, type: mage, player, bus, rng: createRng(0), dt: 1 / 60, projectiles })
    expect(projectiles.getAll().length).toBe(0)
  })

  it('retreats when the player is too close', () => {
    const enemy = createEnemy({ type: mage, x: player.x - 100, y: player.y })
    rangedKite({ enemy, type: mage, player, bus, rng: createRng(0), dt: 1 / 60, projectiles })
    // Player is to the right (positive x); retreat means negative vx.
    expect(enemy.vx).toBeLessThan(0)
  })

  it('idles when the player is dead', () => {
    player.hp = 0
    const enemy = createEnemy({ type: mage, x: 800, y: 400 })
    enemy.vx = 5
    rangedKite({ enemy, type: mage, player, bus, rng: createRng(0), dt: 1 / 60, projectiles })
    expect(enemy.vx).toBe(0)
    expect(projectiles.getAll().length).toBe(0)
  })

  it('decreases attackCooldown each tick', () => {
    const enemy: Enemy = createEnemy({ type: mage, x: 800, y: 400 })
    enemy.attackCooldown = 0.5
    rangedKite({ enemy, type: mage, player, bus, rng: createRng(0), dt: 0.1, projectiles })
    expect(enemy.attackCooldown).toBeCloseTo(0.4, 5)
  })
})
