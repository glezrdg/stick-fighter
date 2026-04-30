// @vitest-environment node
import { getEnemyType } from '@stick/content'
import { createRng } from '@stick/sim'
import { beforeEach, describe, expect, it } from 'vitest'

import { createEventBus, type EventBus } from '../../app/eventBus'
import { _resetEnemyIdsForTest, createEnemy, type Enemy } from '../../entities/Enemy'
import { createPlayer, type Player } from '../../entities/Player'
import { _resetProjectileIdsForTest } from '../../entities/Projectile'
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

  it('fires a projectile when off cooldown', () => {
    const enemy = createEnemy({ type: mage, x: 800, y: 400 }) // distance ~200, in band
    rangedKite({ enemy, type: mage, player, bus, rng: createRng(0), dt: 1 / 60, projectiles })
    expect(projectiles.getAll().length).toBe(1)
    expect(projectiles.getAll()[0]!.type).toBe('orb')
    expect(enemy.attackCooldown).toBeCloseTo(mage.attackCooldown, 5)
  })

  it('uses the spear projType for spear enemies', () => {
    const enemy = createEnemy({ type: spear, x: 800, y: 400 })
    rangedKite({ enemy, type: spear, player, bus, rng: createRng(0), dt: 1 / 60, projectiles })
    expect(projectiles.getAll()[0]!.type).toBe('spear')
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
