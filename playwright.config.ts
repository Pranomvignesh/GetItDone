import { rmSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { deriveKeys, generateVaultKey, tokenHash } from './src/sync/vault'

/**
 * End-to-end tests against the real dev server (app + /api + embedded Postgres).
 * Each run gets a fresh database and a fresh vault; the tests pair with it via
 * a pairing link, exactly like a new device would.
 */
const PORT = 5180
const vaultKey = process.env.E2E_VAULT_KEY ?? generateVaultKey()
process.env.E2E_VAULT_KEY = vaultKey // Inherited by the test workers.
const dataDir = '.data/e2e'
if (!process.env.E2E_REUSE) rmSync(dataDir, { recursive: true, force: true })

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The dev service worker would cache across tests; the app works without it.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PGLITE_DIR: dataDir,
      VAULT_TOKEN_HASH: await tokenHash((await deriveKeys(vaultKey)).token),
      CRON_SECRET: 'e2e-cron-secret',
      APP_URL: `http://localhost:${PORT}`,
    },
  },
})
