import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

/**
 * Postgres connection pool. Drizzle uses postgres-js as transport. We disable
 * `prepare` for compatibility with PgBouncer (transaction pooling mode) — if
 * we ever scale horizontally with a pooler in front, this avoids
 * "prepared statement does not exist" errors.
 */
const queryClient = postgres(connectionString, {
  prepare: false,
  max: 10,
})

export const db = drizzle(queryClient, { schema, logger: process.env.DRIZZLE_LOG === '1' })

export type Db = typeof db
