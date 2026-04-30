import { type RunSubmitResponse, RunReportSchema } from '@stick/shared'
import { and, count, desc, eq, gt, sql } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'

import { db } from '../db/client'
import { runs, users } from '../db/schema'
import { validateRun } from '../services/runValidator'

/**
 * POST /runs — submit a run report.
 *
 * If a valid JWT is supplied, the run is attributed to that authenticated
 * user (and `playerName` is ignored — the user's `displayName` wins). If
 * no token is supplied, an anonymous user row is created so the leaderboard
 * still works for guests; their handle comes from `report.playerName`
 * (falling back to `Player_<rand>`).
 */
export const runRoutes: FastifyPluginAsync = async (app) => {
  app.post('/runs', { preHandler: [app.optionalAuthenticate] }, async (request, reply) => {
    const parsed = RunReportSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid run report', details: parsed.error.issues })
    }
    const report = parsed.data

    const reason = validateRun(report)
    if (reason) {
      return reply.code(422).send({ error: 'run rejected', reason })
    }

    let userId: string
    if (request.user?.sub) {
      // Authenticated: attribute the run to the existing account. We don't
      // touch displayName — the leaderboard uses whatever the user set on
      // their profile.
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.id, request.user.sub))
        .limit(1)
      if (!existing) return reply.code(401).send({ error: 'user no longer exists' })
      userId = existing.id
    } else {
      // Anonymous fallback — keeps F4-era guests working.
      const fallbackName = `Player_${Math.floor(Math.random() * 100000)}`
      const displayName = report.playerName?.trim() || fallbackName
      const [user] = await db.insert(users).values({ displayName, isAnonymous: true }).returning()
      if (!user) {
        return reply.code(500).send({ error: 'failed to create anon user' })
      }
      userId = user.id
    }

    const [inserted] = await db
      .insert(runs)
      .values({
        userId,
        waveReached: report.wave,
        kills: report.kills,
        gold: report.gold,
        durationSec: report.durationSec,
        weapon: report.weapon,
        seed: report.seed,
        runReport: report,
      })
      .returning()

    if (!inserted) {
      return reply.code(500).send({ error: 'failed to insert run' })
    }

    // Compute rank: how many runs have a strictly higher wave reached?
    const aheadRows = await db
      .select({ ahead: count() })
      .from(runs)
      .where(gt(runs.waveReached, inserted.waveReached))
    const ahead = aheadRows[0]?.ahead ?? 0
    const rank = ahead + 1

    const response: RunSubmitResponse = {
      runId: inserted.id,
      rank: rank <= 100 ? rank : null,
      accepted: true,
    }
    return reply.code(201).send(response)
  })
}

// Helper: runs total used by the leaderboard route's pagination header.
export async function totalRuns(): Promise<number> {
  const [row] = await db.select({ c: count() }).from(runs)
  return row?.c ?? 0
}

/** Suppress 'unused' complaints — keeps `and`, `desc`, `sql` available
 *  when this file grows. */
void and
void desc
void sql
