import { POWER_TOTAL } from './data'

export interface Power { life: number; comms: number; research: number }
export const DEFAULT_POWER: Power = { life: 3, comms: 3, research: 2 }

const unit = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= POWER_TOTAL

export function validPower(p: unknown): p is Power {
  if (!p || typeof p !== 'object') return false
  const v = p as Record<string, unknown>
  if (!unit(v.life) || !unit(v.comms) || !unit(v.research)) return false
  return (v.life as number) + (v.comms as number) + (v.research as number) <= POWER_TOTAL
}

export const unassigned = (p: Power) => POWER_TOTAL - p.life - p.comms - p.research

/** A number of power units as a share of the station's power, the way every screen shows it: 4 units is "40%". */
export const powerPct = (units: number) => `${Math.round((units / POWER_TOTAL) * 100)}%`

/** Units life support needs before transmitting. Oxygen tanks carried up on the launch lower it. */
export const LIFE_NEED = 3
/** Units communications needs to reach Mars. */
export const COMMS_NEED = 4
/** Why transmission is blocked by power alone, or null when power is ready. */
export function powerBlock(p: Power, lifeNeed = LIFE_NEED): string | null {
  if (!validPower(p)) return 'Power allocation is invalid.'
  if (p.life < lifeNeed) return `Life support needs at least ${powerPct(lifeNeed)} of the station's power before transmitting.`
  if (p.comms < COMMS_NEED) return `Communications needs at least ${powerPct(COMMS_NEED)} of the station's power to reach Mars.`
  return null
}

/** A direct link that skips the station relay hand-off. */
export const fastRelay = (p: Power) => p.comms >= 5
export const researchFilter = (p: Power) => p.research >= 3

/**
 * One-way signal leg in minutes: the real light time for the operations date, plus the relay
 * hand-off unless a direct link skips it. No amount of power shortens the light time itself.
 */
export const signalLeg = (lightMin: number, handoffMin: number, p: Power) =>
  Math.round((lightMin + (fastRelay(p) ? 0 : handoffMin)) * 10) / 10
