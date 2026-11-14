// The climb to orbit, as a small two-dimensional physics model. Plain TypeScript: the launch field
// flies it frame by frame, the forecast flies the same steps with the guidance below at the
// controls, and the tests do both.
//
// OUR MODEL, not NASA data: a scaled-down Earth (so the climb takes about a minute and a half),
// two stages per rocket, a simple atmosphere, and the masses below. One number is real for the
// Space Shuttle and for Falcon 9: thrust over weight at lift-off, NASA's thrust figure divided by
// NASA's weight figure (see `liftoff` in data/nasa/launch-vehicles.json). NASA gives no lift-off
// weight for the Atlas V with Starliner, so that one is our estimate.
import { rocket, type RocketId } from '../data/launchVehicles'
import type { ShipId } from './data'

// ---- The world (our model) -----------------------------------------------------
export const PLANET = {
  /** Radius in metres. The real Earth is about 64 times larger. */
  radius: 100_000,
  g0: 9.81,
  /** The station's altitude in this world. The read-outs show it as 408 km. */
  targetAlt: 9_000,
  /** The air thins by a factor of e every this many metres. */
  scaleHeight: 700,
}
export const MU = PLANET.g0 * PLANET.radius ** 2
/** Speed of a circular orbit at the station's altitude. The read-outs show it as 7.66 km/s. */
export const ORBIT_SPEED = Math.sqrt(MU / (PLANET.radius + PLANET.targetAlt))
/** An orbit counts once its low point clears the air and its high point reaches the station. */
export const PERI_MIN = 6_500
export const APO_MIN = 8_200
/** One simulation step, in seconds. Forecast and flight both use it. */
export const DT = 1 / 60
/** How fast the pilot, or the guidance, can swing the nose: radians per second. */
export const TURN_RATE = (24 * Math.PI) / 180
/** Each kilogram of cargo in game terms weighs this much in model mass units. */
export const CARGO_UNIT = 0.2
const STAGING_GAP = 0.7 // seconds without thrust while the spent stage falls away
const PAD_PATIENCE = 3.5 // seconds at full thrust before a rocket that cannot lift is called
const LOAD_PATIENCE = 0.35 // seconds over the structural limit before the rocket breaks up
const FLIGHT_LIMIT = 260 // seconds: a flight that has not ended by now never will

/**
 * Read-outs and the view are shown at real scale: this world's station altitude reads as 408 km
 * and its orbital speed as 7.66 km/s. Near the pad a metre is a metre and a metre per second is a
 * metre per second, so the stack rises past the tower as it should; the stretch grows with height
 * and with speed.
 */
export const REAL = { altKm: 408, speedKms: 7.66 }
export const showAltM = (metres: number) => {
  const h = Math.max(0, metres), top = REAL.altKm * 1000
  // above the station the scale stays what it is there, so a high point twice as high reads twice as high
  if (h > PLANET.targetAlt) return top * (h / PLANET.targetAlt)
  return h + (top - PLANET.targetAlt) * (h / PLANET.targetAlt) ** 2.2
}
export const showAltKm = (metres: number) => showAltM(metres) / 1000
export const showSpeedKms = (metresPerSecond: number) => {
  const full = (REAL.speedKms * 1000) / ORBIT_SPEED // how much faster the real thing is at orbit
  const v = Math.max(0, metresPerSecond)
  return (v * (1 + (full - 1) * Math.min(1, v / ORBIT_SPEED))) / 1000
}

// ---- The rockets (our model, except twr) ---------------------------------------
export interface VehicleSpec {
  /** Lift-off thrust over lift-off weight with no cargo. NASA's figures where NASA gives both. */
  twr: number
  /** Mass at lift-off with no cargo, in model units. Bigger rockets notice the cargo less. */
  mass: number
  /** First stage (or boosters): share of the mass that is propellant, share that is structure, exhaust speed in m/s. */
  s1: { fuel: number; dry: number; ve: number }
  /** Second stage: the same, plus its thrust-to-weight ratio at ignition with no cargo. */
  s2: { fuel: number; dry: number; ve: number; twr: number }
  /** Air resistance: force = drag x air density x speed squared. */
  drag: number
  /** How much sideways air load the stack takes: the limit on density x speed squared x sin(angle off the airflow). */
  loadLimit: number
  /** Degrees from vertical the guidance has tipped the nose by the time the air is thin. */
  turn: number
}

