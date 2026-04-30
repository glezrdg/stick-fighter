import type { Enemy } from '@stick/sim'
import type Phaser from 'phaser'

/**
 * Floor decals warning the player about an incoming enemy strike. Drawn during
 * the windup phase of the enemy's attack (`attackTimer > duration * 0.55`),
 * fading to nothing as the strike connects.
 *
 * Two telegraph shapes:
 *   - Melee → short forward cone (slash arc).
 *   - Ranged → long aim line, with a marker where the projectile will land.
 *
 * Pure render (no state). Caller clears the Graphics each frame.
 */

const CONE_REACH = 56
const CONE_HALF_ANGLE = 0.55
const RANGED_LINE_LENGTH = 380

export type TelegraphKind = 'melee' | 'ranged'

export const TelegraphRenderer = {
  draw(
    g: Phaser.GameObjects.Graphics,
    enemies: readonly Enemy[],
    kindOf?: (enemy: Enemy) => TelegraphKind,
  ): void {
    for (const e of enemies) {
      if (e.hp <= 0 || e.attackTimer <= 0 || e.attackDuration <= 0) continue
      const progress = 1 - e.attackTimer / e.attackDuration
      if (progress > 0.65) continue
      const windup = Math.min(1, progress / 0.6)
      const alpha = 0.18 + windup * 0.55

      const ang = Math.atan2(e.attackDirY, e.attackDirX)
      const kind: TelegraphKind = kindOf ? kindOf(e) : 'melee'

      if (kind === 'ranged') {
        drawRangedAim(g, e.x, e.y - 22, ang, alpha, windup)
      } else {
        drawMeleeCone(g, e.x, e.y, ang, alpha, windup)
      }
    }
  },
} as const

function drawMeleeCone(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  ang: number,
  alpha: number,
  windup: number,
): void {
  const reach = CONE_REACH * (0.7 + windup * 0.3)
  const x1 = x + Math.cos(ang - CONE_HALF_ANGLE) * reach
  const y1 = y + Math.sin(ang - CONE_HALF_ANGLE) * reach
  const x2 = x + Math.cos(ang + CONE_HALF_ANGLE) * reach
  const y2 = y + Math.sin(ang + CONE_HALF_ANGLE) * reach

  g.fillStyle(0xff2a2a, alpha * 0.45)
  g.fillTriangle(x, y, x1, y1, x2, y2)

  g.lineStyle(2, 0xff5050, alpha)
  g.beginPath()
  g.arc(x, y, reach, ang - CONE_HALF_ANGLE, ang + CONE_HALF_ANGLE)
  g.strokePath()
}

function drawRangedAim(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  ang: number,
  alpha: number,
  windup: number,
): void {
  // A thin aim corridor ending in a small targeting reticle. Length grows
  // with windup so the player visually tracks "the shot is about to land".
  const len = RANGED_LINE_LENGTH * (0.4 + windup * 0.6)
  const ex = x + Math.cos(ang) * len
  const ey = y + Math.sin(ang) * len

  // Outer glow line (wide, transparent).
  g.lineStyle(10, 0xff2a2a, alpha * 0.18)
  g.beginPath()
  g.moveTo(x, y)
  g.lineTo(ex, ey)
  g.strokePath()
  // Inner sharp line.
  g.lineStyle(2, 0xff5050, alpha * 0.85)
  g.beginPath()
  g.moveTo(x, y)
  g.lineTo(ex, ey)
  g.strokePath()
  // Tip reticle — pulses while charging.
  const tipR = 6 + windup * 6
  g.lineStyle(2, 0xff2a2a, alpha)
  g.strokeCircle(ex, ey, tipR)
  g.fillStyle(0xff5050, alpha * 0.45)
  g.fillCircle(ex, ey, tipR * 0.5)
}
