// @vitest-environment node
import { createRng } from '@stick/sim'
import { describe, expect, it } from 'vitest'

import { ParticleSystem } from './ParticleSystem'

describe('ParticleSystem', () => {
  it('spawns blood particles with the requested count', () => {
    const sys = new ParticleSystem({ rng: createRng(1) })
    sys.spawnBlood(0, 0, 1, 0, 14)
    expect(sys.getAll().length).toBe(14)
  })

  it('aura burst spawns the requested count', () => {
    const sys = new ParticleSystem({ rng: createRng(1) })
    sys.spawnAuraBurst(0, 0, 0xffd54a, 30)
    expect(sys.getAll().length).toBe(30)
  })

  it('caps total particles at 220 (FIFO eviction)', () => {
    const sys = new ParticleSystem({ rng: createRng(1) })
    for (let i = 0; i < 30; i++) sys.spawnBlood(0, 0, 1, 0, 14)
    expect(sys.getAll().length).toBeLessThanOrEqual(220)
  })

  it('reaps particles whose life expires', () => {
    const sys = new ParticleSystem({ rng: createRng(1) })
    sys.spawnBlood(0, 0, 1, 0, 4)
    sys.update(2) // longer than max life
    expect(sys.getAll().length).toBe(0)
  })

  it('applies gravity to vy each tick', () => {
    const sys = new ParticleSystem({ rng: createRng(1) })
    sys.spawnBlood(0, 0, 0, -100, 1) // straight up
    const before = sys.getAll()[0]!.vy
    sys.update(1 / 60)
    const after = sys.getAll()[0]!.vy
    expect(after).toBeGreaterThan(before)
  })

  it('clear() empties the buffer', () => {
    const sys = new ParticleSystem({ rng: createRng(1) })
    sys.spawnBlood(0, 0, 1, 0, 5)
    sys.clear()
    expect(sys.getAll().length).toBe(0)
  })

  it('is reproducible from same seed', () => {
    const a = new ParticleSystem({ rng: createRng(7) })
    const b = new ParticleSystem({ rng: createRng(7) })
    a.spawnSlashFx(10, 10, 1, 0)
    b.spawnSlashFx(10, 10, 1, 0)
    const sigA = a.getAll().map((p) => `${p.vx.toFixed(2)},${p.vy.toFixed(2)}`)
    const sigB = b.getAll().map((p) => `${p.vx.toFixed(2)},${p.vy.toFixed(2)}`)
    expect(sigA).toEqual(sigB)
  })
})
