// Stuck rover rescue: the rover stops with wheel trouble, and the pilot has to work out why from a
// few readings and choose a fix. Every fix costs Mars days and may damage the wheels. Plain
// TypeScript, no DOM and no Phaser.
//
// REAL (src/data/roverTasks.ts): rovers do get stuck (Opportunity, 2005), Curiosity's wheels are
// worn, and its software watches every wheel. The route risk below reads REAL terrain: MOLA
// slopes and the places the real rover parked.
// OUR MODEL: everything else. How often the rover gets stuck, the four causes, every reading in
// the telemetry, what each fix does, how long it takes, wheel wear and its effect on speed.
import type { RoverId, RoverSpec } from './rovers'
import { dist, nearestStop, slopeAt, type DriveResult, type Pt } from './survey'

export type StuckCause = 'rock' | 'sand' | 'slope' | 'heat'
export type FixId = 'reverse' | 'rotate' | 'reroute' | 'wait'
export const CAUSE_ORDER: StuckCause[] = ['rock', 'sand', 'slope', 'heat']
export const FIX_ORDER: FixId[] = ['reverse', 'rotate', 'reroute', 'wait']

/** MODEL: the rover is held for at most this many Mars days. After that the team has worked it free. */
export const RESCUE_LIMIT_SOLS = 5
/** MODEL: wheel wear, per cent, at which the rover has to drive slower for the rest of the mission. */
export const WEAR_LIMIT = 20
/** MODEL: share of its top speed a rover with worn wheels keeps. */
export const WORN_SPEED = 0.7
/** MODEL: wear the wheels start with. Curiosity's really are worn (REAL, since 2013); the number is ours. */
export const START_WEAR: Record<RoverId, number> = { perseverance: 0, curiosity: 8 }

export interface CauseInfo { id: StuckCause; name: string; sign: string; fix: FixId; why: string }
export const CAUSES: Record<StuckCause, CauseInfo> = {
  rock: { id: 'rock', name: 'Blocked wheel', sign: 'One wheel draws far more current than the others', fix: 'reverse', why: 'A rock is wedged against one wheel. Backing away frees it.' },
  sand: { id: 'sand', name: 'Soft sand', sign: 'Every wheel draws high current and the tilt creeps up', fix: 'rotate', why: 'The wheels are spinning in loose sand. Turning them slowly, in small steps, finds grip.' },
  slope: { id: 'slope', name: 'Too steep', sign: 'The tilt is close to its limit', fix: 'reroute', why: 'The slope is steeper than the wheels can hold. Only another way round works.' },
  heat: { id: 'heat', name: 'Hot motors', sign: 'Motor temperature is over its limit', fix: 'wait', why: 'The motors stopped themselves to cool down. Waiting is the whole fix.' },
}

export type Risk = 'none' | 'low' | 'medium' | 'high'
export interface FixInfo { id: FixId; name: string; does: string; sols: number; risk: Risk }
export const FIXES: Record<FixId, FixInfo> = {
  reverse: { id: 'reverse', name: 'Reverse', does: 'Back out along your own tracks', sols: 0.5, risk: 'medium' },
  rotate: { id: 'rotate', name: 'Rotate wheels', does: 'Turn the wheels slowly, in small steps', sols: 1, risk: 'high' },
  reroute: { id: 'reroute', name: 'Change route', does: 'Plan a careful way out and around', sols: 2, risk: 'low' },
  wait: { id: 'wait', name: 'Wait', does: 'Hold still and let things settle', sols: 1, risk: 'none' },
}

/** MODEL: what each fix does for each cause: whether it frees the rover, the wheel wear it adds, and what happened. */
const OUTCOME: Record<StuckCause, Record<FixId, { freed: boolean; wear: number; text: string }>> = {
  rock: {
    reverse: { freed: true, wear: 3, text: 'The wheel rolled back off the rock.' },
    rotate: { freed: false, wear: 14, text: 'The wheel ground against the rock and tore its tread.' },
    reroute: { freed: true, wear: 5, text: 'A slow, careful way out. It worked.' },
    wait: { freed: false, wear: 0, text: 'Nothing moved. The rock is still there.' },
  },
  sand: {
    reverse: { freed: false, wear: 10, text: 'Full power dug the wheels in deeper.' },
    rotate: { freed: true, wear: 4, text: 'Small steps found grip and the rover crept out.' },
    reroute: { freed: true, wear: 8, text: 'A long crawl through the sand, but it is out.' },
    wait: { freed: false, wear: 0, text: 'The sand did not get any firmer.' },
  },
  slope: {
    reverse: { freed: false, wear: 9, text: 'The rover slid sideways on the slope.' },
    rotate: { freed: false, wear: 7, text: 'The wheels scrubbed and slipped.' },
    reroute: { freed: true, wear: 3, text: 'Back down, and around the steep ground.' },
    wait: { freed: false, wear: 0, text: 'The slope is just as steep as before.' },
  },
  heat: {
    reverse: { freed: false, wear: 10, text: 'Driving on hot motors strained the wheels.' },
    rotate: { freed: false, wear: 10, text: 'Turning on hot motors strained the wheels.' },
    reroute: { freed: false, wear: 6, text: 'The motors cut out again part-way.' },
    wait: { freed: true, wear: 0, text: 'The motors cooled and the rover drove on.' },
  },
}
export const fixOutcome = (cause: StuckCause, fix: FixId) => OUTCOME[cause][fix]

