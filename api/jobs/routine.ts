import { handle } from '../../server/http.js'
import { routineJob } from '../../server/sync.js'

/** Called by QStash at a routine's next occurrence. */
export const POST = handle(routineJob)
