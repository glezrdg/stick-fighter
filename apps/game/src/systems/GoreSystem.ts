import type { Rng } from '@stick/sim'

/**
 * Corpses, dismembered body parts, and blood pools. Replaces the legacy
 * `corpses[]`, `bodyParts[]`, `bloodPools[]` globals (lines 1192-1195) and
 * the `killEnemy` gore spawn block (1812-1890).
 *
 * The system is purely visual — none of it deals damage or interacts with
 * the simulation. Hard caps (FIFO eviction) match the legacy MAX_* constants
 * to prevent fps drops when many enemies die at once. An "adaptive heavy"
 * mode kicks in when the buffers fill up, halving particle counts.
 */

export type BodyPartKind = 'head' | 'arm' | 'leg' | 'torso'

export interface Corpse {
  x: number
  y: number
  color: number
  scale: number
  rotation: number
}

export interface BodyPart {
  kind: BodyPartKind
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  rotVel: number
  color: number
  scale: number
  bloodTrail: number
  grounded: boolean
}

export interface BloodPool {
  x: number
  y: number
  r: number
  rotation: number
  burned?: boolean
  drops: Array<{ ox: number; oy: number; r: number }>
}

const MAX_CORPSES = 40
const MAX_BODY_PARTS = 80
const MAX_BLOOD_POOLS = 60

const PHYSICS_DAMPING = 0.88
const ROT_DAMPING = 0.9
const GROUNDED_THRESHOLD = 0.3

export class GoreSystem {
  private readonly rng: Rng
  private readonly corpses: Corpse[] = []
  private readonly parts: BodyPart[] = []
  private readonly pools: BloodPool[] = []

  constructor(opts: { rng: Rng }) {
    this.rng = opts.rng
  }

  /** Spawn corpse + body parts + blood pool from a killed enemy. */
  addKill(opts: {
    x: number
    y: number
    color: number
    scale: number
    knockbackX: number
    knockbackY: number
    /** Number of currently alive enemies — used to gauge "heavy" load. */
    aliveEnemies: number
  }): void {
    const heavy = this.parts.length > 50 || this.pools.length > 40 || opts.aliveEnemies > 12

    const explX = opts.knockbackX * 1.2 + this.rng.float(-1.5, 1.5)
    const explY = opts.knockbackY * 1.2 + this.rng.float(-1.5, 1.5)

    // Blood pool (skip random fraction when heavy).
    if (this.pools.length < MAX_BLOOD_POOLS && (!heavy || this.rng.chance(0.4))) {
      this.pushPool({
        x: opts.x,
        y: opts.y,
        r: 18 + this.rng.float(0, 8),
        rotation: this.rng.float(0, Math.PI * 2),
        drops: this.rollPoolDrops(heavy ? 1 : 2 + this.rng.int(0, 3)),
      })
    }

    // Dismemberment.
    const partKinds: BodyPartKind[] = heavy
      ? ['head', 'arm', 'leg']
      : ['head', 'arm', 'arm', 'leg', 'leg', 'torso']
    for (const kind of partKinds) {
      const ang = this.rng.float(0, Math.PI * 2)
      const spd = 2.5 + this.rng.float(0, 4)
      this.pushPart({
        kind,
        x: opts.x + this.rng.float(-3, 3),
        y: opts.y + this.rng.float(-3, 3),
        vx: explX * 0.4 + Math.cos(ang) * spd,
        vy: explY * 0.4 + Math.sin(ang) * spd,
        rot: this.rng.float(0, Math.PI * 2),
        rotVel: this.rng.float(-0.2, 0.2),
        color: opts.color,
        scale: opts.scale,
        bloodTrail: heavy ? 4 : 10,
        grounded: false,
      })
    }

    // Corpse.
    this.pushCorpse({
      x: opts.x + opts.knockbackX * 4,
      y: opts.y + opts.knockbackY * 4,
      color: opts.color,
      scale: opts.scale,
      rotation: Math.atan2(opts.knockbackY, opts.knockbackX) + this.rng.float(-0.3, 0.3),
    })
  }

  /** Spawn a burned scorch mark (used by exploding obstacles). */
  addBurnedMark(x: number, y: number): void {
    if (this.pools.length >= MAX_BLOOD_POOLS) return
    this.pushPool({
      x,
      y,
      r: 24,
      rotation: 0,
      burned: true,
      drops: this.rollPoolDrops(4, 4, 6, 40),
    })
  }

  /** Tick body-part physics. dt is in seconds; the legacy ran on a fixed 60Hz
   *  loop, so we scale velocities by dt*60 to preserve the feel. */
  update(dt: number): void {
    const tickMul = dt * 60
    for (const bp of this.parts) {
      if (bp.grounded) continue
      bp.x += bp.vx * tickMul
      bp.y += bp.vy * tickMul
      bp.vx *= Math.pow(PHYSICS_DAMPING, tickMul)
      bp.vy *= Math.pow(PHYSICS_DAMPING, tickMul)
      bp.rot += bp.rotVel * tickMul
      bp.rotVel *= Math.pow(ROT_DAMPING, tickMul)
      if (bp.bloodTrail > 0 && this.rng.chance(0.25)) {
        bp.bloodTrail--
        if (this.pools.length < MAX_BLOOD_POOLS) {
          this.pushPool({
            x: bp.x,
            y: bp.y,
            r: 3 + this.rng.float(0, 3),
            rotation: 0,
            drops: [{ ox: 0, oy: 0, r: 2 + this.rng.float(0, 2) }],
          })
        }
      }
      if (Math.abs(bp.vx) + Math.abs(bp.vy) < GROUNDED_THRESHOLD) {
        bp.grounded = true
        bp.vx = 0
        bp.vy = 0
      }
    }
  }

  getCorpses(): readonly Corpse[] {
    return this.corpses
  }
  getBodyParts(): readonly BodyPart[] {
    return this.parts
  }
  getBloodPools(): readonly BloodPool[] {
    return this.pools
  }

  clear(): void {
    this.corpses.length = 0
    this.parts.length = 0
    this.pools.length = 0
  }

  private pushCorpse(c: Corpse): void {
    if (this.corpses.length >= MAX_CORPSES) this.corpses.shift()
    this.corpses.push(c)
  }

  private pushPart(bp: BodyPart): void {
    if (this.parts.length >= MAX_BODY_PARTS) this.parts.shift()
    this.parts.push(bp)
  }

  private pushPool(p: BloodPool): void {
    if (this.pools.length >= MAX_BLOOD_POOLS) this.pools.shift()
    this.pools.push(p)
  }

  private rollPoolDrops(n: number, rMin = 4, rRange = 6, spread = 30): BloodPool['drops'] {
    const out: BloodPool['drops'] = []
    for (let i = 0; i < n; i++) {
      out.push({
        ox: this.rng.float(-spread / 2, spread / 2),
        oy: this.rng.float(-spread / 2, spread / 2) * 0.8,
        r: rMin + this.rng.float(0, rRange),
      })
    }
    return out
  }
}
