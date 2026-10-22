import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'

/**
 * Re-runs `query` whenever the IndexedDB data it read changes.
 * Returns undefined until the first result arrives.
 */
export function useLive<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T>()
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: setValue,
      error: (e) => console.error('Live query failed', e),
    })
    return () => sub.unsubscribe()
  }, deps)
  return value
}
