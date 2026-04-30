import { z } from 'zod'

/**
 * Run report — what the client sends to the server when a run ends.
 *
 * The server uses these fields for plausibility checks before accepting a run
 * for the leaderboard (see `apps/api/src/services/runValidator.ts`):
 *   - `seed` lets the server replay/verify in F5+
 *   - `kills` should be ≤ wave * maxEnemiesPerWave (rejected otherwise)
 *   - `durationSec` must be ≥ a per-wave floor (e.g. 10s × wave) — speedhacks rejected
 */
export const RunReportSchema = z.object({
  /** Per-run seed (mulberry32 input) — recorded for replay verification. */
  seed: z.number().int().nonnegative(),
  wave: z.number().int().min(1),
  kills: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
  /** Run duration in seconds (real time, not slow-mo scaled). */
  durationSec: z.number().nonnegative(),
  /** Equipped weapon at run end — for leaderboard filters. */
  weapon: z.string().min(1),
  /** Run-buff stack accumulated (from wave-clear cards). */
  buffs: z.record(z.string(), z.number()).optional(),
  /** Reason the run ended. */
  reason: z.enum(['death', 'quit']),
  /** Player display name for the leaderboard. Defaults server-side to a
   *  random `Player_<n>` if missing. Trimmed to 20 chars; alphanumerics,
   *  spaces and `-_` only — server enforces the same rule. */
  playerName: z
    .string()
    .trim()
    .max(20)
    .regex(/^[\p{L}\p{N} _-]+$/u, 'invalid characters in player name')
    .optional(),
})
export type RunReport = z.infer<typeof RunReportSchema>

/** Server response when a run is submitted successfully. */
export const RunSubmitResponseSchema = z.object({
  runId: z.string().uuid(),
  /** Rank achieved on the global leaderboard (1-based). null if not in top N. */
  rank: z.number().int().positive().nullable(),
  accepted: z.boolean(),
})
export type RunSubmitResponse = z.infer<typeof RunSubmitResponseSchema>
