import type { Db } from './db'

/**
 * Schema migrations, applied in order and recorded in schema_migrations.
 * Never edit a migration that has shipped; add a new one instead.
 *
 * Timestamps are epoch milliseconds (bigint) to match the client exactly.
 * Item text lives only inside `ciphertext`; dates stay plain so the server can
 * schedule reminders and clean up done items without being able to read them.
 */
const MIGRATIONS: { id: number; sql: string }[] = [
  {
    id: 1,
    sql: `
      CREATE SEQUENCE IF NOT EXISTS rev_seq;

      CREATE TABLE IF NOT EXISTS items (
        id uuid PRIMARY KEY,
        ciphertext text NOT NULL,
        deadline_at bigint,
        remind_at bigint,
        done_at bigint,
        deleted_at bigint,
        updated_at bigint NOT NULL,
        updated_by text NOT NULL,
        reminder_msg_id text,
        rev bigint NOT NULL DEFAULT nextval('rev_seq')
      );
      CREATE INDEX IF NOT EXISTS items_rev ON items (rev);

      CREATE TABLE IF NOT EXISTS settings (
        key text PRIMARY KEY,
        ciphertext text NOT NULL,
        updated_at bigint NOT NULL,
        updated_by text NOT NULL,
        rev bigint NOT NULL DEFAULT nextval('rev_seq')
      );

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        device_id text NOT NULL UNIQUE,
        endpoint text NOT NULL UNIQUE,
        keys jsonb NOT NULL,
        created_at bigint NOT NULL,
        last_seen_at bigint NOT NULL
      );

      -- Changes waiting to be announced by the batched "list updated" push.
      CREATE TABLE IF NOT EXISTS notify_queue (
        id bigserial PRIMARY KEY,
        item_id uuid NOT NULL,
        device_id text NOT NULL,
        created_at bigint NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_state (
        key text PRIMARY KEY,
        value text NOT NULL
      );

      -- Failed API auth attempts per client, for rate limiting.
      CREATE TABLE IF NOT EXISTS auth_failures (
        client text PRIMARY KEY,
        window_start bigint NOT NULL,
        count integer NOT NULL
      );
    `,
  },
]

export async function migrate(db: Db) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (id integer PRIMARY KEY, applied_at bigint NOT NULL)')
  const done = new Set((await db.query<{ id: number }>('SELECT id FROM schema_migrations')).map((r) => Number(r.id)))
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue
    // Each statement separately: Neon's HTTP driver runs one statement per call.
    for (const statement of splitStatements(m.sql)) await db.query(statement)
    await db.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2) ON CONFLICT DO NOTHING', [m.id, Date.now()])
  }
}

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean)
}
