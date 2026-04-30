import { afterEach, describe, expect, it } from 'vitest'

import { _resetForTest, all, get, passivesOwned, register, tryGet } from './registry'
import type { Skill } from './Skill'

const dummyActive: Skill = {
  id: 'test-active',
  kind: 'active',
  name: 'Test',
  desc: '',
  cost: 100,
  baseCooldown: 1,
  execute() {},
}

const dummyPassive: Skill = {
  id: 'test-passive',
  kind: 'passive',
  name: 'Test Passive',
  desc: '',
  cost: 200,
  modifiers: { dmgMul: 1.1 },
}

describe('skills registry', () => {
  afterEach(() => _resetForTest())

  it('registers and retrieves a skill', () => {
    register(dummyActive)
    expect(get('test-active')).toBe(dummyActive)
  })

  it('throws on unknown id from get()', () => {
    expect(() => get('nonexistent')).toThrow(/unknown/i)
  })

  it('returns undefined from tryGet() on unknown id', () => {
    expect(tryGet('nonexistent')).toBeUndefined()
  })

  it('throws on duplicate registration', () => {
    register(dummyActive)
    expect(() => register(dummyActive)).toThrow(/duplicate/i)
  })

  it('all() returns every registered skill in registration order', () => {
    register(dummyActive)
    register(dummyPassive)
    expect(all().map((s) => s.id)).toEqual(['test-active', 'test-passive'])
  })

  it('passivesOwned() returns only owned passives, ignoring actives and unknowns', () => {
    register(dummyActive)
    register(dummyPassive)
    const owned = passivesOwned(['test-active', 'test-passive', 'unknown'])
    expect(owned).toEqual([dummyPassive])
  })
})

// Smoke test that loading the side-effect index registers Dash.
describe('skills/index side-effect imports', () => {
  it('registers Dash', async () => {
    _resetForTest()
    await import('./index')
    expect(tryGet('dash')?.kind).toBe('active')
  })
})
