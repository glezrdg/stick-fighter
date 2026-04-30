import type { AccessoryKind } from '@stick/content'
import type Phaser from 'phaser'

/**
 * Head accessory + held-item overlay. Drawn at the head position (relative
 * to pelvis at 0). Caller passes `headY` (negative — head is above pelvis).
 *
 * Simplified silhouettes derived from legacy drawAccessory (lines 2801-3079).
 * Each kind reads as a distinct silhouette so the 9 enemy types feel
 * different at a glance.
 */

interface AccessoryOpts {
  scale: number
  /** Head Y in local coords (negative). */
  headY: number
  /** Body color — used as default for hair/horns. */
  color: number
  /** Facing X direction (so spear/dualBlades point forward). */
  facingX: number
}

export const AccessoryRenderer = {
  draw(g: Phaser.GameObjects.Graphics, kind: AccessoryKind, opts: AccessoryOpts): void {
    const s = opts.scale
    const hy = opts.headY
    switch (kind) {
      case 'none':
        return
      case 'headband':
        return drawHeadband(g, s, hy)
      case 'topknot':
        return drawTopknot(g, s, hy, opts.color)
      case 'horns':
        return drawHorns(g, s, hy)
      case 'demon':
        return drawDemon(g, s, hy)
      case 'wings':
        return drawWings(g, s, hy)
      case 'antenna':
        return drawAntenna(g, s, hy)
      case 'goldenHelm':
        return drawGoldenHelm(g, s, hy)
      case 'coneHat':
        return drawConeHat(g, s, hy)
      case 'iceCrown':
        return drawIceCrown(g, s, hy)
      case 'wingedHelm':
        return drawWingedHelm(g, s, hy)
      case 'jesterCrown':
        return drawJesterCrown(g, s, hy)
      case 'goggles':
        return drawGoggles(g, s, hy)
      case 'spear':
        return drawHeldSpear(g, s, opts.facingX)
      case 'dualBlades':
        return drawHeldDualBlades(g, s, opts.facingX)
      case 'staff':
        return drawHeldStaff(g, s, opts.facingX)
      case 'helm':
        return drawSimpleHelm(g, s, hy)
      case 'crown':
        return drawCrown(g, s, hy)
      case 'rage':
        return drawRageAura(g, s, hy)
    }
  },
} as const

// ---- Head accessories -----------------------------------------------------

function drawHeadband(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  g.fillStyle(0xc41a1a, 1)
  g.fillRect(-9 * s, hy - 1 * s, 18 * s, 3 * s)
  // Tail flap
  g.fillStyle(0xc41a1a, 1)
  g.fillTriangle(-9 * s, hy - 1 * s, -9 * s, hy + 2 * s, -16 * s, hy + 4 * s)
}

function drawTopknot(g: Phaser.GameObjects.Graphics, s: number, hy: number, color: number): void {
  g.fillStyle(color, 1)
  g.fillCircle(0, hy - 7 * s, 3 * s)
  g.lineStyle(2 * s, color, 1)
  g.beginPath()
  g.moveTo(0, hy - 8 * s)
  g.lineTo(0, hy - 4 * s)
  g.strokePath()
}

function drawHorns(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  g.fillStyle(0xf0e0c0, 1)
  g.fillTriangle(-7 * s, hy - 4 * s, -3 * s, hy - 4 * s, -8 * s, hy - 12 * s)
  g.fillTriangle(7 * s, hy - 4 * s, 3 * s, hy - 4 * s, 8 * s, hy - 12 * s)
}

function drawDemon(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  // Curved horns + dark glow.
  g.fillStyle(0x000000, 0.6)
  g.fillCircle(0, hy, 11 * s)
  g.fillStyle(0x1a0a0a, 1)
  g.fillTriangle(-8 * s, hy - 4 * s, -4 * s, hy - 5 * s, -12 * s, hy - 14 * s)
  g.fillTriangle(8 * s, hy - 4 * s, 4 * s, hy - 5 * s, 12 * s, hy - 14 * s)
  // Glowing eyes
  g.fillStyle(0xff2020, 1)
  g.fillCircle(-3 * s, hy - 1 * s, 1.5 * s)
  g.fillCircle(3 * s, hy - 1 * s, 1.5 * s)
}

