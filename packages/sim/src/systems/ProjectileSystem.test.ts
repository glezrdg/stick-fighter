// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPlayer, type Player } from '../entities/Player'
import { _resetProjectileIdsForTest } from '../entities/Projectile'
import { createEventBus, type EventBus } from '../eventBus'

import { ProjectileSystem } from './ProjectileSystem'

describe('ProjectileSystem', () => {
  let bus: EventBus
  let sys: ProjectileSystem
  let player: Player

  beforeEach(() => {
    _resetProjectileIdsForTest()
    bus = createEventBus()
    sys = new ProjectileSystem({ bus })
    player = createPlayer({ x: 600, y: 400 })
  })

  afterEach(() => bus.clear())

  it('moves a projectile in its direction over dt', () => {
    sys.spawn({
      type: 'orb',
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speed: 100,
      dmg: 5,
      life: 5,
      ownerId: 'e1',
      radius: 10,
    })
    sys.update(player, 1)
    const [p] = sys.getAll()
    expect(p!.x).toBeCloseTo(100, 5)
    expect(p!.y).toBeCloseTo(0, 5)
  })

  it('despawns when life reaches zero', () => {
    sys.spawn({
      type: 'orb',
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speed: 1,
      dmg: 5,
      life: 0.1,
      ownerId: 'e1',
      radius: 10,
    })
    sys.update(player, 0.2)
    expect(sys.getAll().length).toBe(0)
  })

  it('applies damage to the player on collision and despawns', () => {
    const handler = vi.fn()
    bus.on('player:hurt', handler)
    sys.spawn({
      type: 'orb',
      x: player.x - 1,
      y: player.y,
      dirX: 1,
      dirY: 0,
      speed: 0,
      dmg: 7,
      life: 5,
      ownerId: 'e1',
      radius: 10,
    })
    const beforeHp = player.hp
    sys.update(player, 0.016)
    expect(player.hp).toBe(beforeHp - 7)
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ dmg: 7, src: 'projectile' }))
    expect(sys.getAll().length).toBe(0)
  })

  it('respects player iframes (no double damage)', () => {
    sys.spawn({
      type: 'orb',
      x: player.x,
      y: player.y,
      dirX: 0,
      dirY: 1,
      speed: 0,
      dmg: 9,
      life: 5,
      ownerId: 'e1',
      radius: 10,
    })
    player.iframes = 1
    const beforeHp = player.hp
    sys.update(player, 0.016)
    expect(player.hp).toBe(beforeHp)
    // Projectile passes through; doesn't despawn from collision.
    expect(sys.getAll().length).toBe(1)
  })

  it('despawns projectiles that fly out of bounds', () => {
    sys.spawn({
      type: 'orb',
      x: 5000,
      y: 0,
      dirX: 1,
      dirY: 0,
      speed: 100,
      dmg: 5,
      life: 5,
      ownerId: 'e1',
      radius: 10,
    })
    sys.update(player, 0.016)
    expect(sys.getAll().length).toBe(0)
  })

  it('player-owned arrows hit enemies (not the player) and emit combat:hit', () => {
    const enemy = { id: 'e1', x: 100, y: 0, hp: 10, hurtFlash: 0 }
    const sys2 = new ProjectileSystem({ bus, getEnemies: () => [enemy] })
    const hitHandler = vi.fn()
    bus.on('combat:hit', hitHandler)
    sys2.spawn({
      type: 'arrow',
      x: enemy.x - 1,
      y: enemy.y,
      dirX: 1,
      dirY: 0,
      speed: 0,
      dmg: 7,
      life: 5,
      ownerId: 'player',
      radius: 8,
    })
    sys2.update(player, 0.016)
    expect(enemy.hp).toBe(3)
    expect(hitHandler).toHaveBeenCalledWith(
      expect.objectContaining({ attackerId: 'player', targetId: 'e1', dmg: 7 }),
    )
    expect(sys2.getAll().length).toBe(0)
  })

  it('player arrows do NOT damage the player (no friendly fire)', () => {
    const sys2 = new ProjectileSystem({ bus, getEnemies: () => [] })
    sys2.spawn({
      type: 'arrow',
      x: player.x,
      y: player.y,
      dirX: 0,
      dirY: 0,
      speed: 0,
      dmg: 50,
      life: 5,
      ownerId: 'player',
      radius: 8,
    })
    const beforeHp = player.hp
    sys2.update(player, 0.016)
    expect(player.hp).toBe(beforeHp)
  })

  it('emits enemy:death when an arrow kills', () => {
    const enemy = { id: 'eK', x: 0, y: 0, hp: 5, hurtFlash: 0 }
    const sys2 = new ProjectileSystem({ bus, getEnemies: () => [enemy] })
    const deathHandler = vi.fn()
    bus.on('enemy:death', deathHandler)
    sys2.spawn({
      type: 'arrow',
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speed: 0,
      dmg: 10,
      life: 5,
      ownerId: 'player',
      radius: 8,
    })
    sys2.update(player, 0.016)
    expect(enemy.hp).toBeLessThanOrEqual(0)
    expect(deathHandler).toHaveBeenCalledWith(
      expect.objectContaining({ enemyId: 'eK', byPlayer: true }),
    )
  })

  it('emits player:death when the killing projectile lands', () => {
    const deathHandler = vi.fn()
    bus.on('player:death', deathHandler)
    player.hp = 1
    sys.spawn({
      type: 'orb',
      x: player.x,
      y: player.y,
      dirX: 1,
      dirY: 0,
      speed: 0,
      dmg: 50,
      life: 5,
      ownerId: 'e1',
      radius: 10,
    })
    sys.update(player, 0.016)
    expect(deathHandler).toHaveBeenCalled()
  })
})
