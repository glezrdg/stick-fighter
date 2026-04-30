import type { Skin, Weapon, WeaponShape } from '@stick/content'
import { type Component, onMount } from 'solid-js'

/**
 * Tiny 2D-canvas previews used inside ShopRow. Reproduces the silhouette of
 * each weapon shape and a head-and-torso slice of each skin so the player
 * can see what they're buying. These are NOT the in-game render — they're
 * a simplified mirror of WeaponRenderer / StickmanRenderer.
 *
 * Pure DOM canvas (not Phaser) so it runs in the Solid overlay without
 * spinning up a second WebGL context per row.
 */

const PREVIEW_W = 56
const PREVIEW_H = 56

export const WeaponPreview: Component<{ weapon: Weapon }> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined

  onMount(() => {
    if (!canvasRef) return
    const ctx = canvasRef.getContext('2d')
    if (!ctx) return
    drawWeaponShape(ctx, props.weapon.shape, props.weapon.blade)
  })

  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW_W}
      height={PREVIEW_H}
      style={{
        background: 'radial-gradient(circle at 50% 50%, #2a2a2a 0%, #0a0a0a 100%)',
        'border-radius': '8px',
        border: '1.5px solid #3a3a3a',
        'box-shadow': `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 8px ${props.weapon.blade}40`,
      }}
    />
  )
}

export const SkinPreview: Component<{ skin: Skin }> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined

  onMount(() => {
    if (!canvasRef) return
    const ctx = canvasRef.getContext('2d')
    if (!ctx) return
    drawSkinPreview(ctx, props.skin)
  })

  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW_W}
      height={PREVIEW_H}
      style={{
        background: 'radial-gradient(circle at 50% 50%, #2a2a2a 0%, #0a0a0a 100%)',
        'border-radius': '8px',
        border: '1.5px solid #3a3a3a',
      }}
    />
  )
}

// ---- Weapon shape drawing -------------------------------------------------

function drawWeaponShape(ctx: CanvasRenderingContext2D, shape: WeaponShape, blade: string): void {
  ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H)
  ctx.save()
  // Center, rotated 45° for a dynamic silhouette.
  ctx.translate(PREVIEW_W / 2, PREVIEW_H / 2)
  ctx.rotate(-Math.PI / 5)

  const handle = '#3a2a1a'
  const guard = '#5a3a1a'

  switch (shape) {
    case 'katana':
      bladeLine(ctx, blade, 6, 28, 4)
      hilt(ctx, handle, guard, 6)
      break
    case 'greatsword':
      bladeLine(ctx, blade, 8, 32, 5)
      hilt(ctx, handle, guard, 8)
      break
    case 'axe':
      // Wide head, short shaft.
      ctx.fillStyle = handle
      ctx.fillRect(-2, -22, 4, 28)
      ctx.fillStyle = blade
      ctx.beginPath()
      ctx.moveTo(0, -22)
      ctx.lineTo(14, -16)
      ctx.lineTo(14, -4)
      ctx.lineTo(0, -8)
      ctx.closePath()
      ctx.fill()
      break
    case 'hammer':
      ctx.fillStyle = handle
      ctx.fillRect(-2, -22, 4, 28)
      ctx.fillStyle = blade
      ctx.fillRect(-10, -22, 20, 10)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      ctx.strokeRect(-10, -22, 20, 10)
      break
    case 'scythe':
      ctx.strokeStyle = handle
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(0, 14)
      ctx.lineTo(0, -22)
      ctx.stroke()
      ctx.strokeStyle = blade
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(0, -22, 14, Math.PI, Math.PI * 1.6)
      ctx.stroke()
      break
    case 'dual':
      bladeLine(ctx, blade, 4, 22, 3)
      ctx.translate(8, 0)
      bladeLine(ctx, blade, 4, 22, 3)
      break
    case 'plasma':
      bladeLine(ctx, blade, 6, 28, 5)
      // Glow.
      ctx.shadowColor = blade
      ctx.shadowBlur = 8
      bladeLine(ctx, blade, 6, 28, 3)
      ctx.shadowBlur = 0
      hilt(ctx, '#000', '#222', 6)
      break
    case 'ki':
    case 'voidScythe': {
      // Energy blade — fat with strong glow.
      ctx.shadowColor = blade
      ctx.shadowBlur = 10
      bladeLine(ctx, blade, 7, 28, 6)
      ctx.shadowBlur = 0
      hilt(ctx, '#1a0a2a', '#3a1a4a', 6)
      break
    }
  }

  ctx.restore()
}