// ---------------------------------------------------------------- Telemetry (all of it OUR MODEL)
/** The six wheels, in the order the readings are listed. */
export const WHEELS = ['Left front', 'Left middle', 'Left rear', 'Right front', 'Right middle', 'Right rear']
/** MODEL: what a healthy drive looks like, and the limits the rover respects. */
export const NOMINAL = { currentA: [0.7, 1.4] as [number, number], stallA: 3.0, tiltLimitDeg: 30, tiltCalmDeg: 12, motorLimitC: 60, motorCalmC: 40 }

export interface Telemetry {
  /** Motor current of each wheel in amps, in the order of WHEELS. Null: that reading did not arrive. */
  currentA: (number | null)[]
  tiltDeg: number
  /** The tilt has grown since the last reading: the rover is sinking. */
  tiltRising: boolean
  /** The hottest drive motor, °C. Null: the reading did not arrive. */
  motorC: number | null
}

/**
 * MODEL: the readings each cause produces. One reading is always missing, never the one that
 * gives the cause away: the pilot works from limited data.
 */
export function telemetry(cause: StuckCause, rng: () => number): Telemetry {
  const r1 = (n: number) => Math.round(n * 10) / 10
  const between = (a: number, b: number) => a + (b - a) * rng()
  const wheel = Math.min(5, Math.floor(rng() * 6))
  const other = (wheel + 1 + Math.min(4, Math.floor(rng() * 5))) % 6
  const calm = () => r1(between(0.8, 1.3))
  if (cause === 'rock') {
    const currentA = WHEELS.map((_, i) => (i === wheel ? r1(between(3.2, 3.8)) : calm()))
    return { currentA, tiltDeg: r1(between(3, 7)), tiltRising: false, motorC: null }
  }
  if (cause === 'sand') {
    const currentA: (number | null)[] = WHEELS.map(() => r1(between(2.1, 2.6)))
    currentA[other] = null
    return { currentA, tiltDeg: r1(between(8, 11)), tiltRising: true, motorC: Math.round(between(44, 52)) }
  }
  if (cause === 'slope') {
    // the downhill pair carries the load, the uphill pair is nearly light
    const currentA = WHEELS.map((_, i) => r1(i % 3 === 2 ? between(1.9, 2.3) : i % 3 === 0 ? between(0.4, 0.7) : between(1.0, 1.4)))
    return { currentA, tiltDeg: r1(between(25, 28)), tiltRising: false, motorC: null }
  }
  const currentA: (number | null)[] = WHEELS.map(calm)
  currentA[other] = null
  return { currentA, tiltDeg: r1(between(2, 6)), tiltRising: false, motorC: Math.round(between(68, 79)) }
}

// ---------------------------------------------------------------- Route risk (REAL terrain, MODEL thresholds)
/** MODEL: farther than this from anywhere the real rover parked, the ground is unknown. */
export const OFF_TRACK_M = 250
const provenCache = new Map<RoverId, number>()
/**
 * The steepest ground the real rover is known to cope with, as MOLA sees it: nine in ten of the
 * places it really parked are gentler than this. REAL data, our choice of "nine in ten".
 */
export function provenSlope(r: RoverSpec): number {
  const hit = provenCache.get(r.id)
  if (hit !== undefined) return hit
  const slopes = r.area.stops.map(s => slopeAt(r, s)).sort((a, b) => a - b)
  const v = slopes[Math.floor(slopes.length * 0.9)] ?? 10
  provenCache.set(r.id, v)
  return v
}

export interface RouteRisk {
  level: 'low' | 'medium' | 'high'
  /** The steepest MOLA slope the path crosses, degrees. */
  maxSlopeDeg: number
  /** How far the path strays from the nearest place the real rover parked, metres. */
  offTrackM: number
  steep: boolean
  offTrack: boolean
  /** MODEL: chance of wheel trouble on this drive. */
  chance: number
  why: string
}
/** MODEL: chance of wheel trouble at each level of risk, and on any drive after the first if nothing has happened yet. */
export const STUCK_CHANCE = { low: 0.15, medium: 0.45, high: 0.8 }
export const STUCK_LATER = 0.9

const along = (start: Pt, points: Pt[], stepM: number): { p: Pt; atM: number }[] => {
  const out: { p: Pt; atM: number }[] = []
  let from = start, acc = 0
  for (const to of points) {
    const d = dist(from, to), n = Math.max(1, Math.ceil(d / stepM))
    for (let i = 1; i <= n; i++) out.push({ p: { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n }, atM: acc + (d * i) / n })
    acc += d
    from = to
  }
  return out
}

