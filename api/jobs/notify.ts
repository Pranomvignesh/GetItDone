import { handle } from '../../server/http.js'
import { notifyJob } from '../../server/sync.js'

/** Called by QStash 60 seconds after a change, to send one batched push. */
export const POST = handle(notifyJob)
