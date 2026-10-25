/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { SNOOZE_MS, shortLabel } from './dates'
import { db } from './db'
import { describeChanges, type ChangedItem } from './push/message'
import { describeSchedule } from './routine'
import { occurrenceId } from './routineGen'
import { syncNow, syncedNow } from './sync/engine'
import { updateItem } from './store'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] }

type PushPayload = { t: 'changes'; ids: string[]; more: number } | { t: 'reminder'; id: string } | { t: 'routine'; id: string }

// ---------- Offline app shell ----------

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// Any page navigation opens the app shell; the API always goes to the network.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }))

// The page's "Update available → Reload" prompt asks the waiting worker to take over.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

// ---------- Push (FR3, FR5) ----------

self.addEventListener('push', (event) => {
  const payload = (() => {
    try {
      return event.data?.json() as PushPayload
    } catch {
      return null
    }
  })()
  event.waitUntil(handlePush(payload))
})

async function handlePush(payload: PushPayload | null) {
  // Pull first, so the data is current next time the app opens (and names can be decrypted here).
  const result = await syncNow().catch(() => null)

  if (payload?.t === 'reminder') {
    const item = await db.items.get(payload.id)
    if (!item || item.doneAt || item.deletedAt) {
      // iOS requires a visible notification for every push.
      return self.registration.showNotification('Get It Done', { body: 'A reminder was cleared on another device.', tag: 'reminder-cleared' })
    }
    return self.registration.showNotification(item.name, {
      body: item.deadlineAt ? `Due ${shortLabel(item.deadlineAt, Date.now())}` : 'Reminder',
      tag: `remind-${item.id}`,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { id: item.id },
      // Shown where supported (Mac browsers); iOS ignores actions and opens the app on tap.
      actions: [
        { action: 'done', title: 'Mark done' },
        { action: 'snooze', title: 'Snooze 1 hour' },
      ],
    } as NotificationOptions)
  }

  if (payload?.t === 'routine') {
    // The sync above created this occurrence's to-do (the server can't read routines).
    const routine = await db.routines.get(payload.id)
    const item = routine?.lastGeneratedFor ? await db.items.get(await occurrenceId(routine.id, routine.lastGeneratedFor)) : undefined
    if (!routine || routine.deletedAt || !item || item.doneAt || item.deletedAt) {
      return self.registration.showNotification('Get It Done', { body: 'A routine came up on another device.', tag: 'routine-cleared' })
    }
    return self.registration.showNotification(item.name, {
      body: `Due ${shortLabel(item.deadlineAt ?? Date.now(), Date.now())} · ${describeSchedule(routine.schedule)}`,
      tag: `routine-${routine.id}`,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { id: item.id },
      actions: [
        { action: 'done', title: 'Mark done' },
        { action: 'snooze', title: 'Snooze 1 hour' },
      ],
    } as NotificationOptions)
  }

  const ids = payload?.t === 'changes' ? new Set(payload.ids) : null
  const changes: ChangedItem[] = []
  for (const change of result?.changes ?? []) {
    if (ids && !ids.has(change.id)) continue
    const item = await db.items.get(change.id)
    if (change.kind === 'deleted') continue // Name is gone with the item.
    if (!item) continue
    const kind = change.kind === 'updated' && item.doneAt ? 'done' : change.kind
    changes.push({ name: item.name, type: item.type, kind })
  }
  const deleted = (result?.changes ?? []).filter((c) => c.kind === 'deleted').length
  const extra = (payload?.t === 'changes' ? payload.more : 0) + deleted
  const { title, body } = describeChanges(changes, extra)
  return self.registration.showNotification(title, { body, tag: 'changes', icon: '/pwa-192x192.png', badge: '/pwa-64x64.png' })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const id = (event.notification.data as { id?: string } | null)?.id
  event.waitUntil(
    (async () => {
      if (id && event.action === 'done') {
        await updateItem(id, { doneAt: syncedNow(), remindAt: null })
        await syncNow()
        return
      }
      if (id && event.action === 'snooze') {
        await updateItem(id, { remindAt: syncedNow() + SNOOZE_MS })
        await syncNow()
        return
      }
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = clients[0]
      if (open) await open.focus()
      else await self.clients.openWindow('/')
    })(),
  )
})
