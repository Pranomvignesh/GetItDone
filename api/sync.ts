import { handle, preflight, withCors } from '../server/http'
import { pull, push } from '../server/sync'

/** GET: changes since a cursor. POST: upload this device's changes. CORS only for the Mac widget. */
export const GET = withCors(handle(pull))
export const POST = withCors(handle(push))
export const OPTIONS = preflight
