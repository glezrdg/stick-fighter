// @vitest-environment node
import { createRng } from '@stick/sim'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEventBus, type EventBus } from '../app/eventBus'
import { _resetEnemyIdsForTest } from '../entities/Enemy'

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

  it('emits wave:start when startNextWave() is called', () => {
    const handler = vi.fn()
    bus.on('wave:start', handler)
    waves.startNextWave()
    expect(handler).toHaveBeenCalledWith({ wave: 1, totalEnemies: 5 })
  })

  it('spawns the configured number of enemies over the spawn interval', () => {
    waves.startNextWave()
    // Advance simulated time well past WAVE_SIZE * SPAWN_INTERVAL.
    waves.update(0.5) // 1 spawned (timer goes to 0 first, then 0.4)
    waves.update(2.0) // remainder spawns
    expect(waves.getEnemies().length).toBe(5)
  })

  it('emits wave:complete only after every enemy is dead', () => {
    const completeHandler = vi.fn()
    bus.on('wave:complete', completeHandler)
    waves.startNextWave()
    waves.update(3) // spawn all
    expect(waves.getEnemies().length).toBe(5)
    expect(completeHandler).not.toHaveBeenCalled()

    // Kill them and reap.
    for (const e of waves.getEnemies()) e.hp = 0
    waves.reapDead()
    waves.update(0.01) // state machine runs
    expect(completeHandler).toHaveBeenCalledWith({ wave: 1 })
  })

  it('starts wave 2 automatically after the inter-wave delay', () => {
    waves.startNextWave()
    waves.update(3)
    for (const e of waves.getEnemies()) e.hp = 0
    waves.reapDead()
    waves.update(0.01) // → wave:complete + state="between-waves"

    const wave2Handler = vi.fn()
    bus.on('wave:start', wave2Handler)
    waves.update(2.0) // > INTER_WAVE_DELAY_SEC
    expect(wave2Handler).toHaveBeenCalledWith({ wave: 2, totalEnemies: 5 })
  })

  it('places spawn points along the arena edges', () => {
    waves.startNextWave()
    waves.update(3)
    for (const e of waves.getEnemies()) {
      // Within margin of an edge.
      const onEdge = e.x <= 60 || e.x >= 1140 || e.y <= 60 || e.y >= 740 // arena 1200x800, margin 50ish
      expect(onEdge).toBe(true)
    }
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
