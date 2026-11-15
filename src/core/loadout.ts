// Mission design on the ground: which launch system, and how much of each station cargo item. This
// file adds up what the design costs and weighs and says whether it may launch. Plain TypeScript.
// Every price and mass here is OUR MODEL. Whether the rocket can lift the result is decided by the
// ascent model (ascent.ts), which the launch field flies for real. The rover goes up on its own
// rocket, chosen later at Rover Comms (delivery.ts); its instrument is chosen aboard. Both prices
// come out of the same budget, so a design has to leave room for them.
import { liftForecast, liftLimitKg, type AscentResult, type LiftForecast } from './ascent'
import { CARGO, INSTRUMENTS, MISSION_BUDGET, cargoStep, type CargoId, type Ship } from './data'
import { ROCKET_ANY, ROCKET_MIN } from './delivery'

/** What is loaded on the rocket besides the crew: kilograms of each station cargo item aboard. */
export interface Loadout { cargo: Partial<Record<CargoId, number>> }

/** Keeps only known items at amounts they come in, in catalogue order. Anything else (an old save, a bad message) is dropped. */
export function cleanLoadout(v: unknown): Loadout {
  const o = (v && typeof v === 'object' ? v : {}) as { cargo?: unknown }
  const got = (o.cargo && typeof o.cargo === 'object' ? o.cargo : {}) as Record<string, unknown>
  const cargo: Partial<Record<CargoId, number>> = {}
  for (const c of CARGO) {
    const kg = got[c.id]
    if (typeof kg === 'number' && cargoStep(c.id, kg)) cargo[c.id] = kg
  }
  return { cargo }
}
/** A first design that always launches: nothing in the hold yet. */
export const STARTER: Loadout = { cargo: {} }

/** The items aboard, in catalogue order, with the amount each was loaded at. */
export const aboard = (l: Loadout) =>
  CARGO.flatMap(c => { const st = cargoStep(c.id, l.cargo[c.id]); return st ? [{ item: c, step: st }] : [] })

export const cargoKg = (l: Loadout) => aboard(l).reduce((kg, x) => kg + x.step.kg, 0)

/** Effect size of one item aboard, 0 when it is not loaded. */
export const cargoValue = (l: Loadout | undefined, id: CargoId) => (l ? cargoStep(id, l.cargo[id])?.value ?? 0 : 0)

/** The cheapest rover instrument: the design has to leave at least this much for the one chosen aboard. */
export const INSTRUMENT_MIN = Math.min(...INSTRUMENTS.map(i => i.cost))
/** What a design has to leave for the rover: its cheapest instrument and the cheapest rocket that can carry a rover. */
export const DESIGN_RESERVE = INSTRUMENT_MIN + ROCKET_MIN

export interface DesignCost {
  launch: number
  cargo: number
  /** Everything bought on the ground. */
  spent: number
  /** What is left for the rover instrument and the rover's rocket. Negative when the design is over budget. */
  left: number
}
export function designCost(ship: Ship, l: Loadout): DesignCost {
  const cargo = aboard(l).reduce((cr, x) => cr + x.step.cost, 0)
  const spent = ship.launchCost + cargo
  return { launch: ship.launchCost, cargo, spent, left: MISSION_BUDGET - spent }
}

/**
 * Why this design may not launch, or null. Only the budget stops a launch: it has to leave enough
 * for a rover instrument and a rocket to carry the rover. Weight never does: an overloaded rocket
 * is free to try, and the ascent decides.
 */
export function designBlock(ship: Ship, l: Loadout): string | null {
  const c = designCost(ship, l)
  if (c.left < 0) return `Over budget by ${-c.left} cr. Take something off, or choose a cheaper launch.`
  if (c.left < DESIGN_RESERVE) return `Leave at least ${DESIGN_RESERVE} cr for the rover: ${INSTRUMENT_MIN} cr for its instrument and ${ROCKET_MIN} cr for its rocket. Only ${c.left} cr would be left.`
  return null
}

/** How a clean ascent would go with this design: the ascent model, flown by its guidance. */
export const designForecast = (ship: Ship, l: Loadout): LiftForecast => liftForecast(ship.id, cargoKg(l))

const n = (kg: number) => kg.toLocaleString('en-US')
/** One line on how the lift looks, for the design screen. */
export function liftLine(ship: Ship, l: Loadout): string {
  const f = designForecast(ship, l), kg = cargoKg(l)
  const over = kg - liftLimitKg(ship.id)
  switch (f.verdict) {
    case 'comfortable': return `A clean ascent reaches orbit with ${f.marginPct.toFixed(0)}% of the upper stage's propellant left: room for mistakes.`
    case 'tight': return `A clean ascent reaches orbit with ${f.marginPct.toFixed(0)}% left. Fly it tidily.`
    case 'marginal': return `Only ${f.marginPct.toFixed(1)}% left after a perfect ascent. Any wandering and it falls short.`
    case 'short': return `Too heavy by about ${n(Math.max(10, over))} kg: even a perfect ascent runs dry at ${Math.round(f.speedShare * 100)}% of orbital speed.`
    case 'grounded': return 'Far too heavy: the engines cannot lift it off the pad.'
  }
}