/**
 * Thrust over weight at lift-off: NASA's two figures for the real vehicle, divided, from the
 * snapshot. Where NASA gives no weight (the Atlas V with Starliner) the figure is `ours`.
 */
const liftoffRatio = (id: RocketId, ours: number) => rocket(id).liftoff?.twr ?? ours

export const VEHICLES: Record<ShipId, VehicleSpec> = {
  // Lowest thrust-to-weight of the three: slow off the pad, so it spends the most fighting gravity.
  falcon9: { twr: liftoffRatio('falcon-9-crew-dragon', 1.4), mass: 100, s1: { fuel: 0.5, dry: 0.09, ve: 880 }, s2: { fuel: 0.25, dry: 0.05, ve: 1185, twr: 1.25 }, drag: 0.03, loadLimit: 2600, turn: 58 },
  // Light, with the highest thrust-to-weight and a gentle two-engine upper stage: the most forgiving to fly.
  atlasv: { twr: liftoffRatio('atlas-v-n22-starliner', 1.6), mass: 72, s1: { fuel: 0.5, dry: 0.1, ve: 860 }, s2: { fuel: 0.24, dry: 0.05, ve: 1180, twr: 1.15 }, drag: 0.024, loadLimit: 3400, turn: 60 },
  // The heaviest and widest: it lifts the most, and its winged stack tolerates the least sideways air load.
  shuttle: { twr: liftoffRatio('space-shuttle', 1.5), mass: 160, s1: { fuel: 0.46, dry: 0.1, ve: 840 }, s2: { fuel: 0.28, dry: 0.07, ve: 1218, twr: 1.1 }, drag: 0.052, loadLimit: 2100, turn: 56 },
}

// ---- State ---------------------------------------------------------------------
export type Failure = 'too-heavy' | 'crash' | 'breakup' | 'out-of-propellant' | 'timeout'
export interface Controls {
  /** -1 swings the nose west (back toward vertical), +1 east (toward the horizon), 0 holds. */
  turn: number
  /** 0 to 1. */
  throttle: number
}
export interface Ascent {
  ship: ShipId
  cargoKg: number
  /** Seconds since the engines lit. */
  t: number
  /** Position and velocity in metres, from the centre of the planet. The pad is at (0, radius). */
  x: number; y: number; vx: number; vy: number
  /** Where the nose points: radians from "up at the pad", turning east. */
  att: number
  throttle: number
  stage: 1 | 2
  /** Propellant left in each stage, model units. */
  fuel1: number; fuel2: number
  mass: number
  status: 'pad' | 'flying' | 'orbit' | 'failed'
  failure: Failure | null
  liftoffAt: number | null
  stagedAt: number | null
  /** Seconds of the staging gap still to run. */
  gap: number
  /** Highest air pressure on the nose so far (density x speed squared), and the altitude it came at. */
  maxQ: number; maxQAlt: number
  /** Highest sideways air load so far, as a share of the limit. */
  peakLoad: number; peakLoadAlt: number
  overLoad: number
  padTime: number
  dryAt: number | null
  /** Sum of the nose's angle off the guidance line over time, in degree-seconds: how untidy the steering was. */
  wander: number
}

export const vehicleOf = (s: Pick<Ascent, 'ship'>) => VEHICLES[s.ship]
const stage1 = (v: VehicleSpec) => ({ fuel: v.mass * v.s1.fuel, dry: v.mass * v.s1.dry, thrust: v.twr * v.mass * PLANET.g0, ve: v.s1.ve })
const stage2 = (v: VehicleSpec) => {
  const fuel = v.mass * v.s2.fuel, dry = v.mass * v.s2.dry
  const craft = v.mass * (1 - v.s1.fuel - v.s1.dry - v.s2.fuel - v.s2.dry)
  return { fuel, dry, craft, thrust: v.s2.twr * (fuel + dry + craft) * PLANET.g0, ve: v.s2.ve }
}

export function startAscent(ship: ShipId, cargoKg: number): Ascent {
  const v = VEHICLES[ship]
  return {
    ship, cargoKg, t: 0, x: 0, y: PLANET.radius, vx: 0, vy: 0, att: 0, throttle: 1, stage: 1,
    fuel1: stage1(v).fuel, fuel2: stage2(v).fuel, mass: v.mass + cargoKg * CARGO_UNIT,
    status: 'pad', failure: null, liftoffAt: null, stagedAt: null, gap: 0,
    maxQ: 0, maxQAlt: 0, peakLoad: 0, peakLoadAlt: 0, overLoad: 0, padTime: 0, dryAt: null, wander: 0,
  }
}

