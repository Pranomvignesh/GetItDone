import { migrate } from './migrations.js'

/** Minimal query interface shared by Neon (production) and PGlite (local dev, tests). */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>
}

let instance: Promise<Db> | null = null

/**
 * The app's database. With DATABASE_URL set (Vercel + Neon) it uses Neon's
 * serverless driver; otherwise an embedded Postgres (PGlite) so the whole
 * backend runs locally with the same SQL. Migrations run once per instance.
 */
export function getDb(): Promise<Db> {
  instance ??= (async () => {
    const db = process.env.DATABASE_URL ? await neonDb(process.env.DATABASE_URL) : await pgliteDb(process.env.PGLITE_DIR)
    await migrate(db)
    return db
  })()
  return instance
}

/** For tests: use a specific database (e.g. a fresh in-memory PGlite). Resolves once migrated. */
export function setDbForTests(db: Db | null): Promise<unknown> {
  instance = db ? migrate(db).then(() => db) : null
  return instance ?? Promise.resolve()
}

async function neonDb(url: string): Promise<Db> {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
  }
}

/** PGlite in a folder (persists between dev-server restarts) or in memory when no folder is given. */
export async function pgliteDb(dir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  // PGlite doesn't create parent folders itself.
  if (dir) (await import('node:fs')).mkdirSync(dir, { recursive: true })
  const pg = dir ? new PGlite(dir) : new PGlite()
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
  }
}
