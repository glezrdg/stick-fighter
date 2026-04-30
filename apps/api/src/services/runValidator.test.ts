// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { validateRun } from './runValidator'

const baseReport = {
  seed: 12345,
  wave: 3,
  kills: 20,
  gold: 200,
  durationSec: 30,
  weapon: 'katana',
  buffs: {},
  reason: 'death' as const,
}

describe('validateRun', () => {
  it('accepts a plausible run', () => {
    expect(validateRun(baseReport)).toBeNull()
  })

  it('rejects wave out of range (too high)', () => {
    expect(validateRun({ ...baseReport, wave: 999 })).toMatch(/wave/)
  })

  it('rejects wave 0', () => {
    expect(validateRun({ ...baseReport, wave: 0 })).toMatch(/wave/)
  })

  it('rejects too many kills for wave', () => {
    expect(validateRun({ ...baseReport, wave: 1, kills: 100 })).toMatch(/kills/)
  })

  it('rejects too short duration', () => {
    expect(validateRun({ ...baseReport, wave: 10, durationSec: 5 })).toMatch(/duration/)
  })

  it('rejects implausible gold/kill ratio', () => {
    expect(validateRun({ ...baseReport, kills: 1, gold: 999 })).toMatch(/gold/)
  })

  it('rejects negative metrics', () => {
    expect(validateRun({ ...baseReport, kills: -1 })).toMatch(/negative/)
  })
})
