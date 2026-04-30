import { describe, expect, it } from 'vitest'

import { HIT_STOP_CAP_SEC, HIT_STOP_THROTTLE_SEC, requestHitStop, tickHitStop } from './hitStop'

describe('hitStop helper', () => {
  it('applies the requested freeze when no cooldown is active', () => {
    const state = { hitStop: 0, cooldown: 0 }
    expect(requestHitStop(state, 0.06)).toBe(true)
    expect(state.hitStop).toBe(0.06)
    expect(state.cooldown).toBe(HIT_STOP_THROTTLE_SEC)
  })

  it('drops requests landing inside the throttle window', () => {
    const state = { hitStop: 0, cooldown: 0 }
    requestHitStop(state, 0.06) // accepted
    const before = state.hitStop
    expect(requestHitStop(state, 0.1)).toBe(false)
    expect(state.hitStop).toBe(before) // unchanged
  })

  it('caps freeze duration at HIT_STOP_CAP_SEC', () => {
    const state = { hitStop: 0, cooldown: 0 }
    requestHitStop(state, 1.0) // way over the cap
    expect(state.hitStop).toBe(HIT_STOP_CAP_SEC)
  })

  it('keeps the larger of (current freeze, requested) before capping', () => {
    const state = { hitStop: 0.12, cooldown: 0 } // already 120ms
    requestHitStop(state, 0.05) // weaker request
    expect(state.hitStop).toBe(0.12) // not reduced
  })

  it('decays both timers on tick', () => {
    const state = { hitStop: 0.1, cooldown: HIT_STOP_THROTTLE_SEC }
    tickHitStop(state, 0.04)
    expect(state.hitStop).toBeCloseTo(0.06, 5)
    expect(state.cooldown).toBeCloseTo(HIT_STOP_THROTTLE_SEC - 0.04, 5)
  })

  it('clamps timers at 0 (never negative)', () => {
    const state = { hitStop: 0.02, cooldown: 0.01 }
    tickHitStop(state, 0.5)
    expect(state.hitStop).toBe(0)
    expect(state.cooldown).toBe(0)
  })

  it('lets a new freeze land after the throttle expires', () => {
    const state = { hitStop: 0, cooldown: 0 }
    requestHitStop(state, 0.05)
    // Drain the throttle
    tickHitStop(state, HIT_STOP_THROTTLE_SEC + 0.01)
    expect(requestHitStop(state, 0.05)).toBe(true)
  })

  it('AOE simulation: 10 hits same frame produce a single freeze, not 10', () => {
    const state = { hitStop: 0, cooldown: 0 }
    let applied = 0
    for (let i = 0; i < 10; i++) {
      if (requestHitStop(state, 0.05)) applied++
    }
    expect(applied).toBe(1)
    expect(state.hitStop).toBeLessThanOrEqual(HIT_STOP_CAP_SEC)
  })
})
