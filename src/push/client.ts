import { getLocal, setLocal } from '../db'
import { getDeviceId, vaultKeys } from '../sync/engine'
import type { VaultStatus } from '../sync/protocol'
import { fromBase64Url } from '../sync/vault'

/** What the notifications setting can show. */
export type PushState =
  | 'unsupported'
  /** iPhone/iPad: Web Push only works in the app added to the Home Screen. */
  | 'needs-install'
  | 'server-not-configured'
  | 'denied'
  | 'off'
  | 'on'

const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

async function serverKey(): Promise<string | null> {
  const res = await fetch('/api/vault/status')
  return res.ok ? ((await res.json()) as VaultStatus).vapidPublicKey : null
}

export async function getPushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub && (await getLocal<boolean>('pushEnabled'))) return 'on'
  return (await serverKey().catch(() => null)) ? 'off' : 'server-not-configured'
}

async function saveSubscription(subscription: PushSubscriptionJSON | null) {
  const keys = await vaultKeys()
  if (!keys) throw new Error('Pair this device first')
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { authorization: `Bearer ${keys.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: await getDeviceId(), subscription }),
  })
  if (!res.ok) throw new Error(`Server refused the subscription (${res.status})`)
}

/** Asks permission (must run from a tap) and registers this device for pushes (FR3, FR5). */
export async function enablePush(): Promise<PushState> {
  const key = await serverKey()
  if (!key) return 'server-not-configured'
  if ((await Notification.requestPermission()) !== 'granted') return Notification.permission === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(key) }))
  await saveSubscription(sub.toJSON())
  await setLocal('pushEnabled', true)
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  await (await reg?.pushManager.getSubscription())?.unsubscribe()
  await saveSubscription(null).catch(() => {})
  await setLocal('pushEnabled', false)
  return 'off'
}
