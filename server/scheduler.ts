import { HttpError } from './http'
import { safeEqual } from './auth'

/** Runs a job endpoint at a time in the future. */
export interface Scheduler {
  /** Returns an id that can cancel the job. */
  schedule(path: string, body: unknown, at: number): Promise<string>
  cancel(id: string): Promise<void>
}

let override: Scheduler | null = null

/** For tests: capture scheduled jobs instead of running them. */
export function setSchedulerForTests(s: Scheduler | null) {
  override = s
}

export function getScheduler(): Scheduler {
  if (override) return override
  return process.env.QSTASH_TOKEN ? qstashScheduler() : localScheduler()
}

/** Public base URL QStash calls back to. */
export function appUrl(): string {
  const url = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  if (!url) throw new Error('Set APP_URL so scheduled jobs know where to call back')
  return url.replace(/\/$/, '')
}

function qstashScheduler(): Scheduler {
  return {
    async schedule(path, body, at) {
      const { Client } = await import('@upstash/qstash')
      const client = new Client({ token: process.env.QSTASH_TOKEN! })
      const res = await client.publishJSON({ url: `${appUrl()}${path}`, body, notBefore: Math.ceil(at / 1000) })
      return res.messageId
    },
    async cancel(id) {
      const { Client } = await import('@upstash/qstash')
      const client = new Client({ token: process.env.QSTASH_TOKEN! })
      // Already delivered or cancelled: nothing to do.
      await client.messages.delete(id).catch(() => {})
    },
  }
}

/**
 * Local development only: timers in the dev-server process call the job
 * endpoints, authenticated with CRON_SECRET (QStash isn't reachable locally).
 */
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function localScheduler(): Scheduler {
  return {
    async schedule(path, body, at) {
      const id = `local-${crypto.randomUUID()}`
      const base = process.env.APP_URL ?? 'http://localhost:5173'
      const run = () => {
        timers.delete(id)
        fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-local-job-secret': process.env.CRON_SECRET ?? '' },
          body: JSON.stringify(body),
        }).catch((e) => console.error('Local job failed', path, e))
      }
      timers.set(id, setTimeout(run, Math.max(0, at - Date.now())))
      return id
    },
    async cancel(id) {
      clearTimeout(timers.get(id))
      timers.delete(id)
    },
  }
}

/**
 * Job endpoints accept a valid QStash signature, or (outside production, with no
 * QStash keys configured) the local scheduler's secret header.
 */
export async function verifyJob(request: Request, body: string): Promise<void> {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY
  const next = process.env.QSTASH_NEXT_SIGNING_KEY
  if (current && next) {
    const { Receiver } = await import('@upstash/qstash')
    const signature = request.headers.get('upstash-signature') ?? ''
    const ok = await new Receiver({ currentSigningKey: current, nextSigningKey: next })
      .verify({ signature, body, url: `${appUrl()}${new URL(request.url).pathname}` })
      .catch(() => false)
    if (ok) return
    throw new HttpError(401, 'Bad signature')
  }
  const secret = process.env.CRON_SECRET
  if (process.env.VERCEL_ENV !== 'production' && secret && safeEqual(request.headers.get('x-local-job-secret') ?? '', secret)) return
  throw new HttpError(401, 'Unauthorized')
}
