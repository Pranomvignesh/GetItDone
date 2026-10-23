import { useEffect, useState, useSyncExternalStore } from 'react'
import { getSyncStatus, getVaultKey, onSyncStatus, setVaultKey, startAutoSync, syncNow } from './engine'
import { parsePairing } from './vault'

export function useSyncStatus() {
  return useSyncExternalStore(onSyncStatus, getSyncStatus)
}

export type VaultState = 'loading' | 'locked' | 'unlocked'

let pairing: Promise<void> = Promise.resolve()

/**
 * Takes the vault key from a `#pair=` link (once) and removes it from the address
 * bar. Concurrent callers wait for the same save, so none sees "no key" mid-way.
 */
function consumePairingLink(): Promise<void> {
  if (!location.hash.startsWith('#pair=')) return pairing
  const key = parsePairing(location.hash)
  history.replaceState(null, '', location.pathname + location.search)
  pairing = pairing.then(async () => {
    if (!key) return
    await setVaultKey(key)
    void syncNow()
  })
  return pairing
}

/**
 * Whether this device has the vault key. A pairing link (`#pair=<key>`) is
 * consumed on load and removed from the address bar (FR6).
 */
export function useVault() {
  const [state, setState] = useState<VaultState>('loading')

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      await consumePairingLink()
      const key = await getVaultKey()
      if (!cancelled) setState(key ? 'unlocked' : 'locked')
    }
    void check()
    // A pairing link opened in a tab that's already showing the app only changes the hash.
    const onHash = () => location.hash.startsWith('#pair=') && void check()
    window.addEventListener('hashchange', onHash)
    return () => {
      cancelled = true
      window.removeEventListener('hashchange', onHash)
    }
  }, [])

  useEffect(() => {
    if (state === 'unlocked') return startAutoSync()
  }, [state])

  return {
    state,
    /** After creating (`newVault`) or pasting a vault key on the lock screen. */
    unlock: async (vaultKey: string, options?: { newVault?: boolean }) => {
      await setVaultKey(vaultKey, options)
      setState('unlocked')
      void syncNow()
    },
    lock: () => setState('locked'),
  }
}
