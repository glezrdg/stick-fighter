import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * F4 schema. F5 (auth) extends `users` with email/oauth columns; today we
 * stub it as anonymous so leaderboard already works without sign-up.
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Display handle on the leaderboard. Anonymous players get "Player_<n>". */
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    waveReached: integer('wave_reached').notNull(),
    kills: integer('kills').notNull(),
    gold: integer('gold').notNull(),
    durationSec: real('duration_sec').notNull(),
    weapon: text('weapon').notNull(),
    seed: integer('seed').notNull(),
    /** Full RunReport blob — used for replay verification later. */
    runReport: jsonb('run_report'),
    submittedAt: timestamp('submitted_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    waveIdx: index('runs_wave_idx').on(t.waveReached),
    weaponWaveIdx: index('runs_weapon_wave_idx').on(t.weapon, t.waveReached),
  }),
)

export const cloudSaves = pgTable('cloud_saves', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  saveData: jsonb('save_data').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export type DbUser = typeof users.$inferSelect
export type DbRun = typeof runs.$inferSelect
export type DbCloudSave = typeof cloudSaves.$inferSelect
