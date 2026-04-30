// @vitest-environment node
import { createRng } from '@stick/sim'
import { describe, expect, it } from 'vitest'

import { createRunState } from '../core/runState'
import { createPlayer } from '../entities/Player'

import { WaveBuffSystem } from './WaveBuffSystem'

describe('WaveBuffSystem', () => {
  describe('rollOffer', () => {
    it('returns N distinct buffs when N <= catalog size', () => {
      const rng = createRng(1)
      const offer = WaveBuffSystem.rollOffer(rng, 3)
      expect(offer).toHaveLength(3)
      const ids = offer.map((b) => b.id)
      expect(new Set(ids).size).toBe(3)
    })

    it('is reproducible from the same seed', () => {
      const a = WaveBuffSystem.rollOffer(createRng(42), 3)
      const b = WaveBuffSystem.rollOffer(createRng(42), 3)
      expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id))
    })

    it('caps at catalog size when N is larger', () => {
      const offer = WaveBuffSystem.rollOffer(createRng(1), 100)
      expect(offer).toHaveLength(8) // matches the 8 entries in waveBuffs.json
    })
  })

  describe('apply', () => {
    it('dmg buff adds to RunBuffs.dmg', () => {
      const runState = createRunState({ seed: 1, playerMaxHp: 100 })
      const player = createPlayer({ x: 0, y: 0 })
      WaveBuffSystem.apply('filoAfilado', runState, player)
      expect(runState.runBuffs.dmg).toBeCloseTo(0.25, 5)
    })

    it('hpMax buff increases maxHp AND heals that amount', () => {
      const runState = createRunState({ seed: 1, playerMaxHp: 100 })
      const player = createPlayer({ x: 0, y: 0, maxHp: 100 })
      player.hp = 40
      WaveBuffSystem.apply('pielDura', runState, player)
      expect(player.maxHp).toBe(125)
      expect(runState.playerMaxHp).toBe(125)
      expect(player.hp).toBe(65) // 40 + 25
      expect(runState.runBuffs.hpMax).toBe(25)
    })

    it('hpMax buff caps the heal at the new maxHp', () => {
      const runState = createRunState({ seed: 1, playerMaxHp: 100 })
      const player = createPlayer({ x: 0, y: 0, maxHp: 100 })
      player.hp = 110 // somehow at max
      WaveBuffSystem.apply('pielDura', runState, player)
      expect(player.maxHp).toBe(125)
      expect(player.hp).toBe(125) // capped at new max (110+25=135 → clamped)
    })

    it('heal buff sets HP to maxHp without changing maxHp', () => {
      const runState = createRunState({ seed: 1, playerMaxHp: 100 })
      const player = createPlayer({ x: 0, y: 0, maxHp: 100 })
      player.hp = 10
      WaveBuffSystem.apply('banquete', runState, player)
      expect(player.hp).toBe(100)
      expect(player.maxHp).toBe(100)
    })

    it('regen buff adds to RunBuffs.regen', () => {
      const runState = createRunState({ seed: 1, playerMaxHp: 100 })
      const player = createPlayer({ x: 0, y: 0 })
      WaveBuffSystem.apply('regen', runState, player)
      expect(runState.runBuffs.regen).toBe(1)
    })

    it('stacks the same buff if applied twice', () => {
      const runState = createRunState({ seed: 1, playerMaxHp: 100 })
      const player = createPlayer({ x: 0, y: 0 })
      WaveBuffSystem.apply('codicia', runState, player)
      WaveBuffSystem.apply('codicia', runState, player)
      expect(runState.runBuffs.gold).toBeCloseTo(0.6, 5)
    })

    it('throws on unknown buff id', () => {
      const runState = createRunState({ seed: 1, playerMaxHp: 100 })
      const player = createPlayer({ x: 0, y: 0 })
      expect(() => WaveBuffSystem.apply('nope', runState, player)).toThrow()
    })
  })
})
