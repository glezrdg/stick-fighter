import type { ClothingKind } from '@stick/content'
import type Phaser from 'phaser'

/**
 * Torso clothing overlay. Caller has positioned the Graphics at the player's
 * world coords; we draw relative to (0,0) where the pelvis sits — the torso
 * extends upward from there. Simplified versions of legacy drawClothing
 * (lines 2643-2799). Each kind paints over the body line so the silhouette
 * reads "armored / robed / wrapped" at a glance.
 */

interface ClothingOpts {
  scale: number
  color: number
  /** Override fill — if undefined, uses kind-specific default. */
  tint?: number
}

export const ClothingRenderer = {
  draw(g: Phaser.GameObjects.Graphics, kind: ClothingKind, opts: ClothingOpts): void {
    const s = opts.scale
    const tint = opts.tint
    switch (kind) {
      case 'tunic':
        return drawTunic(g, s, tint ?? opts.color)
      case 'wrap':
        return drawWrap(g, s, tint ?? 0x1a1a1a)
      case 'robe':
        return drawRobe(g, s, tint ?? 0x6a4a2a)
      case 'samurai':
        return drawSamurai(g, s, tint ?? 0x8a2020)
      case 'tank':
        return drawTank(g, s, tint ?? 0x222222)
      case 'plate':
        return drawPlate(g, s, tint ?? 0x808890)
      case 'cloak':
        return drawCloak(g, s, tint ?? 0x1a0a2a)
    }
  },
} as const

function drawTunic(g: Phaser.GameObjects.Graphics, s: number, color: number): void {
  // Simple V-neck shirt over the torso.
  g.fillStyle(color, 1)
  g.fillTriangle(-9 * s, -22 * s, 9 * s, -22 * s, 0, -10 * s)
  g.fillRect(-9 * s, -16 * s, 18 * s, 14 * s)
  g.lineStyle(1.2 * s, 0x000000, 0.4)
  g.strokeRect(-9 * s, -16 * s, 18 * s, 14 * s)
}

function drawWrap(g: Phaser.GameObjects.Graphics, s: number, color: number): void {
  // Diagonal wrap (ninja-style sash).
  g.fillStyle(color, 1)
  g.fillRect(-10 * s, -22 * s, 20 * s, 16 * s)
  // Diagonal sash
  g.fillStyle(0xc41a1a, 1)
  g.beginPath()
  g.moveTo(-10 * s, -16 * s)
  g.lineTo(10 * s, -22 * s)
  g.lineTo(10 * s, -19 * s)
  g.lineTo(-10 * s, -13 * s)
  g.closePath()
  g.fillPath()
}

function drawRobe(g: Phaser.GameObjects.Graphics, s: number, color: number): void {
  // Wide flowing robe.
  g.fillStyle(color, 1)
  g.beginPath()
  g.moveTo(-8 * s, -22 * s)
  g.lineTo(8 * s, -22 * s)
  g.lineTo(13 * s, 4 * s)
  g.lineTo(-13 * s, 4 * s)
  g.closePath()
  g.fillPath()
  g.lineStyle(1.5 * s, 0xffd54a, 0.7)
  g.beginPath()
  g.moveTo(0, -22 * s)
  g.lineTo(0, 4 * s)
  g.strokePath()
}

function drawSamurai(g: Phaser.GameObjects.Graphics, s: number, color: number): void {
  // Layered shoulder armor + chest plate.
  g.fillStyle(color, 1)
  g.fillRect(-11 * s, -20 * s, 22 * s, 16 * s)
  g.fillStyle(0x000000, 1)
  g.fillRect(-12 * s, -20 * s, 4 * s, 6 * s)
  g.fillRect(8 * s, -20 * s, 4 * s, 6 * s)
  // Belt
  g.fillStyle(0xffd54a, 1)
  g.fillRect(-11 * s, -6 * s, 22 * s, 2 * s)
}

function drawTank(g: Phaser.GameObjects.Graphics, s: number, color: number): void {
  // Sleeveless top.
  g.fillStyle(color, 1)
  g.fillRect(-7 * s, -20 * s, 14 * s, 16 * s)
  g.lineStyle(1.2 * s, 0x000000, 0.5)
  g.strokeRect(-7 * s, -20 * s, 14 * s, 16 * s)
}

function drawPlate(g: Phaser.GameObjects.Graphics, s: number, color: number): void {
  // Heavy armored chest plate with rivets.
  g.fillStyle(color, 1)
  g.fillRect(-12 * s, -22 * s, 24 * s, 18 * s)
  g.lineStyle(1.5 * s, 0x303840, 1)
  g.strokeRect(-12 * s, -22 * s, 24 * s, 18 * s)
  // Rivets
  g.fillStyle(0x303840, 1)
  g.fillCircle(-9 * s, -19 * s, 1.2 * s)
  g.fillCircle(9 * s, -19 * s, 1.2 * s)
  g.fillCircle(-9 * s, -7 * s, 1.2 * s)
  g.fillCircle(9 * s, -7 * s, 1.2 * s)
  // Center crest line
  g.lineStyle(1.5 * s, 0x000000, 0.6)
  g.beginPath()
  g.moveTo(0, -22 * s)
  g.lineTo(0, -4 * s)
  g.strokePath()
}

function drawCloak(g: Phaser.GameObjects.Graphics, s: number, color: number): void {
  // Wide cloak hanging behind shoulders + over torso.
  g.fillStyle(color, 0.85)
  g.beginPath()
  g.moveTo(-12 * s, -20 * s)
  g.lineTo(12 * s, -20 * s)
  g.lineTo(16 * s, 8 * s)
  g.lineTo(-16 * s, 8 * s)
  g.closePath()
  g.fillPath()
  g.fillStyle(color, 1)
  g.fillRect(-8 * s, -20 * s, 16 * s, 14 * s)
}
