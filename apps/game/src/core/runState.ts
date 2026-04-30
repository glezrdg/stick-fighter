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
 */

/**
 * Per-run buff accumulators. Each field starts at 0 and grows when the
 * player picks a wave-clear buff card (see WAVE_BUFFS in the legacy and
 * the future BuffCardScene in F2.3). Owned passive skills contribute
 * separately via the BuffSystem — runBuffs only carry the wave-clear deltas.
 */
export interface RunBuffs {
  /** +% damage (FILO AFILADO: +0.25). */
  dmg: number
  /** +% attack speed (MANOS RÁPIDAS: +0.20). */
  atkSpeed: number
  /** +flat HP added to maxHp (PIEL DURA: +25). */
  hpMax: number
  /** +% crit chance (OJO ASESINO: +0.15). */
  crit: number
  /** +% knockback (GOLPE PESADO: +0.50). */
  knockback: number
  /** +HP/sec flat (REGEN: +1). */
  regen: number
  /** +% gold earned (CODICIA: +0.30). */
  gold: number
}

export function emptyRunBuffs(): RunBuffs {
  return { dmg: 0, atkSpeed: 0, hpMax: 0, crit: 0, knockback: 0, regen: 0, gold: 0 }
}

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

  // --- Buff accumulators applied this run. ---
  runBuffs: RunBuffs

  // --- Active skill timers. ---
  /** Seconds remaining of the swordTornado AOE. */
  tornadoTimer: number
  /** Camera shake intensity remaining (seconds). */
  cameraShake: number
  /** Slow-mo timer remaining (seconds). */
  slowMo: number
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
    runBuffs: emptyRunBuffs(),
    tornadoTimer: 0,
    cameraShake: 0,
    slowMo: 0,
  }
}
