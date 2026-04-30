import type Phaser from 'phaser'

import type { DeathEffect } from '../systems/DeathFxSystem'

/**
 * White flash + expanding ring at the kill point. Reads pure data; the
 * caller clears the Graphics each frame.
 */
export const DeathFxRenderer = {
  draw(g: Phaser.GameObjects.Graphics, effects: readonly DeathEffect[]): void {
    for (const e of effects) {
      const t = 1 - e.life / e.lifeMax // 0 → 1 over the effect's life
      const baseR = 22 * e.scale
      const ringR = baseR * (1 + t * 1.8)
      const fillR = baseR * (1 + t * 0.6)
      const alpha = 1 - t

      // Hot core flash (fades fast).
      g.fillStyle(e.color, alpha * 0.85)
      g.fillCircle(e.x, e.y - 18 * e.scale, fillR * (1 - t * 0.5))

      // Expanding ring.
      g.lineStyle(3, e.color, alpha * 0.9)
      g.strokeCircle(e.x, e.y - 18 * e.scale, ringR)

      // Faint outer ring (lags behind for a 2-stage feel).
      if (t > 0.2) {
        const t2 = (t - 0.2) / 0.8
        g.lineStyle(2, e.color, (1 - t2) * 0.5)
        g.strokeCircle(e.x, e.y - 18 * e.scale, ringR * 1.4)
      }
    }
  },
} as const
