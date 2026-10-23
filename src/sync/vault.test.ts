// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decryptJson, deriveKeys, encryptJson, generateVaultKey, isValidVaultKey, pairingLink, parsePairing, tokenHash } from './vault'

describe('vault keys', () => {
  it('generates distinct 256-bit keys', () => {
    const a = generateVaultKey()
    expect(isValidVaultKey(a)).toBe(true)
    expect(a).not.toBe(generateVaultKey())
  })

  it('derives the same token every time, and a different one per vault', async () => {
    const key = generateVaultKey()
    expect((await deriveKeys(key)).token).toBe((await deriveKeys(key)).token)
    expect((await deriveKeys(key)).token).not.toBe((await deriveKeys(generateVaultKey())).token)
  })

  it('never puts the vault key itself in the token or its hash', async () => {
    const key = generateVaultKey()
    const { token } = await deriveKeys(key)
    expect(token).not.toContain(key)
    expect(await tokenHash(token)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('item encryption', () => {
  it('round-trips and uses a fresh IV each time', async () => {
    const { dataKey } = await deriveKeys(generateVaultKey())
    const a = await encryptJson(dataKey, { name: 'milk' }, 'id-1')
    const b = await encryptJson(dataKey, { name: 'milk' }, 'id-1')
    expect(a).not.toBe(b)
    expect(await decryptJson(dataKey, a, 'id-1')).toEqual({ name: 'milk' })
  })

  it('rejects ciphertext moved to another item, tampered or read with another key', async () => {
    const { dataKey } = await deriveKeys(generateVaultKey())
    const ct = await encryptJson(dataKey, { name: 'milk' }, 'id-1')
    await expect(decryptJson(dataKey, ct, 'id-2')).rejects.toThrow()
    const flipped = ct.slice(0, -2) + (ct.at(-2) === 'A' ? 'B' : 'A') + ct.at(-1)
    await expect(decryptJson(dataKey, flipped, 'id-1')).rejects.toThrow()
    const other = (await deriveKeys(generateVaultKey())).dataKey
    await expect(decryptJson(other, ct, 'id-1')).rejects.toThrow()
  })
})

describe('pairing links', () => {
  it('reads the key back from a link or a bare key, and rejects junk', () => {
    const key = generateVaultKey()
    expect(parsePairing(pairingLink('https://app.example', key))).toBe(key)
    expect(parsePairing(`  ${key}  `)).toBe(key)
    expect(parsePairing('https://app.example/#pair=short')).toBeNull()
    expect(parsePairing('hello')).toBeNull()
  })

  it('keeps the key in the URL fragment, which browsers never send to servers', () => {
    const link = new URL(pairingLink('https://app.example', generateVaultKey()))
    expect(link.search).toBe('')
    expect(link.hash.startsWith('#pair=')).toBe(true)
  })
})
