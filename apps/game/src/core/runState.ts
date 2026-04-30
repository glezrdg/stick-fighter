/**
 * Per-run mutable state.
 *
 * This object replaces the ~25 globals of the legacy game (player, enemies,
 * combo, wave counters, runBuffs, cooldowns, …). Systems receive a reference
 * and mutate fields directly — that's deliberate, since immutable game state
 * at 60Hz is hostile to performance.
 *
 * Only **per-run** state lives here. Meta-progression (gold totals across
 * runs, owned cosmetics, settings) belongs in `SaveStore`.
 *
 * F1.1 starts with a minimal skeleton; fields grow as systems land in F1.2+.
 */

export interface RunState {
  /** Increasing real-seconds since the run started. */
  elapsed: number
  paused: boolean

  // --- HUD-relevant ---
  /** Current wave number (1-based). 0 = pre-run. */
  wave: number
  /** Gold accumulated this run. Persists to save on run end. */
  gold: number
  /** Kills this run. */
  kills: number
  /** Current combo count. 0 when broken. */
  combo: number
  /** Seconds until the combo resets if the player doesn't hit again. */
  comboTimer: number

  // --- Player health (mirrored on the player entity once it exists) ---
  playerHp: number
  playerMaxHp: number

  // --- Skill cooldowns (slot 0 and 1). Seconds remaining. ---
  cooldowns: [number, number]

  // --- The seed driving this run's RNG (for replay / leaderboard). ---
  seed: number
}

/** Build a fresh RunState for a new run. */
export function createRunState(opts: { seed: number; playerMaxHp: number }): RunState {
  return {
    elapsed: 0,
    paused: false,
    wave: 0,
    gold: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    playerHp: opts.playerMaxHp,
    playerMaxHp: opts.playerMaxHp,
    cooldowns: [0, 0],
    seed: opts.seed,
  }
}
