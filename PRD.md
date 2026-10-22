# Get It Done - PRD

> **Get It Done** — groceries and to-dos in one list, so nothing slips.

Oct 22, 2026 · @Pranom Vignesh

## Overview

Get It Done is a minimalist, mobile-first PWA for one person's groceries and to-dos, synced between iPhone and Mac, with a Mac desktop widget, at $0/month and with no Apple Developer Program.

**Problem.** Groceries and to-dos live in different places, don't sync reliably, and a native iPhone app with widgets requires the $99/year Apple Developer Program.

**Goals**

- Add an item in one line; the app sorts it into a grocery category or the to-do list automatically
- Same list on iPhone and Mac, working offline and syncing when back online
- Updates reach the iPhone in the background without opening the app
- Optional deadlines and reminders on any item
- Private to the owner without a sign-in flow
- Checked items clean themselves up after 7 days
- Free to run indefinitely: Vercel Hobby + free database tier

**Non-goals**

- Multiple users, sharing or collaboration
- A native iOS app or an iPhone home screen widget
- Recurring tasks, subtasks, projects, tags or attachments (v1)
- Server-side search or analytics over item text

## Platforms and users

One user (the owner) on two devices; the iPhone is the primary surface.

| Surface | How it runs | Primary use |
| --- | --- | --- |
| iPhone | PWA installed via Safari, Add to Home Screen | Adding items, checking off groceries in store |
| Mac browser | Same PWA in Safari or Chrome (installable) | Planning, editing deadlines |
| Mac desktop | Übersicht widget calling the same API | Glanceable list, tick items off |

## Functional requirements

### FR1 Quick add and auto-categorization

- A single input bar pinned to the bottom of the screen; Enter adds the item
- Several items in one go, separated by commas or new lines ("milk, eggs, call plumber")
- Each item gets a **type** (Grocery or To-do) and, for groceries, a **section** (Produce, Dairy & eggs, Meat & fish, Bakery, Pantry, Frozen, Snacks & drinks, Household, Personal care, Other)
- Categorization runs on the device, never on the server: a built-in keyword dictionary plus rules ("buy X" means grocery; a sentence with a verb like call, pay, book, email means to-do)
- One tap on an item's category opens a picker to correct it; the correction is remembered in a local dictionary that syncs between devices, so the same word is categorized correctly next time
- Unknown words default to To-do

### FR2 Grouped checklist

- Two groups: **Groceries** (sub-grouped by section, in store-walk order) and **To-dos** (sorted by deadline, then newest)
- Each row: checkbox, item name, and a small deadline chip when set
- Groups collapse and show a count of open items
- Checking an item strikes it through and moves it to a collapsed "Done" area at the bottom of its group; unchecking restores it
- Swipe left to delete, swipe right to open details (edit name, category, deadline, reminder)

### FR3 Deadlines and reminders (optional)

- Any item can have a deadline (date, optional time) and a reminder (date and time)
- Quick presets: Today 6pm, Tomorrow 9am, This weekend, Pick date
- Overdue to-dos show the deadline chip in a warning color and float to the top of To-dos
- Reminders arrive as push notifications on every subscribed device (iPhone PWA and Mac browser), showing the item name
- Notification actions: Mark done, Snooze 1 hour
- Editing or deleting an item cancels or reschedules its reminder

### FR4 Sync and offline

- Every change is written to the device's local database first, so the app works fully offline and opens instantly
- When online, the app pushes local changes and pulls remote ones on open, on focus, after each change, and every 30 seconds while visible
- Conflicts resolve by last write wins per item, using each change's timestamp
- A small status dot shows Synced, Syncing or Offline; no blocking spinners

### FR5 Background updates on iPhone

- When an item changes on another device, the server sends a Web Push to the other subscribed devices
- The iPhone service worker wakes on that push, pulls the latest changes into the local database, and shows a notification (iOS requires one per push), e.g. "Groceries: milk, eggs added"
- Changes made within 60 seconds are batched into one push to limit notification noise
- The next time the app opens, the data is already current

### FR6 Private access without sign-in

