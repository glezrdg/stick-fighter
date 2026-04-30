// @vitest-environment node
import { attackPatterns } from '@stick/content'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEventBus, type EventBus } from '../app/eventBus'
import { createPlayer, type Player } from '../entities/Player'

import { AUTO_AIM_RADIUS, COMBO_RESET_SEC, CombatSystem } from './CombatSystem'

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
    const enemies = [{ x: 0, y: 100, hp: 5 }] // straight down
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
    const enemies = [{ x: AUTO_AIM_RADIUS + 50, y: 0, hp: 5 }]
    player.facingX = 0
    player.facingY = -1
    const c = new CombatSystem({ bus, attackPatterns, getEnemies: () => enemies })
    c.tryAttack(player)
    expect(player.attackDirX).toBeCloseTo(0, 5)
    expect(player.attackDirY).toBeCloseTo(-1, 5)
  })

  it('ignores dead enemies for auto-aim', () => {
    const enemies = [{ x: 50, y: 0, hp: 0 }] // dead and very close
    player.facingX = -1
    player.facingY = 0
    const c = new CombatSystem({ bus, attackPatterns, getEnemies: () => enemies })
    c.tryAttack(player)
    expect(player.attackDirX).toBeCloseTo(-1, 5)
  })
})
