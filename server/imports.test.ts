// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })
}

/**
 * Vercel runs api/ as native Node ESM, compiling each file separately, so a
 * relative import without its .js extension crashes the function at load.
 */
it('uses .js extensions on every relative import the Vercel functions load', () => {
  const missing = [...tsFiles('api'), ...tsFiles('server')]
    .filter((f) => !f.endsWith('devApi.ts')) // Loaded by Vite in local dev only.
    .flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/(?:from\s+|import\()['"](\.{1,2}\/[^'"]+)['"]/g)]
        .map((m) => m[1])
        .filter((spec) => !spec.endsWith('.js'))
        .map((spec) => `${f}: ${spec}`),
    )
  expect(missing).toEqual([])
})
