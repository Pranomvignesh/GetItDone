import { handle } from '../../server/http.js'
import { cleanupCron } from '../../server/sync.js'

/** Daily Vercel Cron (see vercel.json). */
export const GET = handle(cleanupCron)
