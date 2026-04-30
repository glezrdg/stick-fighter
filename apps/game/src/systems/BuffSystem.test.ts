// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { emptyRunBuffs } from '../core/runState'

import { BuffSystem } from './BuffSystem'

const baseInputs = {
  ownedSkills: [] as string[],
  runBuffs: emptyRunBuffs(),
  equippedWeaponId: 'katana',
  weaponLevel: 1,
}

describe('BuffSystem.computeStats', () => {
  it('produces sensible defaults for an empty loadout', () => {
    const s = BuffSystem.computeStats(baseInputs)
    expect(s.maxHp).toBe(100)
    expect(s.dmgMul).toBe(1) // katana dmg=1, level=1, no buffs
    expect(s.goldMul).toBe(1)
    expect(s.cdMul).toBe(1)
    expect(s.regenPerSec).toBe(0)
    expect(s.critChance).toBeCloseTo(0.05, 5)
    expect(s.critMul).toBe(2)
    expect(s.knockbackMul).toBe(1)
    expect(s.atkSpeedMul).toBe(1)
  })

  it('shield passive adds +30 HP', () => {
    const s = BuffSystem.computeStats({ ...baseInputs, ownedSkills: ['shield'] })
    expect(s.maxHp).toBe(130)
  })

  it('golden passive multiplies gold by 1.5', () => {
    const s = BuffSystem.computeStats({ ...baseInputs, ownedSkills: ['golden'] })
    expect(s.goldMul).toBe(1.5)
  })

  it('cdReduce passive sets cdMul to 0.75', () => {
    const s = BuffSystem.computeStats({ ...baseInputs, ownedSkills: ['cdReduce'] })
    expect(s.cdMul).toBe(0.75)
  })

  it('weapon damage multiplies dmgMul', () => {
    const s = BuffSystem.computeStats({ ...baseInputs, equippedWeaponId: 'hammer' })
    expect(s.dmgMul).toBe(1.6) // hammer dmg=1.6 at level 1
  })

  it('weapon level adds 15% per level above 1', () => {
    const s = BuffSystem.computeStats({ ...baseInputs, weaponLevel: 3 })
    // katana 1.0 * (1 + 2*0.15) = 1.30
    expect(s.dmgMul).toBeCloseTo(1.3, 5)
  })

  it('runBuffs.dmg compounds with weapon damage multiplicatively', () => {
    const s = BuffSystem.computeStats({
      ...baseInputs,
      runBuffs: { ...emptyRunBuffs(), dmg: 0.25 },
    })
    expect(s.dmgMul).toBeCloseTo(1.25, 5)
  })

  it('runBuffs.hpMax adds flat HP on top of skill bonuses', () => {
    const s = BuffSystem.computeStats({
      ...baseInputs,
      ownedSkills: ['shield'],
      runBuffs: { ...emptyRunBuffs(), hpMax: 25 },
    })
    expect(s.maxHp).toBe(155) // 100 + 30 + 25
  })

  it('runBuffs.gold compounds multiplicatively with golden passive', () => {
    const s = BuffSystem.computeStats({
      ...baseInputs,
      ownedSkills: ['golden'],
      runBuffs: { ...emptyRunBuffs(), gold: 0.3 },
    })
    expect(s.goldMul).toBeCloseTo(1.5 * 1.3, 5)
  })
})

describe('BuffSystem.weaponUpgradeCost', () => {
  it('matches the legacy curve (120 * 1.6^(level-1))', () => {
    expect(BuffSystem.weaponUpgradeCost(1)).toBe(120)
    expect(BuffSystem.weaponUpgradeCost(2)).toBe(192)
    expect(BuffSystem.weaponUpgradeCost(3)).toBe(307)
  })
})