function bladeLine(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
  length: number,
  taper: number,
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(-width / 2, length * 0.2)
  ctx.lineTo(width / 2, length * 0.2)
  ctx.lineTo(taper / 2, -length)
  ctx.lineTo(-taper / 2, -length)
  ctx.closePath()
  ctx.fill()
}

function hilt(ctx: CanvasRenderingContext2D, handle: string, guard: string, width: number): void {
  // Crossguard.
  ctx.fillStyle = guard
  ctx.fillRect(-width - 2, length(0.2) - 2, (width + 2) * 2, 4)
  // Grip.
  ctx.fillStyle = handle
  ctx.fillRect(-2, length(0.2) + 2, 4, 12)
  // Pommel.
  ctx.fillStyle = guard
  ctx.beginPath()
  ctx.arc(0, length(0.2) + 16, 2.5, 0, Math.PI * 2)
  ctx.fill()
}

// helper for hilt to read like the legacy
function length(_: number): number {
  return 6 // matches the bladeLine length 28 * 0.2 ≈ 5.6 → 6
}

// ---- Skin preview ---------------------------------------------------------

function drawSkinPreview(ctx: CanvasRenderingContext2D, skin: Skin): void {
  ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H)
  ctx.save()
  ctx.translate(PREVIEW_W / 2, PREVIEW_H / 2 + 8)

  const bodyColor = skin.color
  const clothingColor = skin.clothingColor ?? '#5a3030'

  // Torso.
  ctx.strokeStyle = bodyColor
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, -2)
  ctx.lineTo(0, 14)
  ctx.stroke()

  // Clothing band.
  drawClothing(ctx, skin.clothing, clothingColor)

  // Head.
  ctx.fillStyle = bodyColor
  ctx.beginPath()
  ctx.arc(0, -10, 7, 0, Math.PI * 2)
  ctx.fill()

  // Eye (skip on white-ish bodies).
  if (bodyColor.toLowerCase() !== '#ffffff' && bodyColor.toLowerCase() !== '#e0e0e0') {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(2.5, -11, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }

  // Accessory hint (just a top tuft for now — silhouette indicator).
  drawAccessoryHint(ctx, skin.accessory)

  ctx.restore()
}

function drawClothing(ctx: CanvasRenderingContext2D, kind: Skin['clothing'], color: string): void {
  switch (kind) {
    case 'tunic':
      ctx.fillStyle = color
      ctx.fillRect(-6, 0, 12, 10)
      break
    case 'wrap':
      ctx.fillStyle = color
      ctx.fillRect(-7, 1, 14, 4)
      ctx.fillRect(-6, 6, 12, 4)
      break
    case 'robe':
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(-8, 0)
      ctx.lineTo(8, 0)
      ctx.lineTo(10, 14)
      ctx.lineTo(-10, 14)
      ctx.closePath()
      ctx.fill()
      break
    case 'samurai':
      ctx.fillStyle = color
      ctx.fillRect(-7, 0, 14, 12)
      ctx.fillStyle = '#000'
      ctx.fillRect(-1, 0, 2, 12)
      break
    case 'tank':
      ctx.fillStyle = color
      ctx.fillRect(-5, 1, 10, 11)
      break
    case 'plate':
      ctx.fillStyle = color
      ctx.fillRect(-7, -1, 14, 13)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      ctx.strokeRect(-7, -1, 14, 13)
      break
    case 'cloak':
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(-8, -2)
      ctx.lineTo(8, -2)
      ctx.lineTo(11, 14)
      ctx.lineTo(-11, 14)
      ctx.closePath()
      ctx.fill()
      break
  }
}