function drawWings(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  g.fillStyle(0xfafafa, 0.85)
  g.fillTriangle(-3 * s, hy - 2 * s, -16 * s, hy - 8 * s, -10 * s, hy + 4 * s)
  g.fillTriangle(3 * s, hy - 2 * s, 16 * s, hy - 8 * s, 10 * s, hy + 4 * s)
}

function drawAntenna(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  g.lineStyle(1.5 * s, 0xa0a0a0, 1)
  g.beginPath()
  g.moveTo(-3 * s, hy - 6 * s)
  g.lineTo(-5 * s, hy - 14 * s)
  g.moveTo(3 * s, hy - 6 * s)
  g.lineTo(5 * s, hy - 14 * s)
  g.strokePath()
  g.fillStyle(0xff5050, 1)
  g.fillCircle(-5 * s, hy - 14 * s, 1.5 * s)
  g.fillCircle(5 * s, hy - 14 * s, 1.5 * s)
}

function drawGoldenHelm(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  g.fillStyle(0xffd54a, 1)
  g.beginPath()
  g.arc(0, hy - 1 * s, 11 * s, Math.PI, Math.PI * 2)
  g.closePath()
  g.fillPath()
  g.lineStyle(1.5 * s, 0xa07000, 1)
  g.strokePath()
  // Crest spike
  g.fillStyle(0xff5050, 1)
  g.fillTriangle(-2 * s, hy - 12 * s, 2 * s, hy - 12 * s, 0, hy - 18 * s)
}

function drawConeHat(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  g.fillStyle(0x6020c8, 1)
  g.fillTriangle(-9 * s, hy - 4 * s, 9 * s, hy - 4 * s, 0, hy - 22 * s)
  g.fillStyle(0xffd54a, 1)
  g.fillCircle(0, hy - 22 * s, 2 * s)
  // Stars
  g.fillStyle(0xffd54a, 1)
  g.fillCircle(-3 * s, hy - 12 * s, 1 * s)
  g.fillCircle(3 * s, hy - 8 * s, 1 * s)
}

function drawIceCrown(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  g.fillStyle(0x80e0ff, 0.9)
  for (let i = -2; i <= 2; i++) {
    const x = i * 4 * s
    g.fillTriangle(x - 1.5 * s, hy - 4 * s, x + 1.5 * s, hy - 4 * s, x, hy - 11 * s)
  }
  g.lineStyle(1 * s, 0xffffff, 1)
  g.strokePath()
}

function drawWingedHelm(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  g.fillStyle(0xe0e0e0, 1)
  g.beginPath()
  g.arc(0, hy - 1 * s, 11 * s, Math.PI, Math.PI * 2)
  g.closePath()
  g.fillPath()
  // Side wings
  g.fillStyle(0xfafafa, 1)
  g.fillTriangle(-10 * s, hy - 4 * s, -18 * s, hy - 8 * s, -10 * s, hy)
  g.fillTriangle(10 * s, hy - 4 * s, 18 * s, hy - 8 * s, 10 * s, hy)
}

function drawJesterCrown(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  // Three-pointed jester hat with bells.
  g.fillStyle(0xc41a1a, 1)
  g.fillTriangle(-9 * s, hy - 4 * s, -3 * s, hy - 4 * s, -10 * s, hy - 14 * s)
  g.fillStyle(0xffd54a, 1)
  g.fillTriangle(-3 * s, hy - 4 * s, 3 * s, hy - 4 * s, 0, hy - 16 * s)
  g.fillStyle(0xc41a1a, 1)
  g.fillTriangle(3 * s, hy - 4 * s, 9 * s, hy - 4 * s, 10 * s, hy - 14 * s)
  // Bells
  g.fillStyle(0xffd54a, 1)
  g.fillCircle(-10 * s, hy - 14 * s, 1.5 * s)
  g.fillCircle(0, hy - 16 * s, 1.5 * s)
  g.fillCircle(10 * s, hy - 14 * s, 1.5 * s)
}

