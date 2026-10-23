/** Wire format between devices and /api/sync. All times are epoch milliseconds. */

export interface WireItem {
  id: string
  /** Encrypted {name, type, section}; empty for tombstones. */
  ciphertext: string
  deadlineAt: number | null
  remindAt: number | null
  doneAt: number | null
  deletedAt: number | null
  updatedAt: number
}

export interface WireSetting {
  key: string
  ciphertext: string
  updatedAt: number
}

export interface PushRequest {
  deviceId: string
  items: WireItem[]
  settings: WireSetting[]
}

export interface PushResponse {
  accepted: string[]
  serverTime: number
}

export interface PullResponse {
  items: WireItem[]
  settings: WireSetting[]
  /** Pass back as ?since= next time. */
  cursor: number
  hasMore: boolean
  serverTime: number
  ttlDays: number
}

export interface VaultStatus {
  configured: boolean
  vapidPublicKey: string | null
}

/** Batch size limits shared by client and server. */
export const MAX_ITEMS_PER_PUSH = 500
export const PULL_PAGE_SIZE = 1000
/** Deleted items keep a tombstone (id and timestamps only) this long so every device learns of the delete. */
export const TOMBSTONE_DAYS = 30
export const DEFAULT_TTL_DAYS = 7
