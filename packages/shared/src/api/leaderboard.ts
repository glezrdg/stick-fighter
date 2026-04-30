import { z } from 'zod'

export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  /** Anonymous handle for now — replaced by user.displayName once auth lands. */
  name: z.string().min(1).max(32),
  wave: z.number().int().min(1),
  kills: z.number().int().nonnegative(),
  durationSec: z.number().nonnegative(),
  weapon: z.string(),
  /** Server-side timestamp (ISO 8601) when the run was submitted. */
  submittedAt: z.string().datetime(),
})
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>

export const LeaderboardResponseSchema = z.object({
  /** Ordered top-N. */
  entries: z.array(LeaderboardEntrySchema),
  /** Total runs submitted (across all users) — useful for "you placed Nth out of M". */
  totalRuns: z.number().int().nonnegative(),
})
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>

export const LeaderboardQuerySchema = z.object({
  top: z.coerce.number().int().min(1).max(100).default(20),
  /** Optional weapon filter. */
  weapon: z.string().optional(),
})
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>
