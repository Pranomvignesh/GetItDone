# Get It Done

Groceries and to-dos in one list, on iPhone and Mac, private to you, free to run.

A local-first PWA: everything is saved on the device first and works offline. Devices sync through a small API on Vercel, and item text is encrypted on the device, so the server only ever stores ciphertext. See [PRD.md](PRD.md) for the full spec.

## Features

- **One-line add.** Type `milk, eggs, call plumber`; each item is sorted into a grocery section (in store-walk order) or To-dos, on the device. Corrections are remembered and synced.
- **Two layouts.** Phones get one list at a time with a bottom bar and swipe gestures; desktop shows both lists side by side with hover actions and a `/` shortcut to add.
- **Offline first.** Installs to the Home Screen or Dock; opens and edits with no network, then syncs.
- **Sync** between devices with last-write-wins per item and a status dot (Synced, Syncing, Offline).
- **Deadlines and reminders** with presets; reminders arrive as push notifications with Mark done and Snooze (actions on Mac browsers).
- **Background updates** on iPhone: changes from another device arrive as one batched notification ("Groceries: milk, eggs added") and the data is current next time you open the app.
- **Private without accounts.** A 256-bit vault key, shared between your devices by link or QR code.
- **Self-cleaning.** Checked items are removed after 7 days.
- **Mac desktop widget** for Übersicht.

## How it works

```
iPhone PWA ─┐                         ┌─ Neon Postgres (ciphertext + dates)
Mac browser ─┼── /api on Vercel ──────┼─ Upstash QStash (reminders, batched pushes)
Mac widget ──┘   (token-checked)      └─ Web Push → devices
```

- `src/` is the app (React, Tailwind, shadcn/ui, Dexie/IndexedDB). `src/sync/` holds the sync engine and the vault crypto; `src/sw.ts` is the service worker (offline shell and push).
- `api/` holds the Vercel Functions, with the logic in `server/`. Locally, the Vite dev server serves the same `api/` files and uses an embedded Postgres (PGlite) and an in-process timer instead of Neon and QStash.
- `widget/getitdone.widget/` is the Übersicht widget.

**Encryption.** The vault key never leaves your devices. HKDF derives two secrets from it: the API token (the server keeps only its SHA-256, `VAULT_TOKEN_HASH`) and an AES-GCM key for item text. Each ciphertext is bound to its item id. Dates stay readable so the server can schedule reminders and cleanup.

## Local development

```bash
npm install
npm run dev
```

1. Open http://localhost:5173 and choose **Create a new vault**.
2. Copy the `VAULT_TOKEN_HASH` value it shows into `.env.local` (see `.env.example`), along with a `CRON_SECRET`.
3. Restart `npm run dev`. The dot in the header turns solid green once synced.

To try notifications locally, add VAPID keys (`npx web-push generate-vapid-keys`) to `.env.local`, restart, and choose **Settings → Enable notifications**. Chrome and Safari on the Mac allow push on `localhost`.

Pair a second "device" by opening the pairing link (Settings → Pair a device) at http://127.0.0.1:5173. It's a different origin, so it has its own storage.

### Tests

```bash
npm run typecheck
npm test          # unit, server and two-device sync tests (Vitest, embedded Postgres)
npm run e2e       # browser tests at phone and desktop sizes (Playwright)
```

CI runs all of these on every push and pull request (`.github/workflows/ci.yml`).

## Deploying to Vercel

1. Push this repository to GitHub and import it in Vercel. The framework is detected as Vite; `vercel.json` sets security headers and the daily cleanup cron.
2. **Database:** Vercel → Storage → add **Neon** (Postgres). It sets `DATABASE_URL`. Tables are created automatically on first request.
3. **Timed jobs:** create a free **Upstash QStash** project and set `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY`.
4. **Push:** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`) and `VAPID_SUBJECT`.
5. Set `CRON_SECRET` to a long random string.
6. Deploy, open the site, **Create a new vault**, set `VAULT_TOKEN_HASH` to the value shown, and redeploy.
7. Save the pairing link in your password manager. Open it on each other device.

Before relying on the free tiers, check their current limits (Neon, QStash, Vercel Hobby); they change over time.

## Using it

- **iPhone:** open the site in Safari → Share → **Add to Home Screen** → keep *Open as Web App* on. Then Settings → **Enable notifications** (iOS only allows web push for Home Screen apps).
- **Mac:** Safari → File → **Add to Dock**, or Chrome's install button in the address bar.
- **Pair a device:** Settings → Pair a device → copy the link or scan the QR code with the other device's camera.

### Mac desktop widget

1. Install [Übersicht](https://tracesof.net/uebersicht/).
2. Copy `widget/getitdone.widget` into Übersicht's widgets folder (Übersicht menu → Open Widgets Folder).
3. In that copy, duplicate `config.example.json` as `config.json` and fill in your app URL and pairing link. `config.json` is git-ignored; keep it private.

The widget refreshes every minute; click a box to check an item off.

## Security and recovery

- **Lost a device / revoke access:** create a new vault on one device, set the new `VAULT_TOKEN_HASH`, redeploy, and pair your other devices with the new link. Old keys stop working immediately. (Items are re-uploaded under the new key from that device.)
- **Lost every device and the pairing link:** the data can't be decrypted; that's the point of the encryption. Settings → **Export JSON** keeps a readable copy; do that occasionally.
- **Rate limits:** after 10 failed API attempts from one address in 15 minutes, it's locked out for the rest of the window.
- **Headers:** strict Content-Security-Policy, HSTS, `noindex`, no referrer. `server/config.test.ts` fails if the CSP hash of the inline theme script drifts.

## Known limitations

- iPhone background updates only happen through visible notifications (iOS rule), so changes are batched for 60 seconds.
- Notification actions (Mark done, Snooze) show on Mac browsers; on iPhone, tapping opens the app.
- Changes made on an offline iPhone upload the next time the app is opened.
- Error monitoring (e.g. Sentry) isn't wired in; check Vercel's function logs.
