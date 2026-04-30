import type { WeaponShape } from '@stick/content'
import type Phaser from 'phaser'

/**
 * Per-shape weapon silhouettes drawn into the hand at (0, 0). The caller
 * has already translated to the hand and rotated the canvas so the blade
 * points "up" (negative Y). Scales the geometry by `scale`.
 *
 * Geometries are simplified versions of the legacy `drawWeapon()` switch
 * (lines ~2330-2510). Detailed enough to recognize, cheap enough to draw
 * many at once.
 */
export const WeaponRenderer = {
  draw(g: Phaser.GameObjects.Graphics, shape: WeaponShape, blade: number, scale = 1): void {
    switch (shape) {
      case 'katana':
        return drawKatana(g, blade, scale)
      case 'greatsword':
        return drawGreatsword(g, blade, scale)
      case 'axe':
        return drawAxe(g, blade, scale)
      case 'hammer':
        return drawHammer(g, blade, scale)
      case 'scythe':
        return drawScythe(g, blade, scale)
      case 'dual':
        return drawDagger(g, blade, scale)
      case 'plasma':
        return drawPlasmaSaber(g, blade, scale)
      case 'ki':
        return drawKiSword(g, blade, scale)
      case 'voidScythe':
        return drawVoidScythe(g, blade, scale)
    }
  },
} as const

function drawKatana(g: Phaser.GameObjects.Graphics, blade: number, s: number): void {
  // Hilt black, guard small, blade thin and long upward.
  g.lineStyle(3 * s, 0x222222, 1)
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(0, 6 * s)
  g.strokePath()
  g.fillStyle(0x222222, 1)
  g.fillRect(-4 * s, -2 * s, 8 * s, 2 * s)
  g.lineStyle(2.5 * s, blade, 1)
  g.beginPath()
  g.moveTo(0, -2 * s)
  g.lineTo(0, -34 * s)
  g.strokePath()
  g.fillStyle(blade, 1)
  g.fillTriangle(-1 * s, -32 * s, 1 * s, -32 * s, 0, -38 * s)
}

function drawGreatsword(g: Phaser.GameObjects.Graphics, blade: number, s: number): void {
  g.lineStyle(4 * s, 0x4a3010, 1)
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(0, 8 * s)
  g.strokePath()
  g.fillStyle(0x222222, 1)
  g.fillRect(-7 * s, -2 * s, 14 * s, 3 * s)
  g.fillStyle(blade, 1)
  g.fillTriangle(-3 * s, -2 * s, 3 * s, -2 * s, 0, -42 * s)
  g.lineStyle(1.2 * s, 0x808080, 0.7)
  g.beginPath()
  g.moveTo(0, -2 * s)
  g.lineTo(0, -42 * s)
  g.strokePath()
}

function drawAxe(g: Phaser.GameObjects.Graphics, blade: number, s: number): void {
  // Shaft
  g.lineStyle(3 * s, 0x4a2a08, 1)
  g.beginPath()
  g.moveTo(0, 6 * s)
  g.lineTo(0, -28 * s)
  g.strokePath()
  // Blade head
  g.fillStyle(blade, 1)
  g.fillTriangle(0, -22 * s, 14 * s, -28 * s, 14 * s, -16 * s)
  g.fillTriangle(0, -22 * s, -14 * s, -28 * s, -14 * s, -16 * s)
  g.lineStyle(1 * s, 0x000000, 0.7)
  g.strokeTriangle(0, -22 * s, 14 * s, -28 * s, 14 * s, -16 * s)
  g.strokeTriangle(0, -22 * s, -14 * s, -28 * s, -14 * s, -16 * s)
}

function drawHammer(g: Phaser.GameObjects.Graphics, blade: number, s: number): void {
  g.lineStyle(3.5 * s, 0x4a2a08, 1)
  g.beginPath()
  g.moveTo(0, 6 * s)
  g.lineTo(0, -26 * s)
  g.strokePath()
  g.fillStyle(blade, 1)
  g.fillRect(-12 * s, -32 * s, 24 * s, 12 * s)
  g.lineStyle(1.5 * s, 0x000000, 0.6)
  g.strokeRect(-12 * s, -32 * s, 24 * s, 12 * s)
}

function drawScythe(g: Phaser.GameObjects.Graphics, blade: number, s: number): void {
  g.lineStyle(3 * s, 0x4a3010, 1)
  g.beginPath()
  g.moveTo(0, 6 * s)
  g.lineTo(0, -28 * s)
  g.strokePath()
  g.lineStyle(3 * s, blade, 1)
  g.beginPath()
  g.arc(-12 * s, -28 * s, 18 * s, -Math.PI / 4, Math.PI / 2.4, false)
  g.strokePath()
}

function drawDagger(g: Phaser.GameObjects.Graphics, blade: number, s: number): void {
  g.lineStyle(2 * s, 0x222222, 1)
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(0, 4 * s)
  g.strokePath()
  g.fillStyle(0x222222, 1)
  g.fillRect(-3 * s, -1 * s, 6 * s, 2 * s)
  g.fillStyle(blade, 1)
  g.fillTriangle(-1.5 * s, -1 * s, 1.5 * s, -1 * s, 0, -22 * s)
}

function drawPlasmaSaber(g: Phaser.GameObjects.Graphics, blade: number, s: number): void {
  // Hilt
  g.lineStyle(3 * s, 0x808080, 1)
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(0, 8 * s)
  g.strokePath()
  // Glowing blade — outer halo + inner bright
  g.fillStyle(blade, 0.35)
  g.fillRect(-4 * s, -34 * s, 8 * s, 34 * s)
  g.fillStyle(blade, 1)
  g.fillRect(-1.5 * s, -34 * s, 3 * s, 34 * s)
  g.fillStyle(0xffffff, 0.9)
  g.fillRect(-0.5 * s, -34 * s, 1 * s, 34 * s)
}

function drawKiSword(g: Phaser.GameObjects.Graphics, blade: number, s: number): void {
  // Energy blade with spike tip
  g.fillStyle(blade, 0.4)
  g.fillTriangle(-5 * s, 0, 5 * s, 0, 0, -42 * s)
  g.fillStyle(blade, 1)
  g.fillTriangle(-2.5 * s, 0, 2.5 * s, 0, 0, -38 * s)
  g.fillStyle(0xffffff, 0.85)
  g.fillTriangle(-1 * s, 0, 1 * s, 0, 0, -34 * s)
}

function drawVoidScythe(g: Phaser.GameObjects.Graphics, blade: number, s: number): void {
  drawScythe(g, blade, s)
  // Purple glow ring
  g.lineStyle(1.5 * s, blade, 0.5)
  g.beginPath()
  g.arc(-12 * s, -28 * s, 22 * s, -Math.PI / 4, Math.PI / 2.4, false)
  g.strokePath()
}
