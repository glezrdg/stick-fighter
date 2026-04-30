import { type RunSubmitResponse, RunReportSchema } from '@stick/shared'
import { and, count, desc, gt, sql } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'

import { db } from '../db/client'
import { runs, users } from '../db/schema'
import { validateRun } from '../services/runValidator'

/**
 * POST /runs — submit a run report.
 *
 * For F4 we accept anonymous submissions (creating a one-shot anonymous user
 * row each time). When auth lands in F5, the route will require a JWT and
 * use the authenticated `userId` instead.
 */
export const runRoutes: FastifyPluginAsync = async (app) => {
  app.post('/runs', async (request, reply) => {
    const parsed = RunReportSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid run report', details: parsed.error.issues })
    }
    const report = parsed.data

    const reason = validateRun(report)
    if (reason) {
      return reply.code(422).send({ error: 'run rejected', reason })
    }

    // Anonymous user — F5 replaces this with auth.
    const anonName = `Player_${Math.floor(Math.random() * 100000)}`
    const [user] = await db.insert(users).values({ displayName: anonName }).returning()
    if (!user) {
      return reply.code(500).send({ error: 'failed to create anon user' })
    }

    const [inserted] = await db
      .insert(runs)
      .values({
        userId: user.id,
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
