// Get It Done – Übersicht widget logic (FR8). Plain JS so Übersicht can bundle it
// and the app's tests can import it. Uses Web Crypto and fetch only.
//
// Must stay in step with src/sync/vault.ts (key derivation and encryption) and
// src/categories.ts (store-walk section order).

const AUTH_INFO = 'get-it-done/auth/v1'
const ITEMS_INFO = 'get-it-done/items/v1'
const IV_BYTES = 12

export const SECTIONS = [
  'Produce',
  'Bakery',
  'Meat & fish',
  'Dairy & eggs',
  'Frozen',
  'Pantry',
  'Snacks & drinks',
  'Household',
  'Personal care',
  'Other',
]

const enc = new TextEncoder()
const dec = new TextDecoder()

function toBase64Url(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** Accepts a pairing link or a bare vault key. */
export function vaultKeyFrom(input) {
  const m = String(input).trim().match(/(?:#pair=)?([A-Za-z0-9_-]{43})\s*$/)
  if (!m) throw new Error('config.json: "vault" must be your pairing link or vault key')
  return m[1]
}

export async function deriveKeys(vaultKey) {
  const base = await crypto.subtle.importKey('raw', fromBase64Url(vaultKey), 'HKDF', false, ['deriveBits', 'deriveKey'])
  const hkdf = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) })
  const tokenBits = await crypto.subtle.deriveBits(hkdf(AUTH_INFO), base, 256)
  const dataKey = await crypto.subtle.deriveKey(hkdf(ITEMS_INFO), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  return { token: toBase64Url(new Uint8Array(tokenBits)), dataKey }
}

async function decrypt(key, ciphertext, aad) {
  const bytes = fromBase64Url(ciphertext)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES), additionalData: enc.encode(aad) },
    key,
    bytes.slice(IV_BYTES),
  )
  return JSON.parse(dec.decode(plain))
}

async function encrypt(key, value, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(JSON.stringify(value))))
  const out = new Uint8Array(IV_BYTES + ct.length)
  out.set(iv)
  out.set(ct, IV_BYTES)
  return toBase64Url(out)
}

/**
 * Fetches and decrypts every open item.
 * @returns {{ groceries: {section: string, items: object[]}[], todos: object[], serverOffset: number }}
 */
export async function loadList(config) {
  const keys = await deriveKeys(vaultKeyFrom(config.vault))
  const base = String(config.url).replace(/\/$/, '')
  const items = []
  let since = 0
  let serverOffset = 0
  for (;;) {
    const res = await fetch(`${base}/api/sync?since=${since}`, { headers: { authorization: `Bearer ${keys.token}` } })
    if (!res.ok) throw new Error(res.status === 401 ? 'Server rejected the vault key' : `Server error ${res.status}`)
    const page = await res.json()
    serverOffset = page.serverTime - Date.now()
    for (const w of page.items) {
      if (w.deletedAt || w.doneAt || !w.ciphertext) continue
      try {
        const secret = await decrypt(keys.dataKey, w.ciphertext, w.id)
        items.push({ ...w, ...secret })
      } catch {
        // Not readable with this key; skip it.
      }
    }
    since = page.cursor
    if (!page.hasMore) break
  }
  return { ...group(items), serverOffset }
}

/** Same grouping as the app: grocery sections in store-walk order, to-dos by deadline then newest. */
export function group(items) {
  const groceries = SECTIONS.map((section) => ({
    section,
    items: items.filter((i) => i.type === 'grocery' && (i.section || 'Other') === section).sort((a, b) => b.createdAt - a.createdAt),
  })).filter((s) => s.items.length > 0)
  const todos = items
    .filter((i) => i.type === 'todo')
    .sort((a, b) => {
      if (a.deadlineAt !== b.deadlineAt) {
        if (a.deadlineAt === null) return 1
        if (b.deadlineAt === null) return -1
        return a.deadlineAt - b.deadlineAt
      }
      return b.createdAt - a.createdAt
    })
  return { groceries, todos }
}

/** Ticks an item off through the same API the app uses. */
export async function markDone(config, item, serverOffset = 0) {
  const keys = await deriveKeys(vaultKeyFrom(config.vault))
  const now = Date.now() + serverOffset
  const secret = { name: item.name, type: item.type, section: item.section, createdAt: item.createdAt }
  const body = {
    deviceId: 'mac-widget',
    settings: [],
    items: [
      {
        id: item.id,
        ciphertext: await encrypt(keys.dataKey, secret, item.id),
        deadlineAt: item.deadlineAt,
        remindAt: null,
        doneAt: now,
        deletedAt: null,
        updatedAt: now,
      },
    ],
  }
  const res = await fetch(`${String(config.url).replace(/\/$/, '')}/api/sync`, {
    method: 'POST',
    headers: { authorization: `Bearer ${keys.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Server error ${res.status}`)
}
