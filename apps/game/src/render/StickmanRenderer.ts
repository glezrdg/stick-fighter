import type { AttackKind } from '@stick/content'
import type Phaser from 'phaser'

/** Geometry constants extracted from the legacy drawStickman (see plan agent report). */
export const STICKMAN_GEOMETRY = {
  HEAD_RADIUS: 8,
  TORSO_HEIGHT: 26,
  UPPER_LEG_LENGTH: 18,
  LOWER_LEG_LENGTH: 18,
  UPPER_ARM_LENGTH: 14,
  LOWER_ARM_LENGTH: 14,
  SHOULDER_OFFSET_X: 7,
  SHOULDER_OFFSET_Y: 2,
  HIP_OFFSET_X: 4,
  HIP_OFFSET_Y: 2,
  LINE_WIDTH: 5.5,
  ARM_SWING_AMPLITUDE: 0.6,
  LEG_SWING_AMPLITUDE: 0.7,
  LEG_KNEE_BEND_FACTOR: 1.2,
  LEAN_ROTATION_MAX: 0.18,
  LEAN_SPEED_FACTOR: 0.045,
  LEAN_TORSO_PIVOT_Y: 36,
} as const

/**
 * Pure function: arm angle offset (radians) at a given swing progress for the
 * `slashR` attack. Matches the legacy 3-phase swing (windup / strike /
 * follow-through). Exported so combat logic can compute hitbox timing.
 */
export function slashRSwingCurve(progress: number): number {
  if (progress < 0.4) {
    const u = progress / 0.4
    return -1.4 + u * 0.6 // windup: -1.4 → -0.8
  } else if (progress < 0.7) {
    const u = (progress - 0.4) / 0.3
    return -0.8 + u * 2.1 // strike: -0.8 → +1.3
  } else {
    const u = (progress - 0.7) / 0.3
    return 1.3 - u * 1.3 // follow-through: +1.3 → 0
  }
}

/** The minimal slice of player state the renderer needs. */
export interface StickmanRenderState {
  vx: number
  vy: number
  facingX: number
  facingY: number
  walkPhase: number
  attackTimer: number
  attackDuration: number
  attackKind: AttackKind | null
  attackDirX: number
  attackDirY: number
  hurtFlash: number
  iframes: number
}

const DEFAULT_COLOR = 0x000000
const HURT_COLOR = 0xffffff

/**
 * Stateless renderer. Each frame: `clear()`, redraw the pose into `g`.
 * The Graphics object is expected to be positioned at the player's world
 * coordinates by the caller; everything is drawn relative to (0, 0).
 *
 * F1.3 implements the minimum: body, head, legs walking, idle/walking arms,
 * slashR attack pose, lean. Accessories, clothing, sword shapes, and
 * non-slashR attack visuals come in F2.
 */
export class StickmanRenderer {
  draw(g: Phaser.GameObjects.Graphics, p: StickmanRenderState, scale = 1): void {
    g.clear()

    const G = STICKMAN_GEOMETRY
    const lineWidth = G.LINE_WIDTH * scale

    // Color: white during hurt flash, blink during iframes, black otherwise.
    const color = this.computeColor(p)

    // Lean while moving (not while attacking).
    const isAttacking = p.attackTimer > 0 && p.attackKind !== null
    const leanRad = (() => {
      if (isAttacking) return 0
      const speed = Math.hypot(p.vx, p.vy)
      if (speed < 0.1) return 0
      // Lean direction matches horizontal velocity sign.
      const sign = p.vx >= 0 ? 1 : -1
      const mag = Math.min(G.LEAN_ROTATION_MAX, speed * G.LEAN_SPEED_FACTOR)
      return sign * mag
    })()

    g.save()
    if (leanRad !== 0) {
      g.translateCanvas(0, -G.LEAN_TORSO_PIVOT_Y * scale)
      g.rotateCanvas(leanRad)
      g.translateCanvas(0, G.LEAN_TORSO_PIVOT_Y * scale)
    }

    // Anchor: pelvis at (0, 0) for simplicity.
    const pelvisY = 0
    const shoulderY = pelvisY - G.TORSO_HEIGHT * scale
    const headY = shoulderY - G.HEAD_RADIUS * scale * 1.2

    g.lineStyle(lineWidth, color, 1)

    // ---- LEGS ----
    const legSwingAmp = G.LEG_SWING_AMPLITUDE
    const swingL = Math.sin(p.walkPhase) * legSwingAmp
    const swingR = Math.sin(p.walkPhase + Math.PI) * legSwingAmp
    this.drawLimb(
      g,
      -G.HIP_OFFSET_X * scale,
      pelvisY - G.HIP_OFFSET_Y * scale,
      swingL,
      Math.max(0, -swingL) * G.LEG_KNEE_BEND_FACTOR,
      G.UPPER_LEG_LENGTH * scale,
      G.LOWER_LEG_LENGTH * scale,
      1,
      'foot',
      color,
      lineWidth,
    )
    this.drawLimb(
      g,
      G.HIP_OFFSET_X * scale,
      pelvisY - G.HIP_OFFSET_Y * scale,
      swingR,
      Math.max(0, -swingR) * G.LEG_KNEE_BEND_FACTOR,
      G.UPPER_LEG_LENGTH * scale,
      G.LOWER_LEG_LENGTH * scale,
      1,
      'foot',
      color,
      lineWidth,
    )

    // ---- TORSO ----
    g.lineStyle(lineWidth, color, 1)
    g.beginPath()
    g.moveTo(0, pelvisY)
    g.lineTo(0, shoulderY)
    g.strokePath()

    // ---- HEAD ----
    g.fillStyle(color, 1)
    g.fillCircle(0, headY, G.HEAD_RADIUS * scale)

    // ---- ARMS ----
    this.drawArms(g, p, color, lineWidth, scale, shoulderY)

    g.restore()
  }

