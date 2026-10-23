import { vaultStatus } from '../../server/devices'
import { handle } from '../../server/http'

/** Public: whether the server has a vault yet, and the VAPID key for push. */
export const GET = handle(vaultStatus)
