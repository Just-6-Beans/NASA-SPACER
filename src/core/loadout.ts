// Mission design on the ground: which launch system, which instruments, which supplies. This
// file adds up what the design costs and weighs and says whether it may launch. Plain TypeScript.
// Every price and mass here is OUR MODEL. Whether the rocket can lift the result is decided by the
// ascent model (ascent.ts), which the launch field flies for real.
import { liftForecast, liftLimitKg, type AscentResult, type LiftForecast } from './ascent'
import { CELLS_BONUS, EXTRAS, INSTRUMENTS, MISSION_BUDGET, byId, type ExtraId, type InstrumentId, type Ship } from './data'

/** What is loaded on the rocket besides the crew. */
export interface Loadout { instruments: InstrumentId[]; extras: ExtraId[] }

/** Keeps only known items, once each, in catalogue order. Anything else (an old save, a bad message) is dropped. */
export function cleanLoadout(v: unknown): Loadout {
  const o = (v && typeof v === 'object' ? v : {}) as { instruments?: unknown; extras?: unknown }
  const pick = <T extends string>(list: { id: T }[], got: unknown) => list.map(x => x.id).filter(id => Array.isArray(got) && got.includes(id))
  return { instruments: pick(INSTRUMENTS, o.instruments), extras: pick(EXTRAS, o.extras) }
}
/** A first design that always launches: the light instrument and nothing else. */
export const STARTER: Loadout = { instruments: ['ir'], extras: [] }

export const cargoKg = (l: Loadout) =>
  l.instruments.reduce((kg, id) => kg + byId(INSTRUMENTS, id).massKg, 0) + l.extras.reduce((kg, id) => kg + byId(EXTRAS, id).massKg, 0)

export interface DesignCost {
  launch: number
  instruments: number
  extras: number
  /** Everything bought on the ground. */
  spent: number
  /** What is left for the landing. Negative when the design is over budget. */
  left: number
}
export function designCost(ship: Ship, l: Loadout): DesignCost {
  const instruments = l.instruments.reduce((cr, id) => cr + byId(INSTRUMENTS, id).cost, 0)
  const extras = l.extras.reduce((cr, id) => cr + byId(EXTRAS, id).cost, 0)
  const spent = ship.launchCost + instruments + extras
  return { launch: ship.launchCost, instruments, extras, spent, left: MISSION_BUDGET - spent }
}

/**
 * Why this design may not launch, or null. Only the budget and an empty instrument bay stop a
 * launch. Weight never does: an overloaded rocket is free to try, and the ascent decides.
 */
export function designBlock(ship: Ship, l: Loadout): string | null {
  if (l.instruments.length === 0) return 'Load at least one instrument: without one the rover cannot read ice.'
  const c = designCost(ship, l)
  if (c.left < 0) return `Over budget by ${-c.left} cr. Take something off, or choose a cheaper launch.`
  return null
}

/** How a clean ascent would go with this design: the ascent model, flown by its guidance. */
export const designForecast = (ship: Ship, l: Loadout): LiftForecast => liftForecast(ship.id, cargoKg(l))

/** One line on how the lift looks, for the design screen. */
export function liftLine(ship: Ship, l: Loadout): string {
  const f = designForecast(ship, l), kg = cargoKg(l)
  const over = kg - liftLimitKg(ship.id)
  switch (f.verdict) {
    case 'comfortable': return `A clean ascent reaches orbit with ${f.marginPct.toFixed(0)}% of the upper stage's propellant left: room for mistakes.`
    case 'tight': return `A clean ascent reaches orbit with ${f.marginPct.toFixed(0)}% left. Fly it tidily.`
    case 'marginal': return `Only ${f.marginPct.toFixed(1)}% left after a perfect ascent. Any wandering and it falls short.`
    case 'short': return `Too heavy by about ${Math.max(1, over)} kg: even a perfect ascent runs dry at ${Math.round(f.speedShare * 100)}% of orbital speed.`
    case 'grounded': return 'Far too heavy: the engines cannot lift it off the pad.'
  }
}

/** Says when an item does nothing on this rocket, so nobody hauls it for no reason. */
export function extraNote(ship: Ship, id: ExtraId): string | null {
  if (id === 'cells' && ship.battery >= 100) return 'No effect on this launch system: its rover already arrives at 100%.'
  if (id === 'cells') return `Rover arrives at ${Math.min(100, ship.battery + CELLS_BONUS)}% instead of ${ship.battery}%.`
  return null
}

