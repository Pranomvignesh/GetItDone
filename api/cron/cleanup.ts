import { handle } from '../../server/http'
import { cleanupCron } from '../../server/sync'

/** Daily Vercel Cron (see vercel.json). */
export const GET = handle(cleanupCron)
