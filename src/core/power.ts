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

/** Why transmission is blocked by power alone, or null when power is ready. */
export function powerBlock(p: Power): string | null {
  if (!validPower(p)) return 'Power allocation is invalid.'
  if (p.life < 3) return 'Life support needs at least 3 units before transmitting.'
  if (p.comms < 4) return 'Communications needs at least 4 units to reach Mars.'
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
