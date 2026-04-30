import { describe, expect, it } from 'vitest'

import { createRng, timeSeed } from './rng'

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 100 }, () => a.next())
    const seqB = Array.from({ length: 100 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 50 }, () => a.next())
    const seqB = Array.from({ length: 50 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('next() output is always in [0, 1)', () => {
    const rng = createRng(123)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  describe('int', () => {
    it('returns values in [min, max)', () => {
      const rng = createRng(7)
      for (let i = 0; i < 1000; i++) {
        const v = rng.int(10, 20)
        expect(v).toBeGreaterThanOrEqual(10)
        expect(v).toBeLessThan(20)
        expect(Number.isInteger(v)).toBe(true)
      }
    })

    it('throws when max <= min', () => {
      const rng = createRng(0)
      expect(() => rng.int(5, 5)).toThrow()
      expect(() => rng.int(5, 4)).toThrow()
    })
  })

  describe('float', () => {
    it('returns values in [min, max]', () => {
      const rng = createRng(7)
      for (let i = 0; i < 1000; i++) {
        const v = rng.float(-1, 1)
        expect(v).toBeGreaterThanOrEqual(-1)
        expect(v).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('chance', () => {
    it('approximates the requested probability over many samples', () => {
      const rng = createRng(31337)
      let hits = 0
      const trials = 10_000
      for (let i = 0; i < trials; i++) if (rng.chance(0.3)) hits++
      // Allow ±1.5% tolerance for 10k samples.
      expect(hits / trials).toBeGreaterThan(0.285)
      expect(hits / trials).toBeLessThan(0.315)
    })
  })

  describe('pick', () => {
    it('returns elements from the array', () => {
      const rng = createRng(1)
      const arr = ['a', 'b', 'c', 'd'] as const
      for (let i = 0; i < 100; i++) {
        expect(arr).toContain(rng.pick(arr))
      }
    })

    it('throws on empty array', () => {
      const rng = createRng(1)
      expect(() => rng.pick([])).toThrow()
    })
  })

  describe('shuffle', () => {
    it('preserves the multiset of elements', () => {
      const rng = createRng(99)
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const shuffled = rng.shuffle([...arr])
      expect(shuffled.slice().sort((a, b) => a - b)).toEqual(arr)
    })

    it('is deterministic by seed', () => {
      const a = createRng(99)
      const b = createRng(99)
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      expect(a.shuffle([...arr])).toEqual(b.shuffle([...arr]))
    })
  })

  it('exposes the seed it was created with', () => {
    const rng = createRng(0xdeadbeef)
    expect(rng.seed).toBe(0xdeadbeef)
  })
})

describe('timeSeed', () => {
  it('returns a non-negative 32-bit integer', () => {
    const s = timeSeed()
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThan(2 ** 32)
    expect(Number.isInteger(s)).toBe(true)
  })
})
