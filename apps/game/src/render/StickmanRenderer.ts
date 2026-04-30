import type { AccessoryKind, AttackKind, ClothingKind, WeaponShape } from '@stick/content'
type WeaponBack = { shape: WeaponShape; blade: number }
import type Phaser from 'phaser'

import { AccessoryRenderer } from './AccessoryRenderer'
import { ClothingRenderer } from './ClothingRenderer'
import { WeaponRenderer } from './WeaponRenderer'

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

/** slashL is the mirrored version of slashR (windup right, strike left). */
export function slashLSwingCurve(progress: number): number {
  return -slashRSwingCurve(progress)
}

/** Two-handed vertical chop: high windup → fast downward strike → recover. */
export function chopSwingCurve(progress: number): number {
  if (progress < 0.35) return -1.6 - progress * 0.8
  if (progress < 0.65) {
    const u = (progress - 0.35) / 0.3
    return -1.9 + u * 3.5
  }
  const u = (progress - 0.65) / 0.35
  return 1.6 - u * 1.0
}

/** Uppercut: arm starts low-back, ARC up to high-front. */
export function uppercutSwingCurve(progress: number): number {
  if (progress < 0.3) {
    const u = progress / 0.3
    return 1.4 - u * 0.4
  }
  if (progress < 0.65) {
    const u = (progress - 0.3) / 0.35
    return 1.0 - u * 2.6
  }
  const u = (progress - 0.65) / 0.35
  return -1.6 + u * 0.4
}

/** Spin: full 720° rotation across the duration. */
export function spinSwingCurve(progress: number): number {
  return -Math.PI / 2 + progress * Math.PI * 4
}

/** Kick leg phase (radians of thigh sweep toward attack dir). */
export function kickLegPhase(progress: number): number {
  if (progress < 0.3) return (progress / 0.3) * 0.5
  if (progress < 0.6) {
    const u = (progress - 0.3) / 0.3
    return 0.5 + u * 1.0
  }
  const u = (progress - 0.6) / 0.4
  return 1.5 - u * 1.5
}

