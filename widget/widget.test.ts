// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { pgliteDb, setDbForTests } from '../server/db'
import { handle } from '../server/http'
import { setSchedulerForTests } from '../server/scheduler'
import { pull, push } from '../server/sync'
import { deriveKeys, generateVaultKey, pairingLink, tokenHash } from '../src/sync/vault'
// @ts-expect-error: plain JS module shared with Übersicht
import { deriveKeys as widgetDeriveKeys, loadList, markDone } from './getitdone.widget/lib.js'

let vaultKey: string

beforeEach(async () => {
  await setDbForTests(await pgliteDb())
  setSchedulerForTests({ schedule: async () => 'job', cancel: async () => {} })
  vaultKey = generateVaultKey()
  process.env.VAULT_TOKEN_HASH = await tokenHash((await deriveKeys(vaultKey)).token)
  const GET = handle(pull)
  const POST = handle(push)
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input), 'http://test'), init)
    return (request.method === 'POST' ? POST : GET)(request)
  }) as typeof fetch
})

afterEach(async () => {
  await setDbForTests(null)
  setSchedulerForTests(null)
})

it('derives the same token as the app', async () => {
  expect((await widgetDeriveKeys(vaultKey)).token).toBe((await deriveKeys(vaultKey)).token)
})

it('reads the list the app wrote, and ticks items off for the app to see', async () => {
  vi.resetModules()
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  const engine = await import('../src/sync/engine')
  const store = await import('../src/store')
  const { db } = await import('../src/db')
  await engine.setVaultKey(vaultKey)
  await store.addFromInput('milk, bananas, call plumber')
  await engine.syncNow()

  const config = { url: 'http://test', vault: pairingLink('http://test', vaultKey) }
  const list = await loadList(config)
  expect(list.groceries.map((s: { section: string }) => s.section)).toEqual(['Produce', 'Dairy & eggs'])
  expect(list.todos.map((i: { name: string }) => i.name)).toEqual(['call plumber'])

  await markDone(config, list.todos[0], list.serverOffset)
  await engine.syncNow()
  const plumber = (await db.items.toArray()).find((i) => i.name === 'call plumber')
  expect(plumber?.doneAt).not.toBeNull()
  expect((await loadList(config)).todos).toEqual([])
})
