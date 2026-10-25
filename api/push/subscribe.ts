import { subscribe } from '../../server/devices.js'
import { handle } from '../../server/http.js'

/** Save or remove this device's Web Push subscription. */
export const POST = handle(subscribe)
