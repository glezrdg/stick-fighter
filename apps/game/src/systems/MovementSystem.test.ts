// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { ARENA } from '../core/arena'
import { createPlayer } from '../entities/Player'

import { updateMovement } from './MovementSystem'

const dt60 = 1 / 60

describe('MovementSystem', () => {
  it('does not move with zero input from rest', () => {
    const p = createPlayer({ x: 100, y: 100 })
    updateMovement(p, { x: 0, y: 0 }, dt60)
    expect(p.x).toBe(100)
    expect(p.y).toBe(100)
    expect(p.vx).toBe(0)
    expect(p.vy).toBe(0)
  })

  it('accelerates in the input direction', () => {
    const p = createPlayer({ x: 100, y: 100 })
    updateMovement(p, { x: 1, y: 0 }, dt60)
    expect(p.vx).toBeGreaterThan(0)
    expect(p.x).toBeGreaterThan(100)
  })

  it('updates facing when input is non-zero', () => {
    const p = createPlayer({ x: 100, y: 100 })
    expect(p.facingX).toBe(1)
    updateMovement(p, { x: 0, y: 1 }, dt60)
    expect(p.facingX).toBe(0)
    expect(p.facingY).toBe(1)
  })

  it('does NOT update facing on zero input (preserves last facing)', () => {
    const p = createPlayer({ x: 100, y: 100 })
    p.facingX = 0
    p.facingY = -1
    updateMovement(p, { x: 0, y: 0 }, dt60)
    expect(p.facingX).toBe(0)
    expect(p.facingY).toBe(-1)
  })

  it('decelerates from velocity when input is zero', () => {
    const p = createPlayer({ x: 100, y: 100 })
    p.vx = 5
    updateMovement(p, { x: 0, y: 0 }, dt60)
    expect(p.vx).toBeLessThan(5)
  })

  it('accumulates walkPhase proportional to speed', () => {
    const p = createPlayer({ x: 100, y: 100 })
    const phaseBefore = p.walkPhase
    p.vx = 3
    updateMovement(p, { x: 1, y: 0 }, dt60)
    expect(p.walkPhase).toBeGreaterThan(phaseBefore)
  })

  it('clamps position to arena bounds', () => {
    const p = createPlayer({ x: 0, y: 0 })
    p.vx = -100
    p.vy = -100
    updateMovement(p, { x: -1, y: -1 }, dt60)
    expect(p.x).toBeGreaterThanOrEqual(ARENA.playerInsetLeft)
    expect(p.y).toBeGreaterThanOrEqual(ARENA.playerInsetTop)

    p.x = ARENA.width
    p.y = ARENA.height
    p.vx = 100
    p.vy = 100
    updateMovement(p, { x: 1, y: 1 }, dt60)
    expect(p.x).toBeLessThanOrEqual(ARENA.width - ARENA.playerInsetRight)
    expect(p.y).toBeLessThanOrEqual(ARENA.height - ARENA.playerInsetBottom)
  })

  it('dash override forces velocity to facing * 9 while dashTimer > 0', () => {
    const p = createPlayer({ x: 100, y: 100 })
    p.facingX = 1
    p.facingY = 0
    p.dashTimer = 0.1
    updateMovement(p, { x: 0, y: 0 }, dt60)
    expect(p.vx).toBe(9)
    expect(p.vy).toBe(0)
  })

  it('dashTimer decays to zero after enough dt', () => {
    const p = createPlayer({ x: 100, y: 100 })
    p.dashTimer = 0.05
    updateMovement(p, { x: 0, y: 0 }, dt60)
    expect(p.dashTimer).toBeLessThan(0.05)
    updateMovement(p, { x: 0, y: 0 }, 1)
    expect(p.dashTimer).toBe(0)
  })

  it('iframes and hurtFlash decay each frame', () => {
    const p = createPlayer({ x: 100, y: 100 })
    p.iframes = 0.5
    p.hurtFlash = 0.2
    updateMovement(p, { x: 0, y: 0 }, dt60)
    expect(p.iframes).toBeLessThan(0.5)
    expect(p.hurtFlash).toBeLessThan(0.2)
    updateMovement(p, { x: 0, y: 0 }, 5)
    expect(p.iframes).toBe(0)
    expect(p.hurtFlash).toBe(0)
  })

  it('caps the per-step approach factor at 1 to prevent overshoot at long dt', () => {
    const p = createPlayer({ x: 100, y: 100 })
    // With dt = 1s and accel 0.22 frames⁻¹ uncapped, this would multiply by 0.22*60 = 13.2
    // and severely overshoot. The cap keeps vx <= target speed.
    updateMovement(p, { x: 1, y: 0 }, 1)
    expect(p.vx).toBeLessThanOrEqual(3.4) // PLAYER_DEFAULTS.speedPxPerFrame
  })
})
