// @vitest-environment node
import { attackPatterns } from '@stick/content'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPlayer, type Player } from '../entities/Player'
import { createEventBus, type EventBus } from '../eventBus'

import { AUTO_AIM_RADIUS, COMBO_RESET_SEC, CombatSystem, type EnemyTarget } from './CombatSystem'

const target = (over: Partial<EnemyTarget> & Pick<EnemyTarget, 'x' | 'y' | 'hp'>): EnemyTarget => ({
  id: over.id ?? 'e1',
  hurtFlash: over.hurtFlash ?? 0,
  ...over,
})

describe('CombatSystem', () => {
  let bus: EventBus
  let player: Player
  let combat: CombatSystem

  beforeEach(() => {
    bus = createEventBus()
    player = createPlayer({ x: 0, y: 0 })
    combat = new CombatSystem({ bus, attackPatterns })
  })

  afterEach(() => bus.clear())

  it('starts attacking and sets attackTimer to the first pattern duration', () => {
    combat.tryAttack(player)
    expect(player.attackKind).toBe('slashR')
    expect(player.attackTimer).toBeGreaterThan(0)
    expect(player.attackTimer).toBeCloseTo(16 / 60, 5)
    expect(player.attackDuration).toBeCloseTo(16 / 60, 5)
    expect(player.attackStep).toBe(1) // advanced for the next swing
  })

  it('cycles through all 6 patterns then loops back to slashR', () => {
    const kinds: string[] = []
    for (let i = 0; i < 7; i++) {
      // Force previous attack to finish before next tryAttack.
      player.attackTimer = 0
      combat.tryAttack(player)
      kinds.push(player.attackKind!)
    }
    expect(kinds).toEqual(['slashR', 'slashL', 'kick', 'uppercut', 'chop', 'spin', 'slashR'])
  })

  it('ignores tryAttack while a swing is already active', () => {
    combat.tryAttack(player)
    const stepBefore = player.attackStep
    const timerBefore = player.attackTimer
    combat.tryAttack(player)
    expect(player.attackStep).toBe(stepBefore)
    expect(player.attackTimer).toBeCloseTo(timerBefore, 5)
  })

  it('clears attackKind to null when the timer reaches 0', () => {
    combat.tryAttack(player)
    combat.update(player, 1) // 1s >> any pattern duration
    expect(player.attackTimer).toBe(0)
    expect(player.attackKind).toBe(null)
  })

  it('resets the combo step to 0 if no attack lands within COMBO_RESET_SEC after the last one', () => {
    const resetHandler = vi.fn()
    bus.on('combo:reset', resetHandler)
    combat.tryAttack(player)
    expect(player.attackStep).toBe(1)

    // Finish the active swing, then idle past the combo window.
    combat.update(player, 1)
    combat.update(player, COMBO_RESET_SEC + 0.1)

    expect(player.attackStep).toBe(0)
    expect(resetHandler).toHaveBeenCalledTimes(1)
  })

  it('emits combo:advance with the new step count on each successful attack', () => {
    const advanceHandler = vi.fn()
    bus.on('combo:advance', advanceHandler)
    combat.tryAttack(player)
    expect(advanceHandler).toHaveBeenCalledWith({ count: 1 })
    player.attackTimer = 0
    combat.tryAttack(player)
    expect(advanceHandler).toHaveBeenCalledWith({ count: 2 })
  })

  it('applies a forward lunge to player velocity on attack start', () => {
    player.facingX = 1
    player.facingY = 0
    expect(player.vx).toBe(0)
    combat.tryAttack(player)
    expect(player.vx).toBeGreaterThan(0)
    expect(player.vy).toBe(0)
  })

  it('uses the nearest enemy within AUTO_AIM_RADIUS to override facing for the swing', () => {
    const enemies = [target({ x: 0, y: 100, hp: 5 })] // straight down
    player.facingX = 1
    player.facingY = 0
    const c = new CombatSystem({ bus, attackPatterns, getEnemies: () => enemies })
    c.tryAttack(player)
    // facing should snap toward (0,1), the direction of the enemy.
    expect(player.attackDirX).toBeCloseTo(0, 5)
    expect(player.attackDirY).toBeCloseTo(1, 5)
    expect(player.facingX).toBeCloseTo(0, 5)
    expect(player.facingY).toBeCloseTo(1, 5)
  })

  it('ignores enemies beyond AUTO_AIM_RADIUS', () => {
    const enemies = [target({ x: AUTO_AIM_RADIUS + 50, y: 0, hp: 5 })]
    player.facingX = 0
    player.facingY = -1
    const c = new CombatSystem({ bus, attackPatterns, getEnemies: () => enemies })
    c.tryAttack(player)
    expect(player.attackDirX).toBeCloseTo(0, 5)
    expect(player.attackDirY).toBeCloseTo(-1, 5)
  })

  it('ignores dead enemies for auto-aim', () => {
    const enemies = [target({ x: 50, y: 0, hp: 0 })] // dead and very close
    player.facingX = -1
    player.facingY = 0
    const c = new CombatSystem({ bus, attackPatterns, getEnemies: () => enemies })
    c.tryAttack(player)
    expect(player.attackDirX).toBeCloseTo(-1, 5)
  })

  // ---- Hit resolution -------------------------------------------

  it('damages an enemy in front and within reach', () => {
    const enemy = target({ id: 'e7', x: 80, y: 0, hp: 5 })
    const c = new CombatSystem({ bus, attackPatterns, getEnemies: () => [enemy] })
    player.facingX = 1
    c.tryAttack(player)
    expect(enemy.hp).toBeLessThan(5)
    expect(enemy.hurtFlash).toBeGreaterThan(0)
  })

  it('emits combat:hit and enemy:death when the killing blow lands', () => {
    const hitHandler = vi.fn()
    const deathHandler = vi.fn()
    bus.on('combat:hit', hitHandler)
    bus.on('enemy:death', deathHandler)
    const enemy = target({ id: 'e9', x: 60, y: 0, hp: 1 })
    const c = new CombatSystem({ bus, attackPatterns, getEnemies: () => [enemy] })
    player.facingX = 1
    c.tryAttack(player)
    expect(hitHandler).toHaveBeenCalledWith(
      expect.objectContaining({ attackerId: 'player', targetId: 'e9' }),
    )
    expect(deathHandler).toHaveBeenCalledWith({ enemyId: 'e9', byPlayer: true })
  })

  it('does NOT hit enemies behind the swing direction (cone test)', () => {
    // Front enemy will be auto-aimed; behind enemy must not be hit by slashR.
    const front = target({ id: 'ef', x: 60, y: 0, hp: 5 })
    const behind = target({ id: 'eb', x: -60, y: 0, hp: 5 })
    const c = new CombatSystem({ bus, attackPatterns, getEnemies: () => [front, behind] })
    player.facingX = 1
    c.tryAttack(player)
    expect(front.hp).toBeLessThan(5)
    expect(behind.hp).toBe(5)
  })

  it('spin pattern (`all`) hits enemies in any direction within reach', () => {
    // First cycle the combo step up to spin (the 6th).
    const front = target({ id: 'ef', x: 60, y: 0, hp: 5 })
    const behind = target({ id: 'eb', x: -60, y: 0, hp: 5 })
    const c = new CombatSystem({ bus, attackPatterns, getEnemies: () => [front, behind] })
    // Manually set step to spin so the test focuses on the AOE rule.
    player.attackStep = 5
    player.attackTimer = 0
    player.facingX = 1
    c.tryAttack(player)
    expect(front.hp).toBeLessThan(5)
    expect(behind.hp).toBeLessThan(5)
  })

  it('does NOT hit enemies beyond pattern reach', () => {
    const far = target({ id: 'ef', x: 1000, y: 0, hp: 5 })
    const c = new CombatSystem({ bus, attackPatterns, getEnemies: () => [far] })
    player.facingX = 1
    c.tryAttack(player)
    expect(far.hp).toBe(5)
  })

  // ---- Bow ----------------------------------------------------------

  describe('tryShoot (bow)', () => {
    it('fires when off cooldown and triggers onShoot with the auto-aimed direction', () => {
      const onShoot = vi.fn()
      const enemy = target({ id: 'ee', x: 300, y: 0, hp: 5 })
      const c = new CombatSystem({
        bus,
        attackPatterns,
        onShoot,
        getEnemies: () => [enemy],
      })
      const fired = c.tryShoot(player)
      expect(fired).toBe(true)
      expect(onShoot).toHaveBeenCalledTimes(1)
      const call = onShoot.mock.calls[0]?.[0] as { dirX: number; dirY: number }
      expect(call.dirX).toBeCloseTo(1, 5)
      expect(call.dirY).toBeCloseTo(0, 5)
      expect(player.bowCooldown).toBeGreaterThan(0)
      expect(player.bowTimer).toBeGreaterThan(0)
    })

    it('returns false and does not call onShoot while bow is on cooldown', () => {
      const onShoot = vi.fn()
      const c = new CombatSystem({ bus, attackPatterns, onShoot })
      c.tryShoot(player)
      onShoot.mockClear()
      const fired = c.tryShoot(player)
      expect(fired).toBe(false)
      expect(onShoot).not.toHaveBeenCalled()
    })

    it('cannot shoot while in the middle of a melee swing', () => {
      const onShoot = vi.fn()
      const c = new CombatSystem({ bus, attackPatterns, onShoot })
      c.tryAttack(player)
      onShoot.mockClear()
      const fired = c.tryShoot(player)
      expect(fired).toBe(false)
      expect(onShoot).not.toHaveBeenCalled()
    })

    it('uses BOW_AUTO_AIM_RADIUS to find targets beyond melee aim range', () => {
      const onShoot = vi.fn()
      // Enemy at 500px — outside AUTO_AIM_RADIUS (220) but inside BOW_AUTO_AIM_RADIUS (600).
      const far = target({ id: 'ef', x: 500, y: 0, hp: 5 })
      const c = new CombatSystem({
        bus,
        attackPatterns,
        onShoot,
        getEnemies: () => [far],
      })
      c.tryShoot(player)
      const call = onShoot.mock.calls[0]?.[0] as { dirX: number }
      expect(call.dirX).toBeCloseTo(1, 5) // aimed at the far enemy
    })

    it('decays bowCooldown and bowTimer in update', () => {
      const c = new CombatSystem({ bus, attackPatterns })
      c.tryShoot(player)
      const cd0 = player.bowCooldown
      const t0 = player.bowTimer
      c.update(player, 0.1)
      expect(player.bowCooldown).toBeLessThan(cd0)
      expect(player.bowTimer).toBeLessThan(t0)
    })
  })
})
