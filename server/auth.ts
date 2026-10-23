import { createHash, timingSafeEqual } from 'node:crypto'
import type { Db } from './db'
import { HttpError, clientId } from './http'

/** Failed attempts allowed per client within the window before requests get 429. */
export const MAX_FAILURES = 10
export const FAILURE_WINDOW_MS = 15 * 60_000

export function vaultConfigured(): boolean {
  return /^[0-9a-f]{64}$/i.test(process.env.VAULT_TOKEN_HASH ?? '')
}

function tokenMatches(token: string): boolean {
  const expected = Buffer.from((process.env.VAULT_TOKEN_HASH ?? '').toLowerCase(), 'hex')
  const actual = createHash('sha256').update(token).digest()
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/**
 * Checks the device token (FR6). Throws 401 for a missing or wrong token and 429
 * once a client has failed too often recently, before even checking the token.
 */
export async function requireDevice(db: Db, request: Request): Promise<void> {
  const client = clientId(request)
  const now = Date.now()
  const [row] = await db.query<{ window_start: string; count: number }>(
    'SELECT window_start, count FROM auth_failures WHERE client = $1',
    [client],
  )
  if (row && now - Number(row.window_start) < FAILURE_WINDOW_MS && row.count >= MAX_FAILURES) {
    throw new HttpError(429, 'Too many failed attempts')
  }

  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (vaultConfigured() && token && tokenMatches(token)) return

  await db.query(
    `INSERT INTO auth_failures (client, window_start, count) VALUES ($1, $2, 1)
     ON CONFLICT (client) DO UPDATE SET
       count = CASE WHEN $2 - auth_failures.window_start < $3 THEN auth_failures.count + 1 ELSE 1 END,
       window_start = CASE WHEN $2 - auth_failures.window_start < $3 THEN auth_failures.window_start ELSE $2 END`,
    [client, now, FAILURE_WINDOW_MS],
  )
  throw new HttpError(401, vaultConfigured() ? 'Unauthorized' : 'Vault not set up on the server')
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function requireCron(request: Request): void {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') ?? ''
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) throw new HttpError(401, 'Unauthorized')
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
