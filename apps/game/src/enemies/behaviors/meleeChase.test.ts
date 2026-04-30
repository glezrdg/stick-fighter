// @vitest-environment node
import { getEnemyType } from '@stick/content'
import { createRng } from '@stick/sim'
import { beforeEach, describe, expect, it } from 'vitest'

import { createEventBus, type EventBus } from '../../app/eventBus'
import { _resetEnemyIdsForTest, createEnemy, type Enemy } from '../../entities/Enemy'
import { createPlayer, type Player } from '../../entities/Player'
import { ProjectileSystem } from '../../systems/ProjectileSystem'

import { meleeChase } from './meleeChase'

const grunt = getEnemyType('grunt')

describe('meleeChase behavior', () => {
  let player: Player
  let enemy: Enemy
  let bus: EventBus
  let projectiles: ProjectileSystem

  beforeEach(() => {
    _resetEnemyIdsForTest()
    bus = createEventBus()
    projectiles = new ProjectileSystem({ bus })
    player = createPlayer({ x: 600, y: 400 })
    enemy = createEnemy({ type: grunt, x: 0, y: 0 })
  })

  it('walks toward the player when out of range', () => {
    meleeChase({ enemy, type: grunt, player, bus, rng: createRng(0), dt: 1 / 60, projectiles })
    expect(enemy.vx).toBeGreaterThan(0) // player is to the right
    expect(enemy.vy).toBeGreaterThan(0) // and below
    // Speed magnitude equals type.speed (px/frame at 60Hz).
    expect(Math.hypot(enemy.vx, enemy.vy)).toBeCloseTo(grunt.speed, 5)
  })

  it('faces the player', () => {
    enemy.x = 100
    enemy.y = 100
    meleeChase({ enemy, type: grunt, player, bus, rng: createRng(0), dt: 1 / 60, projectiles })
    expect(enemy.facingX).toBeGreaterThan(0)
    expect(enemy.facingY).toBeGreaterThan(0)
    expect(Math.hypot(enemy.facingX, enemy.facingY)).toBeCloseTo(1, 5)
  })

  it('stops moving and starts a swing when within attackRange', () => {
    enemy.x = player.x - grunt.attackRange / 2
    enemy.y = player.y
    meleeChase({ enemy, type: grunt, player, bus, rng: createRng(0), dt: 1 / 60, projectiles })
    expect(enemy.attackTimer).toBeGreaterThan(0)
    expect(enemy.attackKind).toBe('slashR')
    expect(enemy.attackCooldown).toBeCloseTo(grunt.attackCooldown, 5)
    expect(enemy.behaviorState['strikeAt']).toBeGreaterThan(0)
    // Velocity damped, not boosted.
    expect(Math.abs(enemy.vx)).toBeLessThanOrEqual(grunt.speed)
  })

  it('does NOT swing while still on cooldown', () => {
    enemy.x = player.x - 10
    enemy.y = player.y
    enemy.attackCooldown = 0.5
    meleeChase({ enemy, type: grunt, player, bus, rng: createRng(0), dt: 1 / 60, projectiles })
    expect(enemy.attackTimer).toBe(0)
    expect(enemy.attackKind).toBe(null)
  })

  it('decreases attackCooldown each tick', () => {
    enemy.attackCooldown = 0.5
    meleeChase({ enemy, type: grunt, player, bus, rng: createRng(0), dt: 0.1, projectiles })
    expect(enemy.attackCooldown).toBeCloseTo(0.4, 5)
  })

  it('idles when the player is dead', () => {
    player.hp = 0
    enemy.vx = 5
    enemy.vy = 5
    meleeChase({ enemy, type: grunt, player, bus, rng: createRng(0), dt: 1 / 60, projectiles })
    expect(enemy.vx).toBe(0)
    expect(enemy.vy).toBe(0)
    expect(enemy.attackTimer).toBe(0)
  })
})
