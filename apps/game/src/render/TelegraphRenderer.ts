import type Phaser from 'phaser'

import type { Enemy } from '../entities/Enemy'

/**
 * Floor decals warning the player about an incoming enemy strike. Drawn during
 * the windup phase of the enemy's swing (`attackTimer > duration * 0.55`),
 * fading to nothing as the strike connects. Top-down legibility win — without
 * this the player can't tell who's about to hit them in a wave.
 *
 * Pure render (no state). Caller clears the Graphics each frame.
 */

const CONE_REACH = 56
const CONE_HALF_ANGLE = 0.55

export const TelegraphRenderer = {
  draw(g: Phaser.GameObjects.Graphics, enemies: readonly Enemy[]): void {
    for (const e of enemies) {
      if (e.hp <= 0 || e.attackTimer <= 0 || e.attackDuration <= 0) continue
      // Progress 0..1 through the swing. We only telegraph the windup half
      // (1.0 → 0.5); past the strike the cone fades out fast.
      const progress = 1 - e.attackTimer / e.attackDuration
      if (progress > 0.55) continue
      const windup = progress / 0.55
      // Fade-in pulses early, peaks at strike, then we cull. Alpha bias keeps
      // the cone subtle when there are many enemies on screen.
      const alpha = 0.18 + windup * 0.42

      const ang = Math.atan2(e.attackDirY, e.attackDirX)
      const reach = CONE_REACH * (0.7 + windup * 0.3)

      // Filled cone (3 vertices: enemy + 2 spread points).
      const x1 = e.x + Math.cos(ang - CONE_HALF_ANGLE) * reach
      const y1 = e.y + Math.sin(ang - CONE_HALF_ANGLE) * reach
      const x2 = e.x + Math.cos(ang + CONE_HALF_ANGLE) * reach
      const y2 = e.y + Math.sin(ang + CONE_HALF_ANGLE) * reach
      g.fillStyle(0xff2a2a, alpha * 0.45)
      g.fillTriangle(e.x, e.y, x1, y1, x2, y2)

      // Bright leading edge (the arc the strike will sweep).
      g.lineStyle(2, 0xff5050, alpha)
      g.beginPath()
      g.arc(e.x, e.y, reach, ang - CONE_HALF_ANGLE, ang + CONE_HALF_ANGLE)
      g.strokePath()
    }
  },
} as const
