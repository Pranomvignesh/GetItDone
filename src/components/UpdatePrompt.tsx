import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** Registers the service worker and offers a reload when a new version has downloaded. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version hourly while the app stays open.
      if (registration) setInterval(() => void registration.update(), 60 * 60_000)
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    toast('A new version of Get It Done is ready', {
      id: 'update',
      duration: Infinity,
      action: { label: 'Reload', onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])

  return null
}