// ---- Geometry helpers ----------------------------------------------------------
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
export const altitude = (s: Ascent) => Math.hypot(s.x, s.y) - PLANET.radius
export const speed = (s: Ascent) => Math.hypot(s.vx, s.vy)
/** Angle of "straight up here", measured like `att`. It grows as the rocket travels east around the planet. */
export const localUp = (s: Ascent) => Math.atan2(s.x, s.y)
/** Climb rate and ground-track speed, in m/s. */
export function rates(s: Ascent) {
  const r = Math.hypot(s.x, s.y)
  const ux = s.x / r, uy = s.y / r
  return { climb: s.vx * ux + s.vy * uy, along: s.vx * uy - s.vy * ux }
}
/** Tilt of the nose away from local vertical, radians: 0 is straight up, pi/2 is level and heading east. */
export const pitch = (s: Ascent) => wrap(s.att - localUp(s))
/** Tilt of the flight path away from local vertical, radians. */
export function pathPitch(s: Ascent) {
  const { climb, along } = rates(s)
  return Math.atan2(along, climb)
}
/** Thrust divided by weight right now, at full throttle. Below 1 on the pad, the rocket stays there. */
export function thrustToWeight(s: Ascent) {
  const v = VEHICLES[s.ship]
  const thrust = s.stage === 1 ? stage1(v).thrust : stage2(v).thrust
  const r = Math.hypot(s.x, s.y)
  return thrust / (s.mass * (MU / (r * r)))
}

/** The orbit the rocket is on if the engines stop now: high and low points as altitudes in metres. */
export function orbitOf(s: Ascent): { apo: number; peri: number; bound: boolean } {
  const r = Math.hypot(s.x, s.y)
  const v2 = s.vx * s.vx + s.vy * s.vy
  const energy = v2 / 2 - MU / r
  const h = s.vx * s.y - s.vy * s.x // positive when heading east
  if (energy >= 0) return { apo: Infinity, peri: (h * h) / (2 * MU) - PLANET.radius, bound: false }
  const a = -MU / (2 * energy)
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (MU * MU)))
  return { apo: a * (1 + e) - PLANET.radius, peri: a * (1 - e) - PLANET.radius, bound: true }
}

// ---- Guidance: the line a clean ascent follows -----------------------------------
const TOWER = 120 // metres straight up before any turn
const THIN_AIR = 3_000 // by this altitude the air load is small and the turn programme ends
const TGO_MIN = 7 // seconds: close to the end the plan stops tightening, so the marker stays calm

/** Seconds of full thrust still needed to reach orbital speed along the ground, counting the staging gap. */
function timeToGo(s: Ascent, along: number): number {
  const v = VEHICLES[s.ship]
  const s1 = stage1(v), s2 = stage2(v)
  let need = Math.max(0, ORBIT_SPEED - along), mass = s.mass, t = 0
  if (s.stage === 1) {
    const gives = s1.ve * Math.log(mass / Math.max(1e-6, mass - s.fuel1))
    if (need <= gives) return ((mass * s1.ve) / s1.thrust) * (1 - Math.exp(-need / s1.ve))
    t = (s.fuel1 * s1.ve) / s1.thrust + STAGING_GAP
    need -= gives
    mass -= s.fuel1 + s1.dry
  }
  return t + Math.max(0, s.gap) + ((mass * s2.ve) / s2.thrust) * (1 - Math.exp(-need / s2.ve))
}

/**
 * The pitch (radians from local vertical) a clean ascent would hold right now. The launch field
 * shows it as the guidance marker, and the forecast flies it.
 *   1. Straight up to clear the tower.
 *   2. In thick air, a fixed turn that depends only on altitude: the nose tips east a little more
 *      with every metre climbed. Because it does not chase the flight path, a pilot who drifts off
 *      it can come back to it.
 *   3. In thin air: work out how long the engines still have to burn to reach orbital speed, and
 *      spend the climb so that it runs out at the station's altitude at that same moment. All the
 *      thrust that is not needed for that goes into speed along the ground.
 */
