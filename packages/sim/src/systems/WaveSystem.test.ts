// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetEnemyIdsForTest } from '../entities/Enemy'
import { createEventBus, type EventBus } from '../eventBus'
import { createRng } from '../rng'

import { WaveSystem } from './WaveSystem'

describe('WaveSystem', () => {
  let bus: EventBus
  let waves: WaveSystem

  beforeEach(() => {
    _resetEnemyIdsForTest()
    bus = createEventBus()
    waves = new WaveSystem({ bus, rng: createRng(42) })
  })

  afterEach(() => bus.clear())

  it('emits wave:start with the formula-driven totalEnemies', () => {
    const handler = vi.fn()
    bus.on('wave:start', handler)
    waves.startNextWave()
    // Wave 1: 5 + floor(1*2.5) + floor(1/2) = 5 + 2 + 0 = 7
    expect(handler).toHaveBeenCalledWith({ wave: 1, totalEnemies: 7 })
  })

  it('spawns the wave-formula number of enemies over the spawn interval', () => {
    waves.startNextWave()
    waves.update(10) // plenty of time for all 7 spawns
    expect(waves.getEnemies().length).toBe(7)
  })

  it('emits wave:complete only after every enemy is dead', () => {
    const completeHandler = vi.fn()
    bus.on('wave:complete', completeHandler)
    waves.startNextWave()
    waves.update(10) // spawn all
    expect(waves.getEnemies().length).toBe(7)
    expect(completeHandler).not.toHaveBeenCalled()

    for (const e of waves.getEnemies()) e.hp = 0
    waves.reapDead()
    waves.update(0.01)
    expect(completeHandler).toHaveBeenCalledWith({ wave: 1 })
  })

  it('starts wave 2 automatically after the inter-wave delay', () => {
    waves.startNextWave()
    waves.update(10)
    for (const e of waves.getEnemies()) e.hp = 0
    waves.reapDead()
    waves.update(0.01)

    const wave2Handler = vi.fn()
    bus.on('wave:start', wave2Handler)
    waves.update(2.0)
    // Wave 2: 5 + floor(2*2.5) + floor(2/2) = 5 + 5 + 1 = 11
    expect(wave2Handler).toHaveBeenCalledWith({ wave: 2, totalEnemies: 11 })
  })

  it('places spawn points along the arena edges', () => {
    waves.startNextWave()
    waves.update(10)
    for (const e of waves.getEnemies()) {
      const onEdge = e.x <= 60 || e.x >= 1140 || e.y <= 60 || e.y >= 740
      expect(onEdge).toBe(true)
    }
  })

  it('spawns a boss as the first enemy of every fifth wave', () => {
    // Skip ahead to wave 5 by completing waves 1-4 instantly.
    for (let w = 1; w <= 4; w++) {
      waves.startNextWave()
      waves.update(10)
      for (const e of waves.getEnemies()) e.hp = 0
      waves.reapDead()
    }
    // Now start wave 5.
    waves.startNextWave()
    waves.update(0.5) // first spawn
    expect(waves.getEnemies()[0]!.typeId).toBe('boss')
  })

  it('uses the seeded RNG so spawns are reproducible by seed', () => {
    const a = new WaveSystem({ bus: createEventBus(), rng: createRng(7) })
    const b = new WaveSystem({ bus: createEventBus(), rng: createRng(7) })
    a.startNextWave()
    b.startNextWave()
    a.update(3)
    b.update(3)
    const ax = a.getEnemies().map((e) => `${e.x.toFixed(2)},${e.y.toFixed(2)}`)
    const bx = b.getEnemies().map((e) => `${e.x.toFixed(2)},${e.y.toFixed(2)}`)
    expect(ax).toEqual(bx)
  })
})