function drawGoggles(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  g.fillStyle(0x303840, 1)
  g.fillRect(-7 * s, hy - 2 * s, 14 * s, 1.5 * s)
  g.fillCircle(-4 * s, hy - 1 * s, 3 * s)
  g.fillCircle(4 * s, hy - 1 * s, 3 * s)
  g.fillStyle(0x80e0ff, 0.9)
  g.fillCircle(-4 * s, hy - 1 * s, 2 * s)
  g.fillCircle(4 * s, hy - 1 * s, 2 * s)
}

function drawSimpleHelm(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  // Heavy enemy helm — visor slit.
  g.fillStyle(0x4a5058, 1)
  g.fillCircle(0, hy, 9 * s)
  g.fillStyle(0x000000, 1)
  g.fillRect(-7 * s, hy - 1 * s, 14 * s, 2 * s)
  g.lineStyle(1 * s, 0x202428, 1)
  g.strokeCircle(0, hy, 9 * s)
}

function drawCrown(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  // Boss crown.
  g.fillStyle(0xffd54a, 1)
  g.fillRect(-10 * s, hy - 4 * s, 20 * s, 4 * s)
  for (let i = -2; i <= 2; i++) {
    const x = i * 4 * s
    g.fillTriangle(x - 2 * s, hy - 4 * s, x + 2 * s, hy - 4 * s, x, hy - 10 * s)
  }
  // Gem
  g.fillStyle(0xff2020, 1)
  g.fillCircle(0, hy - 2 * s, 1.6 * s)
}

function drawRageAura(g: Phaser.GameObjects.Graphics, s: number, hy: number): void {
  // Berserker — flame-like spikes around head.
  g.fillStyle(0xff5050, 0.85)
  g.fillCircle(0, hy, 12 * s)
  g.fillStyle(0xff2020, 1)
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2
    const x = Math.cos(ang) * 11 * s
    const y = hy + Math.sin(ang) * 11 * s
    g.fillCircle(x, y, 2 * s)
  }
}

// ---- Held items -----------------------------------------------------------

function drawHeldSpear(g: Phaser.GameObjects.Graphics, s: number, facingX: number): void {
  const dir = facingX >= 0 ? 1 : -1
  // Anchored at hip, pointing forward.
  g.lineStyle(2 * s, 0x4a3010, 1)
  g.beginPath()
  g.moveTo(-4 * s * dir, -10 * s)
  g.lineTo(20 * s * dir, -16 * s)
  g.strokePath()
  g.fillStyle(0xc0c0c0, 1)
  g.fillTriangle(20 * s * dir, -14 * s, 20 * s * dir, -18 * s, 28 * s * dir, -16 * s)
}

function drawHeldDualBlades(g: Phaser.GameObjects.Graphics, s: number, facingX: number): void {
  const dir = facingX >= 0 ? 1 : -1
  g.fillStyle(0xcfd8dc, 1)
  g.fillTriangle(8 * s * dir, -8 * s, 16 * s * dir, -10 * s, 8 * s * dir, -12 * s)
  g.fillTriangle(-8 * s * dir, -6 * s, -16 * s * dir, -8 * s, -8 * s * dir, -10 * s)
}

function drawHeldStaff(g: Phaser.GameObjects.Graphics, s: number, facingX: number): void {
  const dir = facingX >= 0 ? 1 : -1
  g.lineStyle(2 * s, 0x4a3010, 1)
  g.beginPath()
  g.moveTo(-2 * s * dir, 4 * s)
  g.lineTo(8 * s * dir, -28 * s)
  g.strokePath()
  // Orb
  g.fillStyle(0xa872f0, 0.5)
  g.fillCircle(8 * s * dir, -28 * s, 5 * s)
  g.fillStyle(0xa872f0, 1)
  g.fillCircle(8 * s * dir, -28 * s, 3 * s)
  g.fillStyle(0xffffff, 0.85)
  g.fillCircle(8 * s * dir, -28 * s, 1.2 * s)
}
