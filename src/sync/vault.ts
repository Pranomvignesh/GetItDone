/**
 * Vault key crypto (FR6). Works in pages, the service worker and Node (tests),
 * using only Web Crypto.
 *
 * - The vault key is 32 random bytes, shown to the user as base64url.
 * - HKDF derives two independent secrets from it: the API token (whose SHA-256
 *   the server stores as VAULT_TOKEN_HASH) and the AES-GCM key for item text.
 * - Each ciphertext is bound to its record id (AES-GCM additional data), so the
 *   server can't swap one item's text into another.
 *
 * Changing any constant here breaks every existing vault; the Mac widget
 * (widget/getitdone.widget/lib.js) must stay in step.
 */

const AUTH_INFO = 'get-it-done/auth/v1'
const ITEMS_INFO = 'get-it-done/items/v1'
const IV_BYTES = 12

const enc = new TextEncoder()
const dec = new TextDecoder()

export function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** A new 256-bit vault key. */
export function generateVaultKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export function isValidVaultKey(key: string): boolean {
  try {
    return /^[A-Za-z0-9_-]{43}$/.test(key) && fromBase64Url(key).length === 32
  } catch {
    return false
  }
}

export interface VaultKeys {
  /** Bearer token for the API. */
  token: string
  /** AES-GCM key for item and settings text. Non-extractable. */
  dataKey: CryptoKey
}

export async function deriveKeys(vaultKey: string): Promise<VaultKeys> {
  const base = await crypto.subtle.importKey('raw', fromBase64Url(vaultKey), 'HKDF', false, ['deriveBits', 'deriveKey'])
  const hkdf = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) })
  const tokenBits = await crypto.subtle.deriveBits(hkdf(AUTH_INFO), base, 256)
  const dataKey = await crypto.subtle.deriveKey(hkdf(ITEMS_INFO), base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  return { token: toBase64Url(new Uint8Array(tokenBits)), dataKey }
}

/** Hex SHA-256 of the API token: the value for the VAULT_TOKEN_HASH environment variable. */
export async function tokenHash(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(token)))
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Encrypts a JSON value; `aad` is the record id it belongs to. Output: base64url(iv ‖ ciphertext). */
export async function encryptJson(key: CryptoKey, value: unknown, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(JSON.stringify(value))),
  )
  const out = new Uint8Array(IV_BYTES + ct.length)
  out.set(iv)
  out.set(ct, IV_BYTES)
  return toBase64Url(out)
}

export async function decryptJson<T>(key: CryptoKey, ciphertext: string, aad: string): Promise<T> {
  const bytes = fromBase64Url(ciphertext)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES), additionalData: enc.encode(aad) },
    key,
    bytes.slice(IV_BYTES),
  )
  return JSON.parse(dec.decode(plain)) as T
}

/** Pairing link for another device: the key rides in the URL fragment, which browsers never send to servers. */
export function pairingLink(origin: string, vaultKey: string): string {
  return `${origin}/#pair=${vaultKey}`
}

/** Reads a vault key from a pairing link or a pasted bare key. */
export function parsePairing(input: string): string | null {
  const match = input.trim().match(/(?:#pair=)?([A-Za-z0-9_-]{43})\s*$/)
  return match && isValidVaultKey(match[1]) ? match[1] : null
}
