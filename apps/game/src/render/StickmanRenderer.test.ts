// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  chopSwingCurve,
  kickLegPhase,
  slashLSwingCurve,
  slashRSwingCurve,
  spinSwingCurve,
  uppercutSwingCurve,
} from './StickmanRenderer'

describe('attack swing curves', () => {
  describe('slashRSwingCurve', () => {
    it('starts in the windup region (negative)', () => {
      expect(slashRSwingCurve(0)).toBeCloseTo(-1.4, 5)
    })
    it('peaks during the strike phase', () => {
      expect(slashRSwingCurve(0.7)).toBeCloseTo(1.3, 5)
    })
    it('returns to neutral at the end', () => {
      expect(slashRSwingCurve(1)).toBeCloseTo(0, 5)
    })
  })

  describe('slashLSwingCurve', () => {
    it('is the negation of slashR for any progress', () => {
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        expect(slashLSwingCurve(p)).toBeCloseTo(-slashRSwingCurve(p), 5)
      }
    })
  })

  describe('chopSwingCurve', () => {
    it('starts high (large negative) for the windup', () => {
      expect(chopSwingCurve(0)).toBeCloseTo(-1.6, 5)
    })
    it('crosses through zero during the strike', () => {
      // chop strikes from -1.9 to +1.6 in [0.35, 0.65]
      const before = chopSwingCurve(0.4)
      const after = chopSwingCurve(0.6)
      expect(before).toBeLessThan(0)
      expect(after).toBeGreaterThan(0)
    })
  })

  describe('uppercutSwingCurve', () => {
    it('starts near +1.4 (low/back) and ends near -1.2 (high/front)', () => {
      expect(uppercutSwingCurve(0)).toBeCloseTo(1.4, 5)
      expect(uppercutSwingCurve(1)).toBeCloseTo(-1.2, 5)
    })
  })

  describe('spinSwingCurve', () => {
    it('rotates the full 4π over the duration', () => {
      const start = spinSwingCurve(0)
      const end = spinSwingCurve(1)
      expect(end - start).toBeCloseTo(Math.PI * 4, 5)
    })
  })

  describe('kickLegPhase', () => {
    it('peaks at the extension phase (~0.6)', () => {
      const peak = kickLegPhase(0.6)
      const start = kickLegPhase(0)
      const end = kickLegPhase(1)
      expect(peak).toBeGreaterThan(start)
      expect(peak).toBeGreaterThan(end)
    })
    it('returns to ~0 at progress=1 (recover)', () => {
      expect(kickLegPhase(1)).toBeCloseTo(0, 5)
    })
  })
})
