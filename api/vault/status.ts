import { vaultStatus } from '../../server/devices.js'
import { handle } from '../../server/http.js'

/** Public: whether the server has a vault yet, and the VAPID key for push. */
export const GET = handle(vaultStatus)
