/**
 * Hit-stop helper. Pure functions so the throttle/cap logic can be unit-tested
 * without touching Phaser scenes.
 *
 * Hit-stop ("freeze frames") is a tiny pause of gameplay dt on impact so the
 * brain registers "the hit landed". Naively applied, it stacks badly:
 *   - AOE skills hit 10 enemies the same frame → 10× hit-stop
 *   - Over-buffed swings spam hits at high atk-speed → slideshow
 *
 * To survive that, every freeze request goes through `requestHitStop` which:
 *   - drops requests inside the throttle window (one freeze per ~80 ms),
 *   - caps the total freeze at HIT_STOP_CAP so a kill + chained hit don't
 *     compound into a noticeable pause.
 *
 * `state` is mutated in-place: `state.hitStop` is the live freeze timer (decays
 * elsewhere on real dt), `state.cooldown` is the throttle window (also
 * decayed externally on real dt).
 */

export const HIT_STOP_THROTTLE_SEC = 0.08
export const HIT_STOP_CAP_SEC = 0.18

export interface HitStopState {
  /** Seconds of freeze remaining. */
  hitStop: number
  /** Seconds until the next freeze request can land. */
  cooldown: number
}

/**
 * Request a freeze of `duration` seconds. Returns true if the freeze was
 * applied, false if the request was throttled.
 */
export function requestHitStop(state: HitStopState, duration: number): boolean {
  if (state.cooldown > 0) return false
  state.hitStop = Math.min(HIT_STOP_CAP_SEC, Math.max(state.hitStop, duration))
  state.cooldown = HIT_STOP_THROTTLE_SEC
  return true
}

/** Decay both timers by `realDt` seconds. */
export function tickHitStop(state: HitStopState, realDt: number): void {
  if (state.hitStop > 0) state.hitStop = Math.max(0, state.hitStop - realDt)
  if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - realDt)
}
