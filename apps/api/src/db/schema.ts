import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * F5 schema. Auth extends `users` with email + bcrypt hash. Anonymous
 * users (leaderboard submissions without sign-up) keep existing as rows
 * with `email = NULL` and `isAnonymous = true`.
 */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Display handle on the leaderboard. Anonymous players get "Player_<n>". */
    displayName: text('display_name').notNull(),
    /** Email (login id). Null for anonymous users. */
    email: text('email'),
    /** bcrypt hash. Null for anonymous users (cannot log in). */
    passwordHash: text('password_hash'),
    /** True if this row was created via anonymous run submission and never
     *  upgraded to a real account. */
    isAnonymous: boolean('is_anonymous').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
  }),
)

/**
 * Refresh-token sessions. The access token (short-lived JWT) is sent on
 * every request; the refresh token is rotated on each `/auth/refresh` call,
 * invalidating its predecessor. Storing the bcrypt hash (not the raw token)
 * means a DB leak doesn't grant attackers a free login.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    /** Optional UA string for "you signed in from device X" lists later. */
    deviceInfo: text('device_info'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    /** Set when rotated via /auth/refresh; null until then. Audit trail. */
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
  }),
)

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
export type DbSession = typeof sessions.$inferSelect
