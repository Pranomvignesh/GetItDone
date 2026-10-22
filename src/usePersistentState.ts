import { useState } from 'react'

function read<T extends string>(key: string, fallback: T, allowed?: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null
    if (v !== null && (!allowed || allowed.includes(v))) return v
  } catch {
    // Storage unavailable (private mode): fall back to the default.
  }
  return fallback
}

/** A string UI preference that survives reloads; per device, never synced. */
export function usePersistentState<T extends string>(key: string, initial: T, allowed?: readonly T[]) {
  const [value, setValue] = useState<T>(() => read(key, initial, allowed))
  const set = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(key, next)
    } catch {
      // Still works for this visit.
    }
  }
  return [value, set] as const
}
