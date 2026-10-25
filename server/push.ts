import type { Db } from './db.js'

/** What the service worker receives. Item text is never sent: the device decrypts it locally. */
export type PushPayload = { t: 'changes'; ids: string[]; more: number } | { t: 'reminder'; id: string }

export interface PushSender {
  send(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: PushPayload): Promise<number>
}

let override: PushSender | null = null

export function setPushSenderForTests(s: PushSender | null) {
  override = s
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

function sender(): PushSender {
  if (override) return override
  return {
    async send(subscription, payload) {
      const webpush = (await import('web-push')).default
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT ?? 'mailto:owner@example.invalid',
        process.env.VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!,
      )
      try {
        const res = await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: 'high' })
        return res.statusCode
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status) return status
        throw e
      }
    },
  }
}

/**
 * Sends a payload to each subscribed device, except those in `exclude`.
 * Subscriptions the push service reports as gone (404/410) are removed.
 */
export async function pushToDevices(db: Db, payloadFor: (deviceId: string) => PushPayload | null): Promise<number> {
  if (!pushConfigured() && !override) return 0
  const subs = await db.query<{ device_id: string; endpoint: string; keys: { p256dh: string; auth: string } | string }>(
    'SELECT device_id, endpoint, keys FROM push_subscriptions',
  )
  let sent = 0
  for (const sub of subs) {
    const payload = payloadFor(sub.device_id)
    if (!payload) continue
    const keys = typeof sub.keys === 'string' ? JSON.parse(sub.keys) : sub.keys
    const status = await sender().send({ endpoint: sub.endpoint, keys }, payload)
    if (status === 404 || status === 410) {
      await db.query('DELETE FROM push_subscriptions WHERE device_id = $1', [sub.device_id])
    } else if (status >= 200 && status < 300) {
      sent++
    } else {
      console.warn('Push failed', status, sub.device_id)
    }
  }
  return sent
}