export function guidance(s: Ascent): number {
  const v = VEHICLES[s.ship]
  const h = altitude(s)
  if (h < TOWER) return 0
  const turnEnd = (v.turn * Math.PI) / 180
  const programme = turnEnd * clamp((h - TOWER) / (THIN_AIR - TOWER), 0, 1) ** 0.75
  const r = Math.hypot(s.x, s.y)
  const { climb, along } = rates(s)
  const left = PLANET.targetAlt - h
  const T = Math.max(TGO_MIN, timeToGo(s, along))
  // the vertical acceleration, easing off in a straight line, that uses up both the height left and the climb in T seconds
  const rise = (6 * left - 4 * climb * T) / (T * T)
  const thrust = (s.stage === 1 ? stage1(v).thrust : stage2(v).thrust) / s.mass
  const weight = MU / (r * r) - (along * along) / r // gravity, less what the curve of the path carries
  const lift = clamp((weight + rise) / thrust, -0.35, 1)
  const level = Math.PI / 2 - Math.asin(lift)
  const blend = clamp((h - THIN_AIR * 0.8) / (THIN_AIR * 0.7), 0, 1)
  return programme + (level - programme) * blend * blend * (3 - 2 * blend)
}
/** What the guidance would do with the controls this step: swing toward its line, full throttle. */
export function guidanceControls(s: Ascent): Controls {
  const error = wrap(guidance(s) - pitch(s))
  return { turn: clamp(error / (TURN_RATE * 0.25), -1, 1), throttle: 1 }
}

// ---- One step ------------------------------------------------------------------
/** Advances the flight by DT under the given controls. Changes `s` in place. */
export function stepAscent(s: Ascent, c: Controls): void {
  if (s.status === 'orbit' || s.status === 'failed') return
  const v = VEHICLES[s.ship]
  const dt = DT
  const fail = (f: Failure) => { s.status = 'failed'; s.failure = f }
  s.t += dt
  s.throttle = clamp(c.throttle, 0, 1)
  const r = Math.hypot(s.x, s.y)
  const ux = s.x / r, uy = s.y / r
  const h = r - PLANET.radius
  const g = MU / (r * r)

  // steering: the pilot can only swing the nose once the rocket has left the pad
  if (s.status === 'flying') {
    s.wander += Math.abs(wrap(guidance(s) - pitch(s))) * (180 / Math.PI) * dt
    s.att += clamp(c.turn, -1, 1) * TURN_RATE * dt
  }

  // engines
  let thrust = 0
  if (s.gap > 0) s.gap -= dt
  else if (s.stage === 1) {
    const st = stage1(v)
    if (s.fuel1 > 0) { thrust = st.thrust * s.throttle; const used = Math.min(s.fuel1, (thrust / st.ve) * dt); s.fuel1 -= used; s.mass -= used }
    if (s.fuel1 <= 1e-9 && s.status !== 'pad') { s.stage = 2; s.mass -= st.dry; s.stagedAt = s.t; s.gap = STAGING_GAP; thrust = 0 }
  } else {
    const st = stage2(v)
    if (s.fuel2 > 0) { thrust = st.thrust * s.throttle; const used = Math.min(s.fuel2, (thrust / st.ve) * dt); s.fuel2 -= used; s.mass -= used }
    else if (s.dryAt === null) s.dryAt = s.t
  }
  const dx = Math.sin(s.att), dy = Math.cos(s.att)

  // held on the pad until thrust beats weight
  if (s.status === 'pad') {
    if (thrust / s.mass > g) { s.status = 'flying'; s.liftoffAt = s.t } else {
      if (s.throttle >= 0.95) s.padTime += dt
      if (s.padTime > PAD_PATIENCE || s.fuel1 <= 1e-9) fail('too-heavy')
      return
    }
  }

  // air: resistance along the flight path, and the sideways load when the nose is off it
  const sp = Math.hypot(s.vx, s.vy)
  const air = Math.exp(-Math.max(0, h) / PLANET.scaleHeight)
  const q = air * sp * sp
  let ax = (thrust / s.mass) * dx - g * ux
  let ay = (thrust / s.mass) * dy - g * uy
  if (sp > 0.5) {
    const resist = (v.drag * q) / s.mass
    ax -= resist * (s.vx / sp)
    ay -= resist * (s.vy / sp)
    if (q > s.maxQ) { s.maxQ = q; s.maxQAlt = h }
    if (sp > 20) {
      const cosA = clamp((dx * s.vx + dy * s.vy) / sp, -1, 1)
      const load = (q * (cosA < 0 ? 1 : Math.sqrt(1 - cosA * cosA))) / v.loadLimit
      if (load > s.peakLoad) { s.peakLoad = load; s.peakLoadAlt = h }
      s.overLoad = load > 1 ? s.overLoad + dt : Math.max(0, s.overLoad - dt)
      if (s.overLoad > LOAD_PATIENCE) return fail('breakup')
    }
  }
  s.vx += ax * dt; s.vy += ay * dt
  s.x += s.vx * dt; s.y += s.vy * dt

  if (Math.hypot(s.x, s.y) < PLANET.radius && s.t - (s.liftoffAt ?? s.t) > 0.5) return fail('crash')
  const o = orbitOf(s)
  if (o.bound && o.peri >= PERI_MIN && o.apo >= APO_MIN && s.vx * s.y - s.vy * s.x > 0) { s.status = 'orbit'; return }
  // both stages spent and still not in orbit: it comes back down
  if (s.dryAt !== null && s.t - s.dryAt > 1.2) return fail('out-of-propellant')
  if (s.t > FLIGHT_LIMIT) return fail('timeout')
}

