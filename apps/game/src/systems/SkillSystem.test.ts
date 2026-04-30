// @vitest-environment node
import { createRng } from '@stick/sim'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEventBus, type EventBus } from '../app/eventBus'
import { createRunState, type RunState } from '../core/runState'
import { createPlayer, type Player } from '../entities/Player'
// Side-effect: register the real skills (Dash, KiBlast, etc).
import '../skills'
import type { SkillContext } from '../skills/Skill'

import { SkillSystem } from './SkillSystem'

describe('SkillSystem', () => {
  let bus: EventBus
  let runState: RunState
  let player: Player
  let sys: SkillSystem

  const ctx = (): SkillContext => ({
    player,
    enemies: [],
    bus,
    rng: createRng(0),
    scene: {} as never,
    runState,
    dmgMul: 1,
  })

  beforeEach(() => {
    bus = createEventBus()
    runState = createRunState({ seed: 1, playerMaxHp: 100 })
    player = createPlayer({ x: 0, y: 0 })
    sys = new SkillSystem({ bus })
  })

  afterEach(() => bus.clear())

  it('casts an active skill (dash) and applies its cooldown', () => {
    const handler = vi.fn()
    bus.on('skill:cast', handler)
    const ok = sys.cast({ slot: 0, skillId: 'dash', cdMul: 1, ctx: ctx() })
    expect(ok).toBe(true)
    expect(player.dashTimer).toBeGreaterThan(0)
    expect(sys.getCooldown(0)).toBeGreaterThan(0)
    expect(handler).toHaveBeenCalledWith({ skillId: 'dash', slot: 0 })
  })

  it('refuses to cast while on cooldown', () => {
    sys.cast({ slot: 0, skillId: 'dash', cdMul: 1, ctx: ctx() })
    const second = sys.cast({ slot: 0, skillId: 'dash', cdMul: 1, ctx: ctx() })
    expect(second).toBe(false)
  })

  it('decrements cooldowns over time', () => {
    sys.cast({ slot: 0, skillId: 'dash', cdMul: 1, ctx: ctx() })
    const cd0 = sys.getCooldown(0)
    sys.update(runState, 1)
    expect(sys.getCooldown(0)).toBeCloseTo(cd0 - 1, 5)
  })

  it('cdMul shortens the applied cooldown (cdReduce passive)', () => {
    sys.cast({ slot: 0, skillId: 'dash', cdMul: 0.75, ctx: ctx() })
    expect(sys.getCooldown(0)).toBeCloseTo(8 * 0.75, 5) // dash baseCooldown 8s
  })

  it('refuses passive skills', () => {
    const ok = sys.cast({ slot: 0, skillId: 'shield', cdMul: 1, ctx: ctx() })
    expect(ok).toBe(false)
  })

  it('refuses an unknown skill id', () => {
    const ok = sys.cast({ slot: 0, skillId: 'nonexistent', cdMul: 1, ctx: ctx() })
    expect(ok).toBe(false)
  })

  it('refuses null/undefined skill ids', () => {
    expect(sys.cast({ slot: 0, skillId: undefined, cdMul: 1, ctx: ctx() })).toBe(false)
  })

  it('respects canExecute (heal requires hp < maxHp)', () => {
    player.hp = player.maxHp
    const blocked = sys.cast({ slot: 0, skillId: 'heal', cdMul: 1, ctx: ctx() })
    expect(blocked).toBe(false)
    player.hp = player.maxHp - 10
    const ok = sys.cast({ slot: 0, skillId: 'heal', cdMul: 1, ctx: ctx() })
    expect(ok).toBe(true)
  })

  it('emits skill:cooldown:changed on cast and on each update tick', () => {
    const handler = vi.fn()
    bus.on('skill:cooldown:changed', handler)
    sys.cast({ slot: 0, skillId: 'dash', cdMul: 1, ctx: ctx() })
    expect(handler).toHaveBeenCalled()
    handler.mockClear()
    sys.update(runState, 0.5)
    expect(handler).toHaveBeenCalled()
  })
})
