// @vitest-environment node
import { getEnemyType } from '@stick/content'
import { createRng } from '@stick/sim'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createEventBus, type EventBus } from '../app/eventBus'
import { _resetEnemyIdsForTest, createEnemy, type Enemy } from '../entities/Enemy'
import { _resetObstacleIdsForTest, createObstacle } from '../entities/Obstacle'
import { type Player, createPlayer } from '../entities/Player'

import { EXPLOSION_DMG_TO_ENEMIES, EXPLOSION_DMG_TO_PLAYER, ObstacleSystem } from './ObstacleSystem'

describe('ObstacleSystem', () => {
  let bus: EventBus
  let sys: ObstacleSystem
  let player: Player

  beforeEach(() => {
    _resetEnemyIdsForTest()
    _resetObstacleIdsForTest()
    bus = createEventBus()
    sys = new ObstacleSystem({ bus, rng: createRng(1) })
    player = createPlayer({ x: 600, y: 400, maxHp: 100 })
  })

  describe('generate', () => {
    it('places at most `count` obstacles', () => {
      sys.generate(7)
      expect(sys.getAll().length).toBeLessThanOrEqual(7)
    })

    it('keeps obstacles >= 120px from arena center (player spawn)', () => {
      sys.generate(7)
      const cx = 600
      const cy = 400
      for (const o of sys.getAll()) {
        expect(Math.hypot(o.x - cx, o.y - cy)).toBeGreaterThanOrEqual(120)
      }
    })

    it('reproducible from same seed', () => {
      const a = new ObstacleSystem({ bus: createEventBus(), rng: createRng(7) })
      const b = new ObstacleSystem({ bus: createEventBus(), rng: createRng(7) })
      a.generate(7)
      b.generate(7)
      expect(a.getAll().map((o) => `${o.type}@${o.x.toFixed(1)},${o.y.toFixed(1)}`)).toEqual(
        b.getAll().map((o) => `${o.type}@${o.x.toFixed(1)},${o.y.toFixed(1)}`),
      )
    })
  })

  describe('hit', () => {
    it('reduces HP and sets hitFlash on a destructible obstacle', () => {
      const o = createObstacle({ type: 'crate', x: 100, y: 100 })
      sys['obstacles'].push(o)
      sys.hit(o, { enemies: [], player })
      expect(o.hp).toBe(2)
      expect(o.hitFlash).toBeGreaterThan(0)
    })

    it('does NOT reduce HP on indestructible columns', () => {
      const col = createObstacle({ type: 'column', x: 100, y: 100 })
      sys['obstacles'].push(col)
      sys.hit(col, { enemies: [], player })
      expect(col.hp).toBe(3)
    })

    it('explodes the obstacle when HP reaches 0', () => {
      const o = createObstacle({ type: 'barrel', x: 100, y: 100 })
      sys['obstacles'].push(o)
      sys.hit(o, { enemies: [], player })
      sys.hit(o, { enemies: [], player })
      const exploded = sys.hit(o, { enemies: [], player })
      expect(exploded).toBe(true)
      expect(sys.getAll().length).toBe(0)
    })

    it('explosion damages nearby enemies', () => {
      const e: Enemy = createEnemy({ type: getEnemyType('grunt'), x: 130, y: 100, hp: 10 })
      const o = createObstacle({ type: 'barrel', x: 100, y: 100 })
      sys['obstacles'].push(o)
      sys.hit(o, { enemies: [e], player })
      sys.hit(o, { enemies: [e], player })
      sys.hit(o, { enemies: [e], player })
      expect(e.hp).toBe(10 - EXPLOSION_DMG_TO_ENEMIES)
    })

    it('explosion damages the player if in radius', () => {
      const o = createObstacle({ type: 'barrel', x: player.x + 50, y: player.y })
      sys['obstacles'].push(o)
      sys.hit(o, { enemies: [], player })
      sys.hit(o, { enemies: [], player })
      sys.hit(o, { enemies: [], player })
      expect(player.hp).toBe(100 - EXPLOSION_DMG_TO_PLAYER)
    })

    it('explosion does NOT damage the player out of radius', () => {
      const o = createObstacle({ type: 'barrel', x: player.x + 200, y: player.y })
      sys['obstacles'].push(o)
      sys.hit(o, { enemies: [], player })
      sys.hit(o, { enemies: [], player })
      sys.hit(o, { enemies: [], player })
      expect(player.hp).toBe(100)
    })

    it('emits obstacle:explode event on detonation', () => {
      const handler = vi.fn()
      bus.on('obstacle:explode', handler)
      const o = createObstacle({ type: 'crate', x: 100, y: 100 })
      sys['obstacles'].push(o)
      sys.hit(o, { enemies: [], player })
      sys.hit(o, { enemies: [], player })
      sys.hit(o, { enemies: [], player })
      expect(handler).toHaveBeenCalledWith({ x: 100, y: 100, type: 'crate' })
    })
  })

  describe('resolveCollision', () => {
    it('pushes the entity outside the obstacle radius', () => {
      const o = createObstacle({ type: 'column', x: 100, y: 100 })
      sys['obstacles'].push(o)
      const fixed = sys.resolveCollision(110, 100, 18) // overlapping
      expect(Math.hypot(fixed.x - 100, fixed.y - 100)).toBeGreaterThanOrEqual(18 + o.r - 0.001)
    })

    it('returns the input unchanged when not colliding', () => {
      const o = createObstacle({ type: 'column', x: 100, y: 100 })
      sys['obstacles'].push(o)
      const fixed = sys.resolveCollision(500, 500, 18)
      expect(fixed).toEqual({ x: 500, y: 500 })
    })
  })
})
