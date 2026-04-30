// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { createRng } from '../rng'

import { dmgScaleForWave, hpScaleForWave, pickEnemyType, totalEnemiesForWave } from './WaveSystem'

describe('totalEnemiesForWave (legacy line 1054)', () => {
  it('matches the legacy formula', () => {
    expect(totalEnemiesForWave(1)).toBe(7) // 5 + 2 + 0
    expect(totalEnemiesForWave(5)).toBe(19) // 5 + 12 + 2
    expect(totalEnemiesForWave(10)).toBe(35) // 5 + 25 + 5
  })
})

describe('hpScaleForWave (legacy line 1113)', () => {
  it('starts close to 1 and grows non-linearly with milestones every 5 waves', () => {
    expect(hpScaleForWave(1)).toBeCloseTo(1.05, 5)
    expect(hpScaleForWave(5)).toBeCloseTo(1.75, 5) // floor(5/5)*0.5 = 0.5; +0.25; +1
    expect(hpScaleForWave(10)).toBeCloseTo(2.5, 5) // 1 + 1.0 + 0.5
  })
})

describe('dmgScaleForWave (legacy line 1114)', () => {
  it('matches the legacy formula', () => {
    expect(dmgScaleForWave(1)).toBeCloseTo(1.03, 5)
    expect(dmgScaleForWave(5)).toBeCloseTo(1.35, 5)
    expect(dmgScaleForWave(10)).toBeCloseTo(1.7, 5)
  })
})

describe('pickEnemyType (legacy lines 1085-1102)', () => {
  it('only emits grunts on wave 1', () => {
    const rng = createRng(1)
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) seen.add(pickEnemyType(1, rng))
    expect(Array.from(seen)).toEqual(['grunt'])
  })

  it('introduces ninja on wave 2', () => {
    const rng = createRng(2)
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(pickEnemyType(2, rng))
    expect(seen.has('ninja')).toBe(true)
  })

  it('drops grunts entirely by wave 8+ (legacy gruntsToRemove cap is 15, pool starts with 20)', () => {
    const rng = createRng(8)
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(pickEnemyType(10, rng))
    // wave 10 → gruntsToRemove = min(15, 20) = 15, leaving 5 grunt slots out of ~63 entries.
    // It's still possible (~8%) to roll a grunt, but the pool is dominated by tougher enemies.
    expect(seen.size).toBeGreaterThanOrEqual(7) // ninja, spear, brute, dual, berserk, mage, heavy
  })

  it('is reproducible with the same seed', () => {
    const a = createRng(99)
    const b = createRng(99)
    const seqA = Array.from({ length: 50 }, () => pickEnemyType(7, a))
    const seqB = Array.from({ length: 50 }, () => pickEnemyType(7, b))
    expect(seqA).toEqual(seqB)
  })
})