/** What this design leaves for the rover: which instrument and which rocket still fit. */
export function instrumentLine(ship: Ship, l: Loadout): string {
  const left = designCost(ship, l).left
  if (left < DESIGN_RESERVE) return `Not enough left for the rover's instrument and its rocket (${DESIGN_RESERVE} cr or more).`
  const [cheap, dear] = [...INSTRUMENTS].sort((x, y) => x.cost - y.cost)
  const low = (i: { name: string }) => i.name.toLowerCase()
  // ROCKET_ANY carries either rover; ROCKET_MIN is the cheaper rocket, which carries only one of them
  if (dear.cost + ROCKET_ANY <= left) return `${left} cr left: enough for either rover instrument and either rocket for the rover.`
  if (dear.cost + ROCKET_MIN <= left) return `${left} cr left: the ${low(dear)} fits only with the cheaper rover rocket; the ${low(cheap)} fits with either.`
  if (cheap.cost + ROCKET_ANY <= left) return `${left} cr left: enough for the ${low(cheap)} and either rover rocket, not the ${low(dear)}.`
  return `${left} cr left: only the ${low(cheap)} and the cheaper rover rocket fit.`
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
    return { headline: `${ship.rocketName} never left the pad`, parts: [`Thrust was ${r.liftoffTwr.toFixed(2)} times the weight; it has to be more than 1.`, `Cargo: ${n(kg)} kg. Take weight off.`] }
  }
  if (r.outcome === 'breakup') {
    parts.push(`The sideways air load reached ${Math.round(r.peakLoad * 100)}% of what the ${ship.rocketName} stack takes, at ${(r.peakLoadAlt / 1000).toFixed(1)} km in the model's thick air.`)
    parts.push('That load comes from pointing the nose away from the direction of flight while moving fast low down. Turn gently until the air thins.')
    return { headline: 'Broke up under air load', parts }
  }
  if (r.outcome === 'crash') {
    parts.push('The nose was too far over, or the engines too low, to hold the climb, and it fell back.')
    if (heavy) parts.push(`It was also carrying ${n(kg)} kg, more than the ${n(limit)} kg a perfect ascent can lift.`)
    return { headline: 'Came back down', parts }
  }
  const share = Math.max(0, Math.round(r.speedShare * 100))
  parts.push(share < 50
    ? `Both stages burned out with only ${share}% of orbital speed along the ground. Height is not orbit: orbit is going sideways fast enough to keep missing the planet.`
    : `Both stages burned out at ${share}% of orbital speed, ${100 - share}% short.`)
  if (heavy) parts.push(`Weight decided it: ${n(kg)} kg of cargo is ${n(Math.max(10, kg - limit))} kg more than a perfect ascent can lift on the ${ship.rocketName}.`)
  else {
    parts.push(`The guidance line would have arrived with ${f.marginPct.toFixed(0)}% of the upper stage's propellant left, so steering decided it: the nose was off the line by ${Math.round(r.wander / Math.max(1, r.seconds))}° on average.`)
    if (f.verdict !== 'comfortable') parts.push(`The margin was thin to begin with: ${n(kg)} kg on a rocket that carries ${n(ship.payloadKg)} kg with propellant to spare.`)
  }
  return { headline: FAILED[r.outcome === 'orbit' ? 'timeout' : r.outcome].replace(/^it /, '').replace(/^./, c => c.toUpperCase()), parts }
}

/** The launch as the report tells it: the outcome, then the choices behind it. */
export function launchCauses(ship: Ship, rec: LaunchRecord): { ok: boolean; headline: string; parts: string[] } {
  const parts = [
    `${ship.name}, ${n(rec.cargoKg)} kg of cargo: it carries ${n(ship.payloadKg)} kg with propellant to spare.`,
    rec.assisted
      ? `The guidance flew the ascent and arrived with ${rec.marginPct.toFixed(0)}% of the upper stage's propellant.`
      : `Flown by hand: ${rec.marginPct.toFixed(0)}% of the upper stage's propellant left at orbit, against ${rec.forecastPct.toFixed(0)}% for the guidance line.`,
  ]
  if (rec.failures.length) parts.push(`Earlier attempt${rec.failures.length === 1 ? '' : 's'}: ${rec.failures.map(f => (f === 'orbit' ? '' : FAILED[f])).join('; ')}.`)
  const first = rec.attempts === 1
  return { ok: first, headline: first ? `Reached orbit on the first launch, ${Math.round(rec.seconds)} s after engine start` : `Reached orbit on launch ${rec.attempts}`, parts }
}
