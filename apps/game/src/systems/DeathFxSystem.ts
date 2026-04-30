/**
 * One-shot kill burst at the position of a freshly dead enemy. Drives the
 * "pop" frame of a kill (white flash + expanding ring) before the gore takes
 * over. Kept independent from `GoreSystem` so we can iterate on the visual
 * without touching corpse/blood physics.
 *
 * Pure data — `DeathFxRenderer` reads it. ArenaScene ticks `update` and
 * adds entries via `add()` from the `enemy:death` listener.
 */

export interface DeathEffect {
  x: number
  y: number
  scale: number
  /** RGB color of the core flash (currently fixed white but kept for tuning). */
  color: number
  /** Seconds remaining. */
  life: number
  /** Initial life for normalization. */
  lifeMax: number
}

const DEFAULT_LIFE = 0.28
const MAX_EFFECTS = 32

export class DeathFxSystem {
  private readonly effects: DeathEffect[] = []

  add(opts: { x: number; y: number; scale: number; color?: number }): void {
    if (this.effects.length >= MAX_EFFECTS) this.effects.shift()
    this.effects.push({
      x: opts.x,
      y: opts.y,
      scale: opts.scale,
      color: opts.color ?? 0xffffff,
      life: DEFAULT_LIFE,
      lifeMax: DEFAULT_LIFE,
    })
  }

  update(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]!
      e.life -= dt
      if (e.life <= 0) this.effects.splice(i, 1)
    }
  }

  getAll(): readonly DeathEffect[] {
    return this.effects
  }

  clear(): void {
    this.effects.length = 0
  }
}