/** What happened on the way up, kept with the mission for the report. */
export interface LaunchRecord {
  /** Lift-offs it took, counting the one that reached orbit. */
  attempts: number
  /** Why the earlier attempts failed, in order. */
  failures: AscentResult['outcome'][]
  cargoKg: number
  /** Upper-stage propellant left at orbit, per cent: what the pilot achieved, and what the guidance would have. */
  marginPct: number
  forecastPct: number
  seconds: number
  /** The guidance flew it. */
  assisted: boolean
}

const FAILED: Record<Exclude<AscentResult['outcome'], 'orbit'>, string> = {
  'too-heavy': 'the stack was too heavy to leave the pad',
  crash: 'it came back down',
  breakup: 'it broke up under air load',
  'out-of-propellant': 'it ran out of propellant short of orbit',
  timeout: 'it never reached orbit',
}
/** A failed ascent in the player's terms: what happened, and which choices or handling caused it. */
export function failureCauses(ship: Ship, l: Loadout, r: AscentResult): { headline: string; parts: string[] } {
  const kg = cargoKg(l), f = designForecast(ship, l), limit = liftLimitKg(ship.id)
  const parts: string[] = []
  const heavy = f.outcome !== 'orbit'
  if (r.outcome === 'too-heavy') {
    return { headline: `${ship.rocketName} never left the pad`, parts: [`Thrust was ${r.liftoffTwr.toFixed(2)} times the weight; it has to be more than 1.`, `Cargo: ${kg} kg. Take weight off.`] }
  }
  if (r.outcome === 'breakup') {
    parts.push(`The sideways air load reached ${Math.round(r.peakLoad * 100)}% of what the ${ship.rocketName} stack takes, at ${(r.peakLoadAlt / 1000).toFixed(1)} km in the model's thick air.`)
    parts.push('That load comes from pointing the nose away from the direction of flight while moving fast low down. Turn gently until the air thins.')
    return { headline: 'Broke up under air load', parts }
  }
  if (r.outcome === 'crash') {
    parts.push('The nose was too far over, or the engines too low, to hold the climb, and it fell back.')
    if (heavy) parts.push(`It was also carrying ${kg} kg, more than the ${limit} kg a perfect ascent can lift.`)
    return { headline: 'Came back down', parts }
  }
  const share = Math.max(0, Math.round(r.speedShare * 100))
  parts.push(share < 50
    ? `Both stages burned out with only ${share}% of orbital speed along the ground. Height is not orbit: orbit is going sideways fast enough to keep missing the planet.`
    : `Both stages burned out at ${share}% of orbital speed, ${100 - share}% short.`)
  if (heavy) parts.push(`Weight decided it: ${kg} kg of cargo is ${Math.max(1, kg - limit)} kg more than a perfect ascent can lift on the ${ship.rocketName}.`)
  else {
    parts.push(`The guidance line would have arrived with ${f.marginPct.toFixed(0)}% of the upper stage's propellant left, so steering decided it: the nose was off the line by ${Math.round(r.wander / Math.max(1, r.seconds))}° on average.`)
    if (f.verdict !== 'comfortable') parts.push(`The margin was thin to begin with: ${kg} kg on a rocket that carries ${ship.payloadKg} kg with propellant to spare.`)
  }
  return { headline: FAILED[r.outcome === 'orbit' ? 'timeout' : r.outcome].replace(/^it /, '').replace(/^./, c => c.toUpperCase()), parts }
}

/** The launch as the report tells it: the outcome, then the choices behind it. */
export function launchCauses(ship: Ship, rec: LaunchRecord): { ok: boolean; headline: string; parts: string[] } {
  const parts = [
    `${ship.name}, ${rec.cargoKg} kg of cargo: it carries ${ship.payloadKg} kg with propellant to spare.`,
    rec.assisted
      ? `The guidance flew the ascent and arrived with ${rec.marginPct.toFixed(0)}% of the upper stage's propellant.`
      : `Flown by hand: ${rec.marginPct.toFixed(0)}% of the upper stage's propellant left at orbit, against ${rec.forecastPct.toFixed(0)}% for the guidance line.`,
  ]
  if (rec.failures.length) parts.push(`Earlier attempt${rec.failures.length === 1 ? '' : 's'}: ${rec.failures.map(f => (f === 'orbit' ? '' : FAILED[f])).join('; ')}.`)
  const first = rec.attempts === 1
  return { ok: first, headline: first ? `Reached orbit on the first launch, ${Math.round(rec.seconds)} s after engine start` : `Reached orbit on launch ${rec.attempts}`, parts }
}
