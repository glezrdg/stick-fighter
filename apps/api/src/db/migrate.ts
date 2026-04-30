/**
 * One-shot migration runner. Invoke explicitly via `pnpm db:migrate` (NOT on
 * server boot — concurrent containers racing would corrupt state).
 *
 * In production, the docker-compose `api-migrate` service runs this once
 * before `api` starts up.
 */
import path from 'node:path'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

async function run() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('[migrate] DATABASE_URL not set')
    process.exit(1)
  }

  // Resolve migrations folder relative to this file so it works in both
  // `tsx src/db/migrate.ts` (dev) and `node dist/db/migrate.js` (prod).
  const migrationsFolder = path.resolve(__dirname, 'migrations')

  const sql = postgres(connectionString, { max: 1 })
  const db = drizzle(sql)

  console.info(`[migrate] running migrations from ${migrationsFolder}…`)
  await migrate(db, { migrationsFolder })
  console.info('[migrate] done')

  await sql.end()
}

run().catch((err) => {
  console.error('[migrate] failed:', err)
  process.exit(1)
})
