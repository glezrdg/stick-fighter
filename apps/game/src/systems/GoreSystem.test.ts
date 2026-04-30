// @vitest-environment node
import { createRng } from '@stick/sim'
import { describe, expect, it } from 'vitest'

import { GoreSystem } from './GoreSystem'

describe('GoreSystem', () => {
  const baseKill = {
    x: 100,
    y: 100,
    color: 0x7be0c4,
    scale: 1,
    knockbackX: 1,
    knockbackY: 0,
    aliveEnemies: 3,
  }

  it('spawns 1 corpse + 6 body parts + 1 blood pool on a normal kill', () => {
    const gore = new GoreSystem({ rng: createRng(1) })
    gore.addKill(baseKill)
    expect(gore.getCorpses().length).toBe(1)
    expect(gore.getBodyParts().length).toBe(6)
    // Pool is RNG-gated under heavy load only; base case always spawns one.
    expect(gore.getBloodPools().length).toBe(1)
  })

  it('spawns fewer body parts (3) under heavy load', () => {
    const gore = new GoreSystem({ rng: createRng(1) })
    gore.addKill({ ...baseKill, aliveEnemies: 20 })
    expect(gore.getBodyParts().length).toBe(3)
  })

  it('caps corpses at the FIFO limit', () => {
    const gore = new GoreSystem({ rng: createRng(1) })
    for (let i = 0; i < 60; i++) gore.addKill(baseKill)
    expect(gore.getCorpses().length).toBe(40)
  })

  it('caps body parts at the FIFO limit', () => {
    const gore = new GoreSystem({ rng: createRng(1) })
    for (let i = 0; i < 30; i++) gore.addKill(baseKill)
    expect(gore.getBodyParts().length).toBe(80)
  })

  it('caps blood pools at the FIFO limit', () => {
    const gore = new GoreSystem({ rng: createRng(1) })
    for (let i = 0; i < 200; i++) gore.addKill(baseKill)
    expect(gore.getBloodPools().length).toBe(60)
  })

  it('addBurnedMark adds a burned pool', () => {
    const gore = new GoreSystem({ rng: createRng(1) })
    gore.addBurnedMark(50, 50)
    const pools = gore.getBloodPools()
    expect(pools.length).toBe(1)
    expect(pools[0]!.burned).toBe(true)
  })

  it('update() grounds parts once they slow down', () => {
    const gore = new GoreSystem({ rng: createRng(1) })
    gore.addKill(baseKill)
    for (let i = 0; i < 200; i++) gore.update(1 / 60) // simulate 200 frames
    const allGrounded = gore.getBodyParts().every((bp) => bp.grounded)
    expect(allGrounded).toBe(true)
  })

  it('clear() empties all buffers', () => {
    const gore = new GoreSystem({ rng: createRng(1) })
    gore.addKill(baseKill)
    gore.clear()
    expect(gore.getCorpses().length).toBe(0)
    expect(gore.getBodyParts().length).toBe(0)
    expect(gore.getBloodPools().length).toBe(0)
  })

  it('is reproducible from the same seed', () => {
    const a = new GoreSystem({ rng: createRng(7) })
    const b = new GoreSystem({ rng: createRng(7) })
    a.addKill(baseKill)
    b.addKill(baseKill)
    const sigA = a.getBodyParts().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.kind}`)
    const sigB = b.getBodyParts().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.kind}`)
    expect(sigA).toEqual(sigB)
  })
})
