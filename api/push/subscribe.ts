import { subscribe } from '../../server/devices'
import { handle } from '../../server/http'

/** Save or remove this device's Web Push subscription. */
export const POST = handle(subscribe)
