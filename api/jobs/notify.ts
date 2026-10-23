import { handle } from '../../server/http'
import { notifyJob } from '../../server/sync'

/** Called by QStash 60 seconds after a change, to send one batched push. */
export const POST = handle(notifyJob)
