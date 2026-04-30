import {
  type LeaderboardEntry,
  type LeaderboardResponse,
  LeaderboardQuerySchema,
} from '@stick/shared'
import { desc, eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'

import { db } from '../db/client'
import { runs, users } from '../db/schema'

import { totalRuns } from './runs'

/**
 * GET /leaderboard?top=20&weapon=katana
 *
 * Returns the top-N runs ordered by `wave_reached DESC, duration_sec ASC`
 * (highest wave wins; tiebreak by fastest completion).
 */
export const leaderboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/leaderboard', async (request, reply) => {
    const parsed = LeaderboardQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid query', details: parsed.error.issues })
    }
    const { top, weapon } = parsed.data

    const baseQuery = db
      .select({
        runId: runs.id,
        wave: runs.waveReached,
        kills: runs.kills,
        durationSec: runs.durationSec,
        weapon: runs.weapon,
        submittedAt: runs.submittedAt,
        name: users.displayName,
      })
      .from(runs)
      .leftJoin(users, eq(runs.userId, users.id))
      .orderBy(desc(runs.waveReached), runs.durationSec)
      .limit(top)

    const rows = weapon ? await baseQuery.where(eq(runs.weapon, weapon)) : await baseQuery

    const entries: LeaderboardEntry[] = rows.map((row, i) => ({
      rank: i + 1,
      name: row.name ?? 'Anonymous',
      wave: row.wave,
      kills: row.kills,
      durationSec: row.durationSec,
      weapon: row.weapon,
      submittedAt: row.submittedAt.toISOString(),
    }))

    const response: LeaderboardResponse = {
      entries,
      totalRuns: await totalRuns(),
    }
    return response
  })
}