- No accounts, passwords or OAuth
- On first setup, the owner creates a **vault key** (256-bit random); the server stores only a hash of a token derived from it, set as a Vercel environment variable
- Every API call carries that token; without it the API returns 401 and the app shows a locked screen
- New devices pair by opening a pairing link or scanning a QR code shown on a paired device; the key travels in the URL fragment (after #), which is never sent to the server, and is then stored in the device's local storage and removed from the address bar
- Item text is encrypted on the device with a key derived from the vault key, so the server and database only hold ciphertext
- To revoke all devices, rotate the vault key and environment variable, then re-pair
- The site sets noindex, rate-limits failed API calls, and serves only over HTTPS

### FR7 Auto-cleanup of done items

- Checked items record a completed timestamp
- Items checked more than 7 days ago are deleted from the server by a daily scheduled job, and from each device's local database on its next sync
- Deleted items leave a small tombstone (id and timestamp only) for 30 days so other devices learn about the delete, then the tombstone is removed
- TTL is a single setting (default 7 days)

### FR8 Mac desktop widget

- An Übersicht widget on the Mac desktop shows open items grouped the same way as the app
- Refreshes every 60 seconds and on wake
- Clicking an item's checkbox marks it done through the same API
- Holds its own copy of the vault key in a local config file, never committed to git

## UX and design principles

One screen does everything; anything that needs a second screen is a bottom sheet.

**Principles**

- Mobile first: designed at 375 px wide, then scaled up; every action reachable with one thumb
- Minimalist: one font, one accent color, no icons where a word is clearer, no onboarding beyond pairing
- Fast: first paint from local data in under 1 second, adding an item feels instant (no network wait)
- Touch targets at least 44 px; safe-area insets respected on iPhone
- Follows system light/dark mode

**Screens**

1. **Main list**: groups (Groceries by section, To-dos), status dot in the header, add bar pinned at the bottom
2. **Item sheet** (bottom sheet): name, type and section picker, deadline, reminder, delete
3. **Settings sheet**: pair a device (QR and link), enable notifications, TTL days, export JSON
4. **Locked screen**: shown when no vault key is present; offers "Create vault" on first run or "Paste pairing link"

**Desktop widget**: a translucent card in a desktop corner, same grouping, compact rows, no add bar in v1.

## Technical architecture

A static PWA and a handful of serverless functions on Vercel, with Postgres on Neon's free tier and Upstash QStash for timed jobs; no server to run.

*[Embedded diagram: system architecture · 3 devices, Vercel, 3 free services]*

Devices never reach the database directly; the API checks the device token, stores ciphertext, and hands timed work to QStash.

### Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite, `vite-plugin-pwa` | Owner's existing stack; installable, offline service worker |
| Local storage | IndexedDB via Dexie.js | Offline-first, fast queries, reactive updates |
| API | Vercel Functions under `/api` (Node.js) | Same repo and deploy as the frontend |
| Database | Neon Postgres via Vercel Marketplace (free tier) | Familiar Postgres; scales to zero when idle |
| Push | `web-push` with VAPID keys in env vars | Standard Web Push, works on iOS 16.4+ installed PWAs and Mac browsers |
| Timed jobs | Upstash QStash (free tier) for reminders and batched pushes; Vercel Cron (daily) for cleanup | Vercel Hobby cron runs at most daily, so per-minute reminders need QStash |
| Encryption | Web Crypto API: HKDF from vault key, AES-GCM per item | Built into browsers and Node, no dependency |
| Desktop widget | Übersicht (JSX widget) | Free, writes in React-like JSX |
| Hosting | Vercel Hobby | Free for personal, non-commercial use |

### Data model (Postgres)

| Table | Columns | Notes |
| --- | --- | --- |
| `items` | `id` uuid PK, `ciphertext` text, `deadline_at` timestamptz, `remind_at` timestamptz, `done_at` timestamptz, `deleted_at` timestamptz, `updated_at` timestamptz, `updated_by` text, `reminder_msg_id` text | Name, type and section live encrypted inside `ciphertext`; dates stay plain so the server can schedule reminders and cleanup |
| `settings` | `key` text PK, `ciphertext` text, `updated_at` timestamptz | Synced category corrections and TTL |
| `push_subscriptions` | `id` uuid PK, `device_id` text, `endpoint` text, `keys` jsonb, `created_at`, `last_seen_at` | One row per device; removed when the push service returns 404 or 410 |

The local Dexie schema mirrors `items` and `settings` with decrypted fields plus a `dirty` flag for unsynced changes.

### API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/sync?since=<ts>` | Items and tombstones changed since the device's last sync, plus server time |
| `POST /api/sync` | Batch upsert of the device's dirty items; schedules reminders and a batched push to other devices |
| `POST /api/push/subscribe` | Save or refresh this device's push subscription |
| `POST /api/jobs/remind` | Called by QStash at `remind_at`; verifies QStash signature, sends the reminder push |
| `POST /api/jobs/notify` | Called by QStash 60 seconds after a change; sends one batched "list updated" push |
| `GET /api/cron/cleanup` | Daily Vercel Cron, protected by `CRON_SECRET`; deletes done items older than TTL and tombstones older than 30 days |

All endpoints except the job and cron callbacks require `Authorization: Bearer <device token>`.

### Sync algorithm

1. Each change sets `updated_at` to the device clock and marks the row dirty
2. Push: send dirty rows; the server keeps a row only if its `updated_at` is newer than the stored one, and returns server time
3. Pull: fetch rows changed since the last pull cursor, apply those newer than the local copy, store the new cursor
4. Deletes are soft (`deleted_at`) so they sync like any other change

### Environment variables

`DATABASE_URL`, `VAULT_TOKEN_HASH`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `CRON_SECRET`, `DONE_TTL_DAYS` (default 7).

## Constraints and known limitations

The biggest trade-off is on iPhone: background updates only happen through visible push notifications.

| Limitation | Impact | Mitigation |
| --- | --- | --- |
| iOS PWAs have no Background Sync, Periodic Background Sync or silent push | No scheduled background refresh on iPhone | Push-triggered sync (FR5) |
| iOS requires a visible notification for every push | Each background update shows a notification | Batch changes within 60 s; make the text useful ("milk, eggs added") |
| Edits made on iPhone while offline upload only when the app is next opened | Mac widget may lag until then | Sync immediately on open and on focus |
| Web Push on iPhone only works for the installed (home screen) PWA after a tap to allow notifications | Setup step required | Settings sheet with a single "Enable notifications" button |
| Neon free tier scales to zero when idle | First request after a quiet period is slower | Local-first UI hides the delay |
| Vercel Hobby cron runs at most once a day | Not enough for reminders | QStash schedules reminders at the exact time |
| Encrypted item text | Server cannot search or categorize | All categorization and search happen on the device |
| Losing every paired device and the vault key | Data cannot be decrypted | Settings offers a JSON export and shows the pairing link to save in a password manager |
| iOS may clear site storage for PWAs left unused for weeks | Local copy lost | Server holds the full encrypted copy; re-sync on next open |

## Milestones

Five milestones, each usable on its own; dates to be set by the owner.

1. **M1 Local app**: PWA with add bar, auto-categorization, grouped checklist, item sheet, IndexedDB storage; installable and fully offline on iPhone
2. **M2 Sync**: Neon schema, `/api/sync`, vault key creation and device pairing, encryption; iPhone and Mac browser in sync
3. **M3 Push**: subscriptions, batched "list updated" pushes via QStash, service worker background pull on iPhone
4. **M4 Deadlines and reminders**: deadline and reminder fields, QStash reminder scheduling, Mark done and Snooze actions, daily TTL cleanup cron
5. **M5 Desktop widget**: Übersicht widget (`getitdone.widget`) with grouped list and tick-off

## Open questions and success criteria

**Open questions**

- [ ] Confirm current free-tier limits for Neon, QStash and Vercel Hobby before M2
- [ ] Should the Mac widget also allow adding items, or stay read and tick only?
- [ ] Keep the 60-second batching window for pushes, or notify instantly?
- [ ] Grocery sections: is the default list right, and in what store-walk order?
- [ ] Should deleted (swiped) items also be recoverable for 7 days, like checked items?

**Success criteria**

- An item added on the iPhone appears on the Mac widget within 2 minutes
- A change made on the Mac reaches the iPhone's local data within 1 minute via push, without opening the app
- The app opens and shows the list in under 1 second, online or offline
- At least 9 of 10 items land in the right category after two weeks of corrections
- No checked item older than 7 days remains in the database
- Running cost stays at $0/month