  private computeColor(p: StickmanRenderState): number {
    if (p.hurtFlash > 0) return HURT_COLOR
    if (p.iframes > 0) {
      // Blink ~6Hz: alternate every ~0.083s of iframes elapsed.
      const blink = Math.floor(p.iframes * 12) % 2 === 0
      if (blink) return HURT_COLOR
    }
    return DEFAULT_COLOR
  }

  /**
   * Two-bone limb. Both bones use absolute angles relative to "down" (Y+);
   * the second bone bends by `kneeBend * dir` away from the first.
   * Exact port of the legacy's drawTwoBoneLimb algorithm.
   */
  private drawLimb(
    g: Phaser.GameObjects.Graphics,
    rootX: number,
    rootY: number,
    hipAngle: number,
    kneeBend: number,
    L1: number,
    L2: number,
    dir: 1 | -1,
    tip: 'hand' | 'foot',
    color: number,
    lineWidth: number,
  ): void {
    const a1 = hipAngle
    const jointX = rootX + Math.sin(a1) * L1
    const jointY = rootY + Math.cos(a1) * L1
    const a2 = a1 - kneeBend * dir
    const tipX = jointX + Math.sin(a2) * L2
    const tipY = jointY + Math.cos(a2) * L2

    g.lineStyle(lineWidth, color, 1)
    g.beginPath()
    g.moveTo(rootX, rootY)
    g.lineTo(jointX, jointY)
    g.lineTo(tipX, tipY)
    g.strokePath()

    g.fillStyle(color, 1)
    if (tip === 'hand') {
      g.fillCircle(tipX, tipY, lineWidth * 0.55)
    } else {
      // Foot: rotated ellipse (oriented along the lower-bone direction).
      g.save()
      g.translateCanvas(tipX, tipY)
      g.rotateCanvas(a2)
      g.fillEllipse(0, 0, lineWidth * 1.7, lineWidth * 0.9)
      g.restore()
    }
  }

  private drawArms(
    g: Phaser.GameObjects.Graphics,
    p: StickmanRenderState,
    color: number,
    lineWidth: number,
    scale: number,
    shoulderY: number,
  ): void {
    const G = STICKMAN_GEOMETRY
    const leftShoulderX = -G.SHOULDER_OFFSET_X * scale
    const rightShoulderX = G.SHOULDER_OFFSET_X * scale
    const shoulderYOff = shoulderY + G.SHOULDER_OFFSET_Y * scale

    const isAttacking = p.attackTimer > 0 && p.attackKind !== null
    const isSlashR = isAttacking && p.attackKind === 'slashR'

    if (isSlashR) {
      // Right arm performs the slash; left arm idles.
      const progress = p.attackDuration > 0 ? 1 - p.attackTimer / p.attackDuration : 0
      const angOff = slashRSwingCurve(progress)
      // Convert attackDir to angle (Y+ is down, so this matches the legacy formula).
      const dirAngle = Math.atan2(p.attackDirX, -p.attackDirY)
      const swordAng = dirAngle + angOff
      // The slash arm is drawn as a single straight stroke at swordAng,
      // length = upper + lower arm.
      const armLen = (G.UPPER_ARM_LENGTH + G.LOWER_ARM_LENGTH) * scale * 0.95
      const handX = rightShoulderX + Math.sin(swordAng) * armLen
      const handY = shoulderYOff - Math.cos(swordAng) * armLen

      g.lineStyle(lineWidth, color, 1)
      g.beginPath()
      g.moveTo(rightShoulderX, shoulderYOff)
      g.lineTo(handX, handY)
      g.strokePath()
      g.fillStyle(color, 1)
      g.fillCircle(handX, handY, lineWidth * 0.55)

      // Idle left arm hanging.
      this.drawLimb(
        g,
        leftShoulderX,
        shoulderYOff,
        0.2,
        0.4,
        G.UPPER_ARM_LENGTH * scale,
        G.LOWER_ARM_LENGTH * scale,
        -1,
        'hand',
        color,
        lineWidth,
      )
      return
    }

    // Idle / walking arms: oscillate anti-phase with legs.
    const armSwingL = Math.sin(p.walkPhase + Math.PI) * G.ARM_SWING_AMPLITUDE
    const armSwingR = Math.sin(p.walkPhase) * G.ARM_SWING_AMPLITUDE
    this.drawLimb(
      g,
      leftShoulderX,
      shoulderYOff,
      armSwingL * 0.5,
      0.4,
      G.UPPER_ARM_LENGTH * scale,
      G.LOWER_ARM_LENGTH * scale,
      -1,
      'hand',
      color,
      lineWidth,
    )
    this.drawLimb(
      g,
      rightShoulderX,
      shoulderYOff,
      armSwingR * 0.5,
      0.4,
      G.UPPER_ARM_LENGTH * scale,
      G.LOWER_ARM_LENGTH * scale,
      1,
      'hand',
      color,
      lineWidth,
    )
  }
}
