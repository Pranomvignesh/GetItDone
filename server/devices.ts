import type { VaultStatus } from '../src/sync/protocol'
import { requireDevice, vaultConfigured } from './auth'
import { getDb } from './db'
import { HttpError, json, readJson } from './http'
import { pushConfigured } from './push'

/** GET /api/vault/status: public; tells the locked screen whether the server has a vault yet. */
export async function vaultStatus(): Promise<Response> {
  const body: VaultStatus = {
    configured: vaultConfigured(),
    vapidPublicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY! : null,
  }
  return json(body)
}

interface SubscribeBody {
  deviceId: string
  /** null unsubscribes this device. */
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } } | null
}

/** POST /api/push/subscribe: saves or removes this device's push subscription. */
export async function subscribe(request: Request): Promise<Response> {
  const db = await getDb()
  await requireDevice(db, request)
  const { deviceId, subscription } = await readJson<SubscribeBody>(request)
  if (typeof deviceId !== 'string' || !deviceId || deviceId.length > 64) throw new HttpError(400, 'Bad deviceId')

  if (subscription === null) {
    await db.query('DELETE FROM push_subscriptions WHERE device_id = $1', [deviceId])
    return json({ ok: true })
  }
  const { endpoint, keys } = subscription ?? {}
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 2048) throw new HttpError(400, 'Bad endpoint')
  if (typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') throw new HttpError(400, 'Bad keys')

  const now = Date.now()
  // An endpoint belongs to one device; drop any stale row that claims it.
  await db.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND device_id <> $2', [endpoint, deviceId])
  await db.query(
    `INSERT INTO push_subscriptions (device_id, endpoint, keys, created_at, last_seen_at) VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT (device_id) DO UPDATE SET endpoint = EXCLUDED.endpoint, keys = EXCLUDED.keys, last_seen_at = EXCLUDED.last_seen_at`,
    [deviceId, endpoint, JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth }), now],
  )
  return json({ ok: true })
}
