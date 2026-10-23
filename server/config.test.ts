// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
const allHeaders = vercel.headers.find((h: { source: string }) => h.source === '/(.*)').headers as { key: string; value: string }[]
const csp = allHeaders.find((h) => h.key === 'Content-Security-Policy')!.value

it('allows exactly the inline theme script in index.html via its CSP hash', () => {
  const html = readFileSync('index.html', 'utf8')
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  expect(inline).toHaveLength(1)
  const hash = createHash('sha256').update(inline[0]).digest('base64')
  expect(csp).toContain(`'sha256-${hash}'`)
  expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'")
  expect(csp).toMatch(/script-src 'self' 'sha256-[^']+';/)
})

it('keeps the site out of search engines and schedules the daily cleanup', () => {
  expect(allHeaders.find((h) => h.key === 'X-Robots-Tag')?.value).toContain('noindex')
  expect(vercel.crons).toEqual([{ path: '/api/cron/cleanup', schedule: '0 4 * * *' }])
})