/** How risky a planned path is, from the real slope under it and how far it leaves known ground. */
export function routeRisk(r: RoverSpec, start: Pt, points: Pt[]): RouteRisk {
  let maxSlopeDeg = 0, offTrackM = 0
  for (const s of along(start, points, 50)) {
    maxSlopeDeg = Math.max(maxSlopeDeg, slopeAt(r, s.p))
    offTrackM = Math.max(offTrackM, nearestStop(r, s.p).distM)
  }
  const steep = maxSlopeDeg > provenSlope(r), offTrack = offTrackM > OFF_TRACK_M
  const level = steep && offTrack ? 'high' : steep || offTrack ? 'medium' : 'low'
  const why = steep && offTrack ? `Steep (${maxSlopeDeg}°) and ${Math.round(offTrackM)} m from known ground`
    : steep ? `Crosses a ${maxSlopeDeg}° slope, steeper than ${r.name} is known to handle`
      : offTrack ? `Strays ${Math.round(offTrackM)} m from anywhere ${r.name} has parked`
        : `Stays on ground ${r.name} has driven`
  return { level, maxSlopeDeg, offTrackM: Math.round(offTrackM), steep, offTrack, chance: STUCK_CHANCE[level], why }
}

/**
 * Whether this drive ends in wheel trouble, and where. MODEL: the chance follows the route risk;
 * from the second drive on it is high, so a mission rarely goes by without it. It never happens
 * on a short hop, or beyond the point where the battery would stop the rover anyway.
 */
export function stuckOn(r: RoverSpec, start: Pt, points: Pt[], plan: DriveResult, drivesBefore: number, rng: () => number): { alongM: number; cause: StuckCause } | null {
  if (plan.distM < 120) return null
  const risk = routeRisk(r, start, points)
  const chance = drivesBefore >= 1 ? Math.max(risk.chance, STUCK_LATER) : risk.chance
  if (rng() >= chance) return null
  const alongM = Math.round(plan.distM * (0.4 + 0.35 * rng()))
  if (plan.safeMode && alongM >= plan.distM - 20) return null
  const at = pointAlong(start, points, alongM)
  // The cause follows the ground where it happens: steep ground, or ground nobody has driven.
  const weights: Record<StuckCause, number> = { rock: 3, sand: 3, slope: 1, heat: 2 }
  if (slopeAt(r, at) > provenSlope(r)) weights.slope += 6
  if (nearestStop(r, at).distM > OFF_TRACK_M) weights.sand += 3
  let pick = rng() * CAUSE_ORDER.reduce((a, c) => a + weights[c], 0)
  let cause: StuckCause = 'rock'
  for (const c of CAUSE_ORDER) { if (pick < weights[c]) { cause = c; break } pick -= weights[c] }
  return { alongM, cause }
}

/** The point a given distance along a path. */
export function pointAlong(start: Pt, points: Pt[], alongM: number): Pt {
  let from = start, left = alongM
  for (const to of points) {
    const d = dist(from, to)
    if (left <= d) { const f = d ? left / d : 0; return { x: Math.round(from.x + (to.x - from.x) * f), y: Math.round(from.y + (to.y - from.y) * f) } }
    left -= d
    from = to
  }
  return from
}
/** The planned points up to a distance along the path, ending at the point where the rover stops. */
export function cutPath(start: Pt, points: Pt[], alongM: number): Pt[] {
  const out: Pt[] = []
  let from = start, left = alongM
  for (const to of points) {
    const d = dist(from, to)
    if (left <= d) { out.push(pointAlong(from, [to], left)); return out }
    out.push(to)
    left -= d
    from = to
  }
  return out
}

// ---------------------------------------------------------------- One rescue
export interface RescueTry { fix: FixId; freed: boolean; sols: number; wear: number; text: string }
export interface Rescue {
  cause: StuckCause
  /** Where the rover is stuck, and the letter of that spot. */
  at: Pt
  spot: string
  telemetry: Telemetry
  /** What the pilot said the problem was, before choosing a fix. */
  diagnosis: StuckCause | null
  tries: RescueTry[]
  solsUsed: number
  wearBefore: number
  /**
   * How it ended, or null while the rover is still stuck. 'clean': the first fix worked.
   * 'freed': it took more than one. 'held': the Mars days ran out before any fix worked.
   */
  result: 'clean' | 'freed' | 'held' | null
}
export const newRescue = (cause: StuckCause, at: Pt, spot: string, wearBefore: number, rng: () => number): Rescue =>
  ({ cause, at, spot, telemetry: telemetry(cause, rng), diagnosis: null, tries: [], solsUsed: 0, wearBefore, result: null })

/** Mars days left before the limit. */
export const rescueLeft = (r: Rescue) => Math.max(0, RESCUE_LIMIT_SOLS - r.solsUsed)
