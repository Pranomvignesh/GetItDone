import { handle } from '../../server/http'
import { remindJob } from '../../server/sync'

/** Called by QStash at an item's reminder time. */
export const POST = handle(remindJob)