/** The minimal slice of player/enemy state the renderer needs. */
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
  /** Optional body color override (player defaults to black, enemies to per-type color). */
  color?: number
  /** Optional equipped weapon — drawn in the swinging hand. */
  weapon?: { shape: WeaponShape; blade: number }
  /** Torso clothing kind. Drawn over the body line. */
  clothing?: ClothingKind
  /** Override clothing color (in 0xRRGGBB). */
  clothingColor?: number
  /** Head accessory / held overlay (horns, headband, helm, spear, etc). */
  accessory?: AccessoryKind
  /** Bow draw/release timer. While > 0 we render the bow attack pose
   *  (overrides the idle/walking arms). 0 = bow idle. */
  bowTimer?: number
  /** Total length of the bow animation, used to compute progress. */
  bowDuration?: number
  /** Direction the bow was aimed at when fired. */
  bowDirX?: number
  bowDirY?: number
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

    // Drop shadow under the actor (legacy drawShadow lines 3665-3671). Sits
    // visually beneath everything because we draw it before the body. It
    // stretches along the velocity vector and flattens slightly when moving
    // fast — gives the top-down view a sense of weight.
    this.drawShadow(g, p, scale)

    const G = STICKMAN_GEOMETRY
    // Hurt-flash pulse: body thickens and head puffs while absorbing the hit.
    // `hurtFlash` is set to ~0.12s on connect; we ramp from full → 0 over that
    // window. Pure cosmetic — no skeleton math changes.
    const hurtPulse = p.hurtFlash > 0 ? Math.min(1, p.hurtFlash / 0.12) : 0
    const widthMul = 1 + hurtPulse * 0.45
    const headMul = 1 + hurtPulse * 0.2
    const lineWidth = G.LINE_WIDTH * scale * widthMul

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
    const isKick = isAttacking && p.attackKind === 'kick'
    const leftHipX = -G.HIP_OFFSET_X * scale
    const rightHipX = G.HIP_OFFSET_X * scale
    const hipY = pelvisY - G.HIP_OFFSET_Y * scale
    if (isKick) {
      const progress = p.attackDuration > 0 ? 1 - p.attackTimer / p.attackDuration : 0
      const dirAngle = Math.atan2(p.attackDirX, -p.attackDirY)
      const phase = kickLegPhase(progress)
      // Right leg performs the kick.
      this.drawLimb(
        g,
        rightHipX,
        hipY,
        dirAngle * Math.min(phase, 1),
        Math.max(0, 1 - phase) * 1.1,
        G.UPPER_LEG_LENGTH * scale,
        G.LOWER_LEG_LENGTH * scale,
        1,
        'foot',
        color,
        lineWidth,
      )
      // Left leg planted (slight bend).
      this.drawLimb(
        g,
        leftHipX,
        hipY,
        0.05,
        0.4,
        G.UPPER_LEG_LENGTH * scale,
        G.LOWER_LEG_LENGTH * scale,
        1,
        'foot',
        color,
        lineWidth,
      )
    } else {
      const legSwingAmp = G.LEG_SWING_AMPLITUDE
      const swingL = Math.sin(p.walkPhase) * legSwingAmp
      const swingR = Math.sin(p.walkPhase + Math.PI) * legSwingAmp
      this.drawLimb(
        g,
        leftHipX,
        hipY,
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
        rightHipX,
        hipY,
        swingR,
        Math.max(0, -swingR) * G.LEG_KNEE_BEND_FACTOR,
        G.UPPER_LEG_LENGTH * scale,
        G.LOWER_LEG_LENGTH * scale,
        1,
        'foot',
        color,
        lineWidth,
      )
    }

    // ---- WEAPON ON BACK (legacy 2459-2468) ----
    // Sheathed silhouette behind the torso when the player isn't swinging.
    // Drawn before the torso line so the body covers the grip.
    if (!isAttacking && p.weapon) {
      this.drawWeaponOnBack(g, p.weapon, scale, shoulderY)
    }

    // ---- TORSO ----
    g.lineStyle(lineWidth, color, 1)
    g.beginPath()
    g.moveTo(0, pelvisY)
    g.lineTo(0, shoulderY)
    g.strokePath()

    // ---- CLOTHING (over torso, before head) ----
    if (p.clothing && p.clothing !== 'tunic' && p.hurtFlash <= 0) {
      ClothingRenderer.draw(g, p.clothing, {
        scale,
        color,
        ...(p.clothingColor !== undefined ? { tint: p.clothingColor } : {}),
      })
    } else if (p.clothing === 'tunic' && p.hurtFlash <= 0) {
      ClothingRenderer.draw(g, 'tunic', {
        scale,
        color,
        ...(p.clothingColor !== undefined ? { tint: p.clothingColor } : {}),
      })
    }

    // ---- HEAD ----
    g.fillStyle(color, 1)
    g.fillCircle(0, headY, G.HEAD_RADIUS * scale * headMul)

    // ---- EYE (legacy lines 2512-2519) ----
    // Single white pupil offset toward facing. Skipped on white/light bodies
    // (jester/iceKing lookups in legacy used color !== '#fff' && '#e0e0e0')
    // and during hurtFlash so the white-flash silhouette stays clean.
    if (p.hurtFlash <= 0 && color !== HURT_COLOR && color !== 0xe0e0e0 && color !== 0xffffff) {
      const headR = G.HEAD_RADIUS * scale
      const dirX = p.facingX >= 0 ? 1 : -1
      g.fillStyle(0xffffff, 1)
      g.fillCircle(headR * 0.4 * dirX, headY - headR * 0.1, headR * 0.22)
    }

    // ---- ACCESSORY (drawn on top of head) ----
    if (p.accessory && p.accessory !== 'none' && p.hurtFlash <= 0) {
      AccessoryRenderer.draw(g, p.accessory, {
        scale,
        headY,
        color,
        facingX: p.facingX,
      })
    }

    // ---- ARMS ----
    this.drawArms(g, p, color, lineWidth, scale, shoulderY)

    g.restore()
  }

  private drawShadow(g: Phaser.GameObjects.Graphics, p: StickmanRenderState, scale: number): void {
    const speed = Math.hypot(p.vx, p.vy)
    // Stretch with movement, capped so it doesn't look like a smear at top speed.
    const stretchX = 1 + Math.min(0.6, speed * 0.06)
    const flatY = 1 - Math.min(0.45, speed * 0.045)
    // Drift opposite to motion so the actor appears to "outrun" their shadow.
    const drift = Math.min(8, speed * 0.6)
    const dirLen = speed > 0.01 ? 1 / speed : 0
    const offX = -p.vx * dirLen * drift
    const offY = -p.vy * dirLen * drift * 0.5

    const baseR = 16 * scale
    const yOffset = 6 * scale
    g.fillStyle(0x000000, 0.45)
    g.fillEllipse(offX, yOffset + offY, baseR * 1.5 * stretchX, 6 * scale * flatY)
  }

  private computeColor(p: StickmanRenderState): number {
    if (p.hurtFlash > 0) return HURT_COLOR
    if (p.iframes > 0) {
      // Blink ~6Hz: alternate every ~0.083s of iframes elapsed.
      const blink = Math.floor(p.iframes * 12) % 2 === 0
      if (blink) return HURT_COLOR
    }
    return p.color ?? DEFAULT_COLOR
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

  /** Translates the canvas to (handX, handY), rotates so blade points along
   *  the swing angle, and draws the weapon. Restores after. */
  private drawWeaponAt(
    g: Phaser.GameObjects.Graphics,
    weapon: { shape: WeaponShape; blade: number } | undefined,
    handX: number,
    handY: number,
    ang: number,
    scale: number,
  ): void {
    if (!weapon) return
    g.save()
    g.translateCanvas(handX, handY)
    g.rotateCanvas(ang)
    WeaponRenderer.draw(g, weapon.shape, weapon.blade, scale)
    g.restore()
  }

  /** Variant that computes the hand position from a shoulder + arm. */
  private drawWeaponFromShoulder(
    g: Phaser.GameObjects.Graphics,
    weapon: { shape: WeaponShape; blade: number } | undefined,
    rootX: number,
    rootY: number,
    ang: number,
    armLen: number,
    scale: number,
  ): void {
    if (!weapon) return
    const handX = rootX + Math.sin(ang) * armLen
    const handY = rootY - Math.cos(ang) * armLen
    this.drawWeaponAt(g, weapon, handX, handY, ang, scale)
  }

  private drawSlashArm(
    g: Phaser.GameObjects.Graphics,
    rootX: number,
    rootY: number,
    swordAng: number,
    armLen: number,
    color: number,
    lineWidth: number,
  ): void {
    const handX = rootX + Math.sin(swordAng) * armLen
    const handY = rootY - Math.cos(swordAng) * armLen
    g.lineStyle(lineWidth, color, 1)
    g.beginPath()
    g.moveTo(rootX, rootY)
    g.lineTo(handX, handY)
    g.strokePath()
    g.fillStyle(color, 1)
    g.fillCircle(handX, handY, lineWidth * 0.55)
  }

  /**
   * Sheathed weapon on the back during idle. Diagonal silhouette behind the
   * shoulders — short hilt + thin blade. Color comes from the weapon shape
   * configuration so each weapon reads distinct.
   */
  private drawWeaponOnBack(
    g: Phaser.GameObjects.Graphics,
    weapon: WeaponBack,
    scale: number,
    shoulderY: number,
  ): void {
    // Anchor between the shoulders, tilted ~25° from vertical.
    const baseX = -2 * scale
    const baseY = shoulderY + 4 * scale
    const length = 26 * scale
    const tilt = 0.4 // radians
    const tipX = baseX + Math.sin(-tilt) * length
    const tipY = baseY - Math.cos(-tilt) * length
    // Blade.
    g.lineStyle(2.4 * scale, weapon.blade, 0.85)
    g.beginPath()
    g.moveTo(baseX, baseY)
    g.lineTo(tipX, tipY)
    g.strokePath()
    // Crossguard / pommel hint near the base.
    g.lineStyle(1.5 * scale, 0x3a2a1a, 0.9)
    const hiltAngle = -tilt + Math.PI / 2
    const hx = baseX + Math.sin(hiltAngle) * 3 * scale
    const hy = baseY - Math.cos(hiltAngle) * 3 * scale
    const hx2 = baseX - Math.sin(hiltAngle) * 3 * scale
    const hy2 = baseY + Math.cos(hiltAngle) * 3 * scale
    g.beginPath()
    g.moveTo(hx, hy)
    g.lineTo(hx2, hy2)
    g.strokePath()
  }

  /**
   * Bow draw + release. Three phases via progress (0..1):
   *   - 0..0.45: drawing — bow rises, string pulls back, arrow nocks
   *   - 0.45..0.65: release — string snaps forward, arrow leaves
   *   - 0.65..1: recovery — bow lowers
   *
   * `aimAng` is the swing-frame angle (0 = up, +pi/2 = right) for parity with
   * the rest of the renderer's `(sin, -cos)` convention.
   */
  private drawBowAttack(
    g: Phaser.GameObjects.Graphics,
    scale: number,
    shoulderY: number,
    aimAng: number,
    progress: number,
    color: number,
    lineWidth: number,
  ): void {
    const G = STICKMAN_GEOMETRY
    // Hand position: in front of the body, distance grows then settles.
    const reachLerp =
      progress < 0.45 ? progress / 0.45 : progress < 0.65 ? 1 : 1 - (progress - 0.65) / 0.7
    const bowDist = (16 + 8 * reachLerp) * scale
    const bowX = Math.sin(aimAng) * bowDist
    const bowY = shoulderY - Math.cos(aimAng) * bowDist

    // Draw the bow arms (forward shoulder).
    const leftShoulderX = -G.SHOULDER_OFFSET_X * scale
    const rightShoulderX = G.SHOULDER_OFFSET_X * scale
    g.lineStyle(lineWidth, color, 1)
    g.beginPath()
    g.moveTo(leftShoulderX, shoulderY)
    g.lineTo(bowX, bowY)
    g.strokePath()

    // Bow body — curved limbs + grip.
    const perpAng = aimAng + Math.PI / 2
    const limbReach = 14 * scale
    const limbTipAX = bowX + Math.sin(perpAng) * limbReach
    const limbTipAY = bowY - Math.cos(perpAng) * limbReach
    const limbTipBX = bowX - Math.sin(perpAng) * limbReach
    const limbTipBY = bowY + Math.cos(perpAng) * limbReach
    g.lineStyle(2.4 * scale, 0xa06820, 1)
    g.beginPath()
    g.moveTo(limbTipAX, limbTipAY)
    // Curve approximation: midpoint pushed forward along the aim.
    const midAhead = 4 * scale
    g.lineTo(bowX + Math.sin(aimAng) * midAhead, bowY - Math.cos(aimAng) * midAhead)
    g.lineTo(limbTipBX, limbTipBY)
    g.strokePath()

    // Bowstring: in 0..0.45 it bends back as we draw, then snaps forward at release.
    const drawDepth =
      progress < 0.45
        ? -8 * scale * (progress / 0.45)
        : progress < 0.55
          ? -8 * scale * (1 - (progress - 0.45) / 0.1)
          : 0
    const stringMidX = bowX - Math.sin(aimAng) * drawDepth
    const stringMidY = bowY + Math.cos(aimAng) * drawDepth
    g.lineStyle(1 * scale, 0xeeeeee, 0.9)
    g.beginPath()
    g.moveTo(limbTipAX, limbTipAY)
    g.lineTo(stringMidX, stringMidY)
    g.lineTo(limbTipBX, limbTipBY)
    g.strokePath()

    // Drawing-back arm (left) + nocked arrow.
    if (progress < 0.5) {
      const drawHandX = stringMidX
      const drawHandY = stringMidY
      g.lineStyle(lineWidth, color, 1)
      g.beginPath()
      g.moveTo(rightShoulderX, shoulderY)
      g.lineTo(drawHandX, drawHandY)
      g.strokePath()
      // Nocked arrow shaft from string mid forward to bow grip.
      g.lineStyle(1.5 * scale, 0xa06820, 1)
      g.beginPath()
      g.moveTo(stringMidX, stringMidY)
      g.lineTo(bowX, bowY)
      g.strokePath()
      // Arrow tip.
      g.fillStyle(0xcfd8dc, 1)
      const tipX = bowX + Math.sin(aimAng) * 4 * scale
      const tipY = bowY - Math.cos(aimAng) * 4 * scale
      g.fillCircle(tipX, tipY, 1.4 * scale)
    } else {
      // After release: hand drops to the side.
      this.drawIdleArm(g, rightShoulderX, shoulderY, scale, 1, color, lineWidth)
    }
  }

  /**
   * Faint motion-line arc that traces the path the hand swept during a swing.
   * Two thin layers (outer = transparent, inner = brighter) read as a smear
   * frame without re-animating the skeleton. Pure cosmetic.
   */
  private drawSwingSmear(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    radius: number,
    startAng: number,
    endAng: number,
    lineWidth: number,
  ): void {
    // Phaser's `arc` uses standard angles where 0 = +x; our hand uses
    // (sin, -cos) where 0 = +y up. Convert by subtracting PI/2.
    const a0 = startAng - Math.PI / 2
    const a1 = endAng - Math.PI / 2
    const ccw = a1 < a0
    g.lineStyle(lineWidth * 1.4, 0xffffff, 0.18)
    g.beginPath()
    g.arc(cx, cy, radius, a0, a1, ccw)
    g.strokePath()
    g.lineStyle(lineWidth * 0.55, 0xffffff, 0.55)
    g.beginPath()
    g.arc(cx, cy, radius, a0, a1, ccw)
    g.strokePath()
  }

  private drawIdleArm(
    g: Phaser.GameObjects.Graphics,
    rootX: number,
    rootY: number,
    scale: number,
    dir: 1 | -1,
    color: number,
    lineWidth: number,
  ): void {
    const G = STICKMAN_GEOMETRY
    this.drawLimb(
      g,
      rootX,
      rootY,
      0.2 * dir,
      0.4,
      G.UPPER_ARM_LENGTH * scale,
      G.LOWER_ARM_LENGTH * scale,
      dir,
      'hand',
      color,
      lineWidth,
    )
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
    const isShooting =
      !isAttacking && p.bowTimer !== undefined && p.bowTimer > 0 && (p.bowDuration ?? 0) > 0

    if (isShooting) {
      const progress = 1 - (p.bowTimer ?? 0) / (p.bowDuration ?? 1)
      const aimAng = Math.atan2(p.bowDirX ?? p.facingX, -(p.bowDirY ?? p.facingY))
      this.drawBowAttack(g, scale, shoulderYOff, aimAng, progress, color, lineWidth)
      return
    }

    if (isAttacking) {
      const progress = p.attackDuration > 0 ? 1 - p.attackTimer / p.attackDuration : 0
      const dirAngle = Math.atan2(p.attackDirX, -p.attackDirY)
      const armLen = (G.UPPER_ARM_LENGTH + G.LOWER_ARM_LENGTH) * scale * 0.95
      switch (p.attackKind) {
        case 'slashR': {
          const ang = dirAngle + slashRSwingCurve(progress)
          // Smear: faint arc trailing from the windup angle to the current
          // angle during the strike phase (0.4..0.8). Pure cosmetic.
          if (progress > 0.4 && progress < 0.85) {
            const startAng = dirAngle + slashRSwingCurve(Math.max(0.4, progress - 0.18))
            this.drawSwingSmear(g, 0, shoulderYOff, armLen, startAng, ang, lineWidth)
          }
          this.drawSlashArm(g, rightShoulderX, shoulderYOff, ang, armLen, color, lineWidth)
          this.drawIdleArm(g, leftShoulderX, shoulderYOff, scale, -1, color, lineWidth)
          this.drawWeaponFromShoulder(g, p.weapon, rightShoulderX, shoulderYOff, ang, armLen, scale)
          return
        }
        case 'slashL': {
          const ang = dirAngle + slashLSwingCurve(progress)
          if (progress > 0.4 && progress < 0.85) {
            const startAng = dirAngle + slashLSwingCurve(Math.max(0.4, progress - 0.18))
            this.drawSwingSmear(g, 0, shoulderYOff, armLen, startAng, ang, lineWidth)
          }
          this.drawSlashArm(g, leftShoulderX, shoulderYOff, ang, armLen, color, lineWidth)
          this.drawIdleArm(g, rightShoulderX, shoulderYOff, scale, 1, color, lineWidth)
          this.drawWeaponFromShoulder(g, p.weapon, leftShoulderX, shoulderYOff, ang, armLen, scale)
          return
        }
        case 'chop': {
          const ang = dirAngle + chopSwingCurve(progress)
          // Vertical chop smear during the down-stroke.
          if (progress > 0.35 && progress < 0.8) {
            const startAng = dirAngle + chopSwingCurve(Math.max(0.35, progress - 0.15))
            this.drawSwingSmear(g, 0, shoulderYOff, armLen, startAng, ang, lineWidth)
          }
          const handX = Math.sin(ang) * armLen
          const handY = -Math.cos(ang) * armLen
          g.lineStyle(lineWidth, color, 1)
          g.beginPath()
          g.moveTo(leftShoulderX, shoulderYOff)
          g.lineTo(handX, handY)
          g.moveTo(rightShoulderX, shoulderYOff)
          g.lineTo(handX, handY)
          g.strokePath()
          g.fillStyle(color, 1)
          g.fillCircle(handX, handY, lineWidth * 0.6)
          this.drawWeaponAt(g, p.weapon, handX, handY, ang, scale)
          return
        }
        case 'uppercut': {
          const ang = dirAngle + uppercutSwingCurve(progress)
          this.drawSlashArm(g, rightShoulderX, shoulderYOff, ang, armLen, color, lineWidth)
          this.drawIdleArm(g, leftShoulderX, shoulderYOff, scale, -1, color, lineWidth)
          this.drawWeaponFromShoulder(g, p.weapon, rightShoulderX, shoulderYOff, ang, armLen, scale)
          return
        }
        case 'spin': {
          const ang = spinSwingCurve(progress)
          const handX = Math.sin(ang) * armLen
          const handY = -Math.cos(ang) * armLen
          g.lineStyle(lineWidth, color, 1)
          g.beginPath()
          g.moveTo(0, shoulderYOff)
          g.lineTo(handX, handY)
          g.strokePath()
          g.fillStyle(color, 1)
          g.fillCircle(handX, handY, lineWidth * 0.6)
          // Trailing arc (motion line).
          g.lineStyle(lineWidth * 0.6, 0xffd54a, 0.5)
          g.beginPath()
          g.arc(0, shoulderYOff, armLen, ang - 1.2 - Math.PI / 2, ang - Math.PI / 2)
          g.strokePath()
          this.drawWeaponAt(g, p.weapon, handX, handY, ang, scale)
          return
        }
        case 'kick': {
          // Both arms balanced at the sides; render legs explicitly via kick override.
          this.drawIdleArm(g, leftShoulderX, shoulderYOff, scale, -1, color, lineWidth)
          this.drawIdleArm(g, rightShoulderX, shoulderYOff, scale, 1, color, lineWidth)
          return
        }
      }
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
