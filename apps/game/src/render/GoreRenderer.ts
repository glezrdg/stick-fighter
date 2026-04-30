import type Phaser from 'phaser'

import type { BloodPool, BodyPart, Corpse } from '../systems/GoreSystem'

const BLOOD_COLOR = 0x8a0000
const BLOOD_DARK = 0x4a0000
const BURN_COLOR = 0x1a1010
const NECK_GORE = 0xa00000
const CUT_GORE = 0xc01010

/**
 * Pure rendering helpers for corpses, body parts, and blood pools. Drawn
 * directly into a single Graphics object that the scene clears each frame
 * (one for the floor layer, one for the parts layer).
 *
 * Coordinates are world-space — the caller does not translate the Graphics
 * object. Phaser handles camera positioning.
 */
export const GoreRenderer = {
  drawBloodPool(g: Phaser.GameObjects.Graphics, p: BloodPool): void {
    const baseColor = p.burned ? BURN_COLOR : BLOOD_COLOR
    const dropColor = p.burned ? 0x000000 : BLOOD_DARK
    g.fillStyle(baseColor, 0.65)
    g.fillCircle(p.x, p.y, p.r)
    for (const d of p.drops) {
      g.fillStyle(dropColor, 0.55)
      g.fillCircle(p.x + d.ox, p.y + d.oy, d.r)
    }
  },

  drawCorpse(g: Phaser.GameObjects.Graphics, c: Corpse): void {
    g.save()
    g.translateCanvas(c.x, c.y)
    g.rotateCanvas(c.rotation)
    g.scaleCanvas(c.scale, c.scale)
    g.lineStyle(5, c.color, 1)
    g.beginPath()
    g.moveTo(-22, 0)
    g.lineTo(22, 0)
    g.strokePath()
    g.fillStyle(c.color, 1)
    g.fillCircle(-26, 0, 6)
    g.lineStyle(4, c.color, 1)
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(-6, 14)
    g.moveTo(0, 0)
    g.lineTo(8, 14)
    g.strokePath()
    g.restore()
  },

  drawBodyPart(g: Phaser.GameObjects.Graphics, bp: BodyPart): void {
    g.save()
    g.translateCanvas(bp.x, bp.y)
    g.rotateCanvas(bp.rot)
    g.scaleCanvas(bp.scale, bp.scale)
    switch (bp.kind) {
      case 'head':
        g.fillStyle(bp.color, 1)
        g.fillCircle(0, 0, 7)
        g.fillStyle(NECK_GORE, 1)
        g.fillCircle(0, 6, 3)
        break
      case 'arm':
        g.lineStyle(5, bp.color, 1)
        g.beginPath()
        g.moveTo(-8, 0)
        g.lineTo(8, 0)
        g.strokePath()
        g.fillStyle(CUT_GORE, 1)
        g.fillCircle(-8, 0, 2.5)
        g.fillCircle(8, 0, 2.5)
        break
      case 'leg':
        g.lineStyle(5, bp.color, 1)
        g.beginPath()
        g.moveTo(-10, 0)
        g.lineTo(10, 0)
        g.strokePath()
        g.fillStyle(CUT_GORE, 1)
        g.fillCircle(-10, 0, 2.5)
        break
      case 'torso':
        g.lineStyle(6, bp.color, 1)
        g.beginPath()
        g.moveTo(0, -10)
        g.lineTo(0, 10)
        g.strokePath()
        g.fillStyle(CUT_GORE, 1)
        g.fillCircle(0, -10, 3)
        g.fillCircle(0, 10, 3)
        break
    }
    g.restore()
  },
} as const
