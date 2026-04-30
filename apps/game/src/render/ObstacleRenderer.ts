import type { Obstacle } from '@stick/sim'
import type Phaser from 'phaser'

const COLORS: Record<Obstacle['type'], { fill: number; stroke: number }> = {
  barrel: { fill: 0xa06820, stroke: 0x5a3008 },
  crate: { fill: 0x7a4a1a, stroke: 0x4a2a08 },
  column: { fill: 0x707880, stroke: 0x303840 },
}

const FLASH_COLOR = 0xffffff

export const ObstacleRenderer = {
  draw(g: Phaser.GameObjects.Graphics, o: Obstacle): void {
    const palette = COLORS[o.type]
    const fill = o.hitFlash > 0 ? FLASH_COLOR : palette.fill

    if (o.type === 'crate') {
      const half = o.r
      g.fillStyle(fill, 1)
      g.fillRect(o.x - half, o.y - half, half * 2, half * 2)
      g.lineStyle(2, palette.stroke, 1)
      g.strokeRect(o.x - half, o.y - half, half * 2, half * 2)
      g.beginPath()
      g.moveTo(o.x - half, o.y)
      g.lineTo(o.x + half, o.y)
      g.moveTo(o.x, o.y - half)
      g.lineTo(o.x, o.y + half)
      g.strokePath()
    } else {
      g.fillStyle(fill, 1)
      g.fillCircle(o.x, o.y, o.r)
      g.lineStyle(2, palette.stroke, 1)
      g.strokeCircle(o.x, o.y, o.r)
      if (o.type === 'barrel') {
        g.lineStyle(1.5, palette.stroke, 0.7)
        g.beginPath()
        g.moveTo(o.x - o.r * 0.85, o.y - o.r * 0.4)
        g.lineTo(o.x + o.r * 0.85, o.y - o.r * 0.4)
        g.moveTo(o.x - o.r * 0.85, o.y + o.r * 0.4)
        g.lineTo(o.x + o.r * 0.85, o.y + o.r * 0.4)
        g.strokePath()
      }
    }

    if (!o.indestructible && o.hp < o.hpMax) {
      const w = o.r * 2
      const fillW = (w * o.hp) / o.hpMax
      g.fillStyle(0x000000, 0.6)
      g.fillRect(o.x - o.r, o.y - o.r - 8, w, 4)
      g.fillStyle(0xff5050, 1)
      g.fillRect(o.x - o.r, o.y - o.r - 8, fillW, 4)
    }
  },
} as const
