import { ARENA } from '../arena'
import { type Player, PLAYER_DEFAULTS } from '../entities/Player'

/**
 * Move the player based on the input vector and dt (seconds).
 *
 * The legacy used per-frame coefficients on a fixed 60Hz loop. We preserve
 * that *feel* by scaling the per-frame factors with `tickMul = dt * 60`,
 * which gives identical behavior at 60Hz and degrades gracefully when the
 * frame rate drops (dt is clamped to MAX_DT in `time.ts` to prevent
 * teleporting after a tab freeze).
 */
export function updateMovement(player: Player, input: { x: number; y: number }, dt: number): void {
  const tickMul = dt * 60

  const inputMag = Math.hypot(input.x, input.y)

  const targetVx = input.x * PLAYER_DEFAULTS.speedPxPerFrame
  const targetVy = input.y * PLAYER_DEFAULTS.speedPxPerFrame
  const lerp = inputMag > 0 ? PLAYER_DEFAULTS.accelLerp : PLAYER_DEFAULTS.decelLerp

  // Cap the per-step approach factor at 1 so a long dt frame can't overshoot
  // the target — that's what causes "rubber-banding" at low FPS.
  const stepFactor = Math.min(1, lerp * tickMul)
  player.vx += (targetVx - player.vx) * stepFactor
  player.vy += (targetVy - player.vy) * stepFactor

  // Dash override: fixed velocity in facing direction (set by Dash.execute()).
  if (player.dashTimer > 0) {
    player.dashTimer = Math.max(0, player.dashTimer - dt)
    player.vx = player.facingX * 9
    player.vy = player.facingY * 9
  }

  player.x += player.vx * tickMul
  player.y += player.vy * tickMul

  // Facing only updates with non-zero input. Combat auto-aim overrides this
  // momentarily inside CombatSystem.
  if (inputMag > 0) {
    player.facingX = input.x
    player.facingY = input.y
  }

  // walkPhase drives the renderer's leg/arm oscillation. Mirrors legacy:
  // proportional to actual speed plus a small idle drift.
  const speedNow = Math.hypot(player.vx, player.vy)
  player.walkPhase += (speedNow * 0.08 + 0.02) * tickMul

  // Clamp to arena bounds.
  player.x = clamp(player.x, ARENA.playerInsetLeft, ARENA.width - ARENA.playerInsetRight)
  player.y = clamp(player.y, ARENA.playerInsetTop, ARENA.height - ARENA.playerInsetBottom)

  // Decay timers.
  if (player.iframes > 0) player.iframes = Math.max(0, player.iframes - dt)
  if (player.hurtFlash > 0) player.hurtFlash = Math.max(0, player.hurtFlash - dt)
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
