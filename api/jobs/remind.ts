import { handle } from '../../server/http.js'
import { remindJob } from '../../server/sync.js'

/** Called by QStash at an item's reminder time. */
export const POST = handle(remindJob)
