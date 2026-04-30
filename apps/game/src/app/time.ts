/**
 * Time/dt utilities. The single rule for the entire codebase:
 *   **systems receive `dt` in seconds (float).**
 *
 * The legacy game mixed `tickMul` with implicit 60Hz frames. That ambiguity
 * is the source of half a dozen subtle bugs (animations breaking when frame
 * rate drops, etc). Don't bring it back.
 */

/** Maximum dt allowed in a single frame (seconds). Caps "spiral of death" after a tab freeze. */
export const MAX_DT_SECONDS = 1 / 30 // = 33.33 ms

/** Convert a Phaser delta (milliseconds) to dt in seconds, clamped to MAX_DT_SECONDS. */
export function dtFromPhaser(deltaMs: number): number {
  const dt = deltaMs / 1000
  return dt > MAX_DT_SECONDS ? MAX_DT_SECONDS : dt
}

/**
 * Fixed-timestep accumulator for systems that must run at a deterministic
 * rate independent of the render frame rate (combat resolution, network sync).
 *
 *   const stepper = createFixedStepAccumulator(1 / 60) // 60 Hz
 *   // each frame:
 *   for (const fixedDt of stepper.advance(dt)) {
 *     world.tick(fixedDt)
 *   }
 */
export interface FixedStepAccumulator {
  advance(dt: number): Iterable<number>
}

export function createFixedStepAccumulator(stepSeconds: number): FixedStepAccumulator {
  let acc = 0
  const MAX_STEPS_PER_FRAME = 5 // cap to prevent runaway after a long pause

  return {
    *advance(dt: number) {
      acc += dt
      let steps = 0
      while (acc >= stepSeconds && steps < MAX_STEPS_PER_FRAME) {
        yield stepSeconds
        acc -= stepSeconds
        steps++
      }
      if (steps === MAX_STEPS_PER_FRAME) {
        // Discard remaining; we already lagged badly enough.
        acc = 0
      }
    },
  }
}
