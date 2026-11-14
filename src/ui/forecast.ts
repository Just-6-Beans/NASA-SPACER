// The station reads the same signal delay used by the rover UI.
import type { Mission } from '../core/mission'
export const linkMinutes = (m: Mission): number => m.signalMin
