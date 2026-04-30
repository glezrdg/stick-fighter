import type { Rng } from '@stick/sim'

/**
 * Generic particle pool. Replaces the legacy `fxParticles[]` global (line 1809
 * MAX_PARTICLES = 220) used for blood splatters, slash sparks, aura bursts,
 * impact dust, etc. Pure data — rendered by ParticleRenderer.
 *
 * Hard cap with FIFO drop matches the legacy: when the buffer fills up,
 * earliest particles are evicted so newer impacts always show.
 */

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** Life remaining in seconds (legacy used frames; we converted: legacy_life/60). */
  life: number
  /** Initial life — used to fade alpha as `life / lifeMax`. */
  lifeMax: number
  /** RGB color. */
  color: number
  /** Render radius in pixels. */
  size: number
  /** Per-second gravity (positive Y). 0 disables. Default ~24 px/s² scaled. */
  gravity: number
}

const MAX_PARTICLES = 220
const DEFAULT_GRAVITY = 24 // px / s² — legacy used 0.4 per-frame at 60Hz = 24 px/s²

export class ParticleSystem {
  private readonly rng: Rng
  private readonly particles: Particle[] = []

  constructor(opts: { rng: Rng }) {
    this.rng = opts.rng
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += p.gravity * dt
      p.life -= dt
      if (p.life <= 0) this.particles.splice(i, 1)
    }
  }

  getAll(): readonly Particle[] {
    return this.particles
  }

  clear(): void {
    this.particles.length = 0
  }

  /** Blood splatter on impact (legacy spawnBloodSplatter, lines 1789-1805). */
  spawnBlood(x: number, y: number, dirX: number, dirY: number, count = 14): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.atan2(dirY, dirX) + this.rng.float(-0.6, 0.6)
      const spd = 60 + this.rng.float(0, 240)
      this.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - this.rng.float(0, 60),
        life: 0.27 + this.rng.float(0, 0.13),
        lifeMax: 0.4,
        color: this.rng.chance(0.5) ? 0xa00000 : 0x7a0000,
        size: 1 + this.rng.float(0, 2),
        gravity: DEFAULT_GRAVITY * 1.5,
      })
    }
  }

  /** Slash spark FX — yellow/aura sparkles along the swing direction
   *  (legacy spawnSlashFx, lines 1897-1912). */
  spawnSlashFx(x: number, y: number, dirX: number, dirY: number, color = 0xffd54a): void {
    const count = 12
    const baseAng = Math.atan2(dirY, dirX)
    for (let i = 0; i < count; i++) {
      const ang = baseAng + this.rng.float(-0.5, 0.5)
      const spd = 80 + this.rng.float(0, 320)
      this.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.18 + this.rng.float(0, 0.12),
        lifeMax: 0.3,
        color,
        size: 1.5 + this.rng.float(0, 2),
        gravity: 0,
      })
    }
  }

  /** Aura burst — radial pulse around the player when a skill activates
   *  (legacy spawnAuraBurst, lines 2052-2064). */
  spawnAuraBurst(x: number, y: number, color: number, count = 30): void {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + this.rng.float(-0.1, 0.1)
      const spd = 180 + this.rng.float(0, 240)
      this.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.32 + this.rng.float(0, 0.18),
        lifeMax: 0.5,
        color,
        size: 2 + this.rng.float(0, 2.5),
        gravity: 0,
      })
    }
  }

  /** Footstep dust — subtle puffs while running (legacy lines 1364-1374). */
  spawnDust(x: number, y: number): void {
    const count = 2
    for (let i = 0; i < count; i++) {
      this.push({
        x: x + this.rng.float(-4, 4),
        y: y + this.rng.float(-2, 4),
        vx: this.rng.float(-30, 30),
        vy: -this.rng.float(20, 60),
        life: 0.25 + this.rng.float(0, 0.1),
        lifeMax: 0.35,
        color: 0x6a6a6a,
        size: 1.5 + this.rng.float(0, 1.5),
        gravity: 12,
      })
    }
  }

  /** Shockwave ring — used by groundPound. */
  spawnShockwave(x: number, y: number, color = 0xffd54a, count = 24): void {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2
      const spd = 320 + this.rng.float(0, 80)
      this.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.4,
        lifeMax: 0.4,
        color,
        size: 3,
        gravity: 0,
      })
    }
  }

  private push(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
    this.particles.push(p)
  }
}