// ---- Whole flights --------------------------------------------------------------
export interface AscentResult {
  ship: ShipId
  cargoKg: number
  outcome: 'orbit' | Failure
  /** Seconds from engine start to the end. */
  seconds: number
  /** Second-stage propellant left, as a percentage of what it started with. 0 on a failure. */
  marginPct: number
  /** Thrust over weight at lift-off with this cargo. */
  liftoffTwr: number
  /** Where it ended: altitudes of the orbit's high and low points in metres, speed in m/s. */
  apo: number; peri: number; speed: number; alt: number
  /** The peak sideways air load as a share of the limit, and where it came. */
  peakLoad: number; peakLoadAlt: number
  /** Share of orbital speed along the ground reached at the end, 0 to 1 and beyond. */
  speedShare: number
  wander: number
}
export function resultOf(s: Ascent): AscentResult {
  const v = VEHICLES[s.ship]
  const o = orbitOf(s)
  const start = startAscent(s.ship, s.cargoKg)
  return {
    ship: s.ship, cargoKg: s.cargoKg,
    outcome: s.status === 'orbit' ? 'orbit' : s.failure ?? 'timeout',
    seconds: s.t,
    marginPct: s.status === 'orbit' ? (100 * s.fuel2) / stage2(v).fuel : 0,
    liftoffTwr: thrustToWeight(start),
    apo: o.apo, peri: o.peri, speed: speed(s), alt: altitude(s),
    peakLoad: s.peakLoad, peakLoadAlt: s.peakLoadAlt,
    speedShare: rates(s).along / Math.sqrt(MU / Math.hypot(s.x, s.y)),
    wander: s.wander,
  }
}
/** Flies a whole ascent with `pilot` at the controls. The forecast passes the guidance. */
export function flyAscent(ship: ShipId, cargoKg: number, pilot: (s: Ascent) => Controls = guidanceControls): AscentResult {
  const s = startAscent(ship, cargoKg)
  while (s.status === 'pad' || s.status === 'flying') stepAscent(s, pilot(s))
  return resultOf(s)
}

/** How a clean ascent would go with this cargo: the same steps as the real flight, flown by the guidance. */
export interface LiftForecast extends AscentResult {
  /** 'comfortable': room for mistakes. 'tight': needs a tidy ascent. 'marginal': needs a near-perfect one. 'short': cannot reach orbit. 'grounded': will not leave the pad. */
  verdict: 'comfortable' | 'tight' | 'marginal' | 'short' | 'grounded'
}
export const MARGIN = { comfortable: 9, tight: 4 }
const forecasts = new Map<string, LiftForecast>()
export function liftForecast(ship: ShipId, cargoKg: number): LiftForecast {
  const key = `${ship}|${cargoKg}`
  let f = forecasts.get(key)
  if (!f) {
    const r = flyAscent(ship, cargoKg)
    const verdict = r.outcome === 'too-heavy' ? 'grounded' : r.outcome !== 'orbit' ? 'short'
      : r.marginPct >= MARGIN.comfortable ? 'comfortable' : r.marginPct >= MARGIN.tight ? 'tight' : 'marginal'
    forecasts.set(key, f = { ...r, verdict })
  }
  return f
}
/** The heaviest cargo, in whole kilograms, that a clean ascent still carries to orbit. */
export function liftLimitKg(ship: ShipId): number {
  let kg = 0
  while (kg < 400 && liftForecast(ship, kg + 1).outcome === 'orbit') kg++
  return kg
}