function drawAccessoryHint(ctx: CanvasRenderingContext2D, accessory: Skin['accessory']): void {
  switch (accessory) {
    case 'none':
      return
    case 'headband':
      ctx.fillStyle = '#c41a1a'
      ctx.fillRect(-7, -13, 14, 2)
      return
    case 'topknot':
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(0, -19, 2.5, 0, Math.PI * 2)
      ctx.fill()
      return
    case 'horns':
      ctx.fillStyle = '#f0e0c0'
      ctx.beginPath()
      ctx.moveTo(-5, -14)
      ctx.lineTo(-3, -14)
      ctx.lineTo(-6, -20)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(5, -14)
      ctx.lineTo(3, -14)
      ctx.lineTo(6, -20)
      ctx.closePath()
      ctx.fill()
      return
    case 'goldenHelm':
    case 'wingedHelm':
    case 'helm':
      ctx.fillStyle = accessory === 'goldenHelm' ? '#ffd54a' : '#a0a0a0'
      ctx.beginPath()
      ctx.arc(0, -10, 8, Math.PI, Math.PI * 2)
      ctx.fill()
      return
    case 'iceCrown':
    case 'crown':
      ctx.fillStyle = accessory === 'iceCrown' ? '#80e0ff' : '#ffd54a'
      ctx.fillRect(-7, -16, 14, 3)
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath()
        ctx.moveTo(i * 3 - 1, -16)
        ctx.lineTo(i * 3 + 1, -16)
        ctx.lineTo(i * 3, -20)
        ctx.closePath()
        ctx.fill()
      }
      return
    case 'jesterCrown':
      ctx.fillStyle = '#c41a1a'
      ctx.beginPath()
      ctx.moveTo(-7, -13)
      ctx.lineTo(-3, -13)
      ctx.lineTo(-8, -20)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ffd54a'
      ctx.beginPath()
      ctx.moveTo(-2, -13)
      ctx.lineTo(2, -13)
      ctx.lineTo(0, -22)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#c41a1a'
      ctx.beginPath()
      ctx.moveTo(7, -13)
      ctx.lineTo(3, -13)
      ctx.lineTo(8, -20)
      ctx.closePath()
      ctx.fill()
      return
    case 'coneHat':
      ctx.fillStyle = '#6020c8'
      ctx.beginPath()
      ctx.moveTo(-7, -14)
      ctx.lineTo(7, -14)
      ctx.lineTo(0, -24)
      ctx.closePath()
      ctx.fill()
      return
    case 'goggles':
      ctx.fillStyle = '#303840'
      ctx.fillRect(-6, -12, 12, 1.5)
      ctx.fillStyle = '#80e0ff'
      ctx.beginPath()
      ctx.arc(-3, -11, 2, 0, Math.PI * 2)
      ctx.arc(3, -11, 2, 0, Math.PI * 2)
      ctx.fill()
      return
    case 'demon':
      ctx.fillStyle = '#1a0a0a'
      ctx.beginPath()
      ctx.moveTo(-5, -14)
      ctx.lineTo(-3, -14)
      ctx.lineTo(-9, -22)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(5, -14)
      ctx.lineTo(3, -14)
      ctx.lineTo(9, -22)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ff2020'
      ctx.beginPath()
      ctx.arc(-2, -10, 1.2, 0, Math.PI * 2)
      ctx.arc(2, -10, 1.2, 0, Math.PI * 2)
      ctx.fill()
      return
    case 'wings':
      ctx.fillStyle = '#fafafa'
      ctx.beginPath()
      ctx.moveTo(-3, -10)
      ctx.lineTo(-12, -16)
      ctx.lineTo(-8, -6)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(3, -10)
      ctx.lineTo(12, -16)
      ctx.lineTo(8, -6)
      ctx.closePath()
      ctx.fill()
      return
    case 'antenna':
      ctx.strokeStyle = '#a0a0a0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-2, -14)
      ctx.lineTo(-4, -22)
      ctx.moveTo(2, -14)
      ctx.lineTo(4, -22)
      ctx.stroke()
      ctx.fillStyle = '#ff5050'
      ctx.beginPath()
      ctx.arc(-4, -22, 1.4, 0, Math.PI * 2)
      ctx.arc(4, -22, 1.4, 0, Math.PI * 2)
      ctx.fill()
      return
    case 'spear':
    case 'dualBlades':
    case 'staff':
    case 'rage':
      // Held items — show a tiny indicator dot.
      ctx.fillStyle = '#888'
      ctx.beginPath()
      ctx.arc(8, 4, 2, 0, Math.PI * 2)
      ctx.fill()
      return
  }
}
