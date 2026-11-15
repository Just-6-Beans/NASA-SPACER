// Rover expedition rules: a path of points on a real 3 km map, one battery charge for the whole
// trip, tests at each spot, and a verdict on whether the spot suits a base. Plain TypeScript: no
// DOM, no Phaser, so the tests can run it. Forecast and execution share one calculation.
//
// REAL = taken from a NASA snapshot in data/nasa/ or a NASA fact page (see rovers.ts).
// MODEL = our game rule, labelled as such in the game.
import remsFile from '../../data/nasa/gale-rems-recent.json'
import molaFile from '../../data/nasa/mola-roughness-regions.json'
import siteFile from '../../data/nasa/site-references.json'
import type { InstrumentId } from './data'
import { ROVERS, mmrtgNowW, type AreaStop, type Photo, type RoverId, type RoverSpec } from './rovers'

// ---------------------------------------------------------------- Real data
export interface WeatherSol {
  sol: number; earthDate: string; ls: number | null; minAirTemp: number; maxAirTemp: number
  minGroundTemp: number | null; maxGroundTemp: number | null; pressure: number | null; uvIndex: string | null
  sunrise: string; sunset: string
}
export const WEATHER_SOURCE = { provider: remsFile.provider, location: remsFile.location, retrieved: remsFile.retrieved, note: remsFile.note, source: remsFile.source }
/** The three newest complete REMS sols (REAL, Gale Crater). */
export const WEATHER: WeatherSol[] = (remsFile.records as WeatherSol[]).slice(-3)

export type RegionId = 'jezero' | 'gale'
export interface Region { id: RegionId; name: string; where: string; lat: number; lon: number; roughnessM: number; rover: RoverId }
export const ROUGHNESS_SOURCE = { provider: molaFile.provider, retrieved: molaFile.retrieved, note: molaFile.note, info: molaFile.info }
export const ICE_SOURCE = siteFile.ice
export const RADIATION = siteFile.radiation
/** A film NASA made from the rover's own camera frames during a real drive. */
export interface DriveFilm { rover: string; file: string; kind: string; title: string; date: string; credit: string; page: string; note: string }
export const DRIVE_FILMS: DriveFilm[] = siteFile.driveFilms
export const REGIONS: Region[] = molaFile.places.map(p => ({
  id: p.id as RegionId, name: p.name, where: p.where, lat: p.lat, lon: p.lon, roughnessM: p.roughnessM,
  rover: Object.values(ROVERS).find(r => r.region === p.id)!.id,
}))
export const region = (id: RegionId) => REGIONS.find(r => r.id === id)!

// ---------------------------------------------------------------- Power: REAL facts, MODEL loads
/** REAL operating rule for Perseverance: battery kept at 40 % or more. Crossing it means safe mode. */
export const RESERVE_FRACTION = 0.4
/** MODEL: computers, radios and always-on electronics. */
export const BASE_LOAD_W = 30
/** REAL: gravity at the surface of Mars, m/s². */
export const MARS_G = 3.71
export const reserveWh = (r: RoverSpec) => Math.round(r.batteryWh * RESERVE_FRACTION)
/**
 * The battery the rover may spend, as a percentage: 100 % is a full battery and 0 % is the
 * safe-mode line. The game shows this one gauge so drives and tests share a unit.
 */
export const spendPct = (r: RoverSpec, wh: number) => Math.max(0, Math.round(((wh - reserveWh(r)) / (r.batteryWh - reserveWh(r))) * 100))
/** A cost in watt-hours as a share of the spendable battery, in percent (at least 1). */
export const costPct = (r: RoverSpec, wh: number) => Math.max(1, Math.round((wh / (r.batteryWh - reserveWh(r))) * 100))
/**
 * Battery energy per metre driven. Driving needs under 200 W (REAL; 190 W used, 30 W less with a
 * balanced pack, MODEL) plus the base load; the MMRTG covers part and the battery the rest.
 */
export const driveWhPerM = (r: RoverSpec, balanced: boolean) => (r.driveW - (balanced ? 30 : 0) + BASE_LOAD_W - mmrtgNowW(r)) / r.topSpeedMh
/** Physics: lifting the rover one metre on Mars takes mass × gravity joules (3,600 J = 1 Wh). */
export const climbWhPerM = (r: RoverSpec) => (r.massKg * MARS_G) / 3600

// ---------------------------------------------------------------- Terrain (REAL: MOLA heights, rover stops)
export interface Pt { x: number; y: number }
export const halfMap = (r: RoverSpec) => r.area.sizeM / 2
export const inMap = (r: RoverSpec, p: Pt) => Math.abs(p.x) <= halfMap(r) && Math.abs(p.y) <= halfMap(r)

/** MOLA height at a map point, interpolated between the 463 m grid cells. */
export function heightAt(r: RoverSpec, p: Pt): number {
  const g = r.area.mola
  const idx = (arr: number[], v: number) => {
    let i = 0
    while (i < arr.length - 2 && arr[i + 1] <= v) i++
    return { i, f: Math.max(0, Math.min(1, (v - arr[i]) / (arr[i + 1] - arr[i]))) }
  }
  const a = idx(g.x, p.x), b = idx(g.y, p.y)
  const h = g.heights
  const top = h[b.i][a.i] + (h[b.i][a.i + 1] - h[b.i][a.i]) * a.f
  const bot = h[b.i + 1][a.i] + (h[b.i + 1][a.i + 1] - h[b.i + 1][a.i]) * a.f
  return top + (bot - top) * b.f
}

/** Average slope in degrees over about one MOLA cell around a point. */
export function slopeAt(r: RoverSpec, p: Pt): number {
  const d = r.area.mola.cellM / 2
  const gx = (heightAt(r, { x: p.x + d, y: p.y }) - heightAt(r, { x: p.x - d, y: p.y })) / (2 * d)
  const gy = (heightAt(r, { x: p.x, y: p.y + d }) - heightAt(r, { x: p.x, y: p.y - d })) / (2 * d)
  return Math.round(((Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI) * 10) / 10
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
export function nearestStop(r: RoverSpec, p: Pt): { stop: AreaStop; distM: number } {
  let best = r.area.stops[0], bd = Infinity
  for (const s of r.area.stops) { const d = dist(s, p); if (d < bd) { bd = d; best = s } }
  return { stop: best, distM: bd }
}
/** A spot this close to a real rover stop uses the tilt and elevation NASA measured there. */
export const STOP_RANGE_M = 75

export interface Ground { source: 'rover' | 'mola'; tiltDeg: number; elevationM: number; sol: number | null; distM: number | null }
/** What we know about the ground at a point: a nearby real rover measurement, else MOLA from orbit. */
export function groundAt(r: RoverSpec, p: Pt): Ground {
  const n = nearestStop(r, p)
  if (n.distM <= STOP_RANGE_M) return { source: 'rover', tiltDeg: n.stop.tiltDeg, elevationM: n.stop.elevationM, sol: n.stop.sol, distM: Math.round(n.distM) }
  return { source: 'mola', tiltDeg: slopeAt(r, p), elevationM: Math.round(heightAt(r, p)), sol: null, distM: null }
}

// ---------------------------------------------------------------- Driving a path
export const MAX_WAYPOINTS = 8
export interface Leg { from: Pt; to: Pt; distM: number; climbM: number; wh: number; hours: number; partial: boolean }
/** A real photo spot a drive passes: which place, and how far along the drive the rover reaches it. */
export interface DrivePhoto { place: number; alongM: number }
export interface DriveResult {
  legs: Leg[]; start: Pt; end: Pt; distM: number; climbM: number; hours: number
  startWh: number; usedWh: number; endWh: number
  /** The battery reached the 40 % line: the rover stopped in safe mode before the last point. */
  safeMode: boolean
  /** How many of the planned points were reached. */
  reached: number
  /** Real photo spots the rover passes on this drive and has not photographed before, in the order it reaches them. */
  photos: DrivePhoto[]
}

const r1 = (n: number) => Math.round(n * 10) / 10
/** Height gained along a straight leg, sampled about every 50 m on the MOLA grid (downhill gives nothing back). */
function climbAlong(r: RoverSpec, a: Pt, b: Pt): number {
  const d = dist(a, b)
  const n = Math.max(1, Math.ceil(d / 50))
  let up = 0, prev = heightAt(r, a)
  for (let i = 1; i <= n; i++) {
    const h = heightAt(r, { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n })
    if (h > prev) up += h - prev
    prev = h
  }
  return up
}

export function legCost(r: RoverSpec, a: Pt, b: Pt, balanced: boolean): Leg {
  const d = dist(a, b)
  const climb = climbAlong(r, a, b)
  return { from: a, to: b, distM: r1(d), climbM: r1(climb), wh: r1(d * driveWhPerM(r, balanced) + climb * climbWhPerM(r)), hours: Math.round((d / r.topSpeedMh) * 100) / 100, partial: false }
}

/**
 * Drives the points in order on one battery. Stops in safe mode where the battery meets the 40 % line.
 * `found` lists the photo places already in the album, so the result names only the new ones it passes.
 */
export function simulateDrive(r: RoverSpec, start: Pt, points: Pt[], batteryWh: number, balanced: boolean, found: number[] = []): DriveResult {
  const floor = reserveWh(r)
  const legs: Leg[] = []
  let pos = start, wh = batteryWh, safeMode = false, reached = 0
  for (const p of points) {
    const leg = legCost(r, pos, p, balanced)
    const spare = wh - floor
    if (leg.wh > spare + 1e-9) {
      const f = Math.max(0, spare) / leg.wh
      const stop = { x: r1(pos.x + (p.x - pos.x) * f), y: r1(pos.y + (p.y - pos.y) * f) }
      legs.push({ from: pos, to: stop, distM: r1(leg.distM * f), climbM: r1(leg.climbM * f), wh: r1(Math.max(0, spare)), hours: Math.round(leg.hours * f * 100) / 100, partial: true })
      pos = stop
      wh = Math.min(wh, floor)
      safeMode = true
      break
    }
    legs.push(leg)
    pos = p
    wh -= leg.wh
    reached++
  }
  const sum = (k: 'distM' | 'climbM' | 'hours') => legs.reduce((a, l) => a + l[k], 0)
  return { legs, start, end: pos, distM: Math.round(sum('distM')), climbM: Math.round(sum('climbM')), hours: Math.round(sum('hours') * 10) / 10, startWh: Math.round(batteryWh), usedWh: Math.round(batteryWh - wh), endWh: Math.round(wh), safeMode, reached, photos: photosAlong(r, legs, found) }
}

// ---------------------------------------------------------------- Tests at a spot
export type TestId = 'photo' | 'weather' | 'radiation' | 'drill'
export type ActionKind = 'drive' | TestId
export interface TestInfo { id: TestId; name: string; verb: string; fills: string; scope: 'spot' | 'region' }
export const TESTS: Record<TestId, TestInfo> = {
  photo: { id: 'photo', name: 'Photograph', verb: 'Photograph the ground', fills: 'Level ground', scope: 'spot' },
  weather: { id: 'weather', name: 'Weather', verb: 'Take a weather reading', fills: 'Sunlight and warmth', scope: 'region' },
  radiation: { id: 'radiation', name: 'Radiation', verb: 'Take a radiation reading', fills: 'Radiation', scope: 'region' },
  // Coring is not a button at a spot: it is the sample selection at the sample sites (samples.ts), and it counts for the whole region.
  drill: { id: 'drill', name: 'Rock samples', verb: 'Core three rock samples', fills: 'Rock samples', scope: 'region' },
}
/** The tests a pilot can run at any spot. Rock samples are taken at the sample sites instead. */
export const TEST_ORDER: TestId[] = ['photo', 'weather', 'radiation']
/** What a test does, in the words shown to the player. */
export function testNote(r: RoverSpec, t: TestId): string {
  if (t === 'photo') return 'The cameras image the ground so its slope can be measured.'
  if (t === 'weather') return `${r.id === 'perseverance' ? 'MEDA' : 'REMS'} reads daylight and temperature. One reading covers the whole region.`
  if (t === 'radiation') return r.id === 'perseverance'
    ? 'Perseverance has no radiation detector, so this relays Curiosity\'s RAD reading. One reading covers the whole region.'
    : 'RAD counts the radiation reaching the ground. One reading covers the whole region.'
  return 'The arm cores a rock at a sample site and seals the core in a tube. There are three tubes.'
}
/** MODEL: battery each test uses (NASA publishes no per-activity figures). For 'drill': coring all three tubes. */
export function testWh(t: TestId, inst: InstrumentId, fastDrill: boolean): number {
  if (t === 'photo') return 80
  if (t === 'weather' || t === 'radiation') return 40
  return Math.round((inst === 'gpr' ? 380 : 300) * (fastDrill ? 0.7 : 1))
}

// ---------------------------------------------------------------- Scoring a spot
export interface Bar { id: string; name: string; score: number | null; value: string; source: string; real: string; model: string; shared: boolean; needs: TestId | null }

const pct = (v: number) => Math.max(0, Math.min(100, Math.round(v)))
/** MODEL: steepest ground we accept for a base. */
export const MAX_BASE_TILT = 10
/** MODEL: a site scoring this or more, on level ground, is a good place. */
export const GOOD_SCORE = 60

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
export const daylightHours = (w: WeatherSol) => { const t = (s: string) => { const [h, m] = s.split(':').map(Number); return h + m / 60 }; return Math.round((t(w.sunset) - t(w.sunrise)) * 100) / 100 }

/** The roughness bar is known from orbit before the rover moves. */
export function orbitBars(reg: Region): Bar[] {
  return [{ id: 'rough', name: 'Smooth terrain', score: pct(100 * (1 - (reg.roughnessM - 1) / 4)), value: `Bumps about ${reg.roughnessM} m high, seen from orbit`, source: `MOLA laser altimeter, ${reg.name}`, real: `Terrain roughness of ${reg.roughnessM} m (RMS), measured from orbit and averaged over about 22 km.`, model: 'Score: 1 m or less is 100, 5 m or more is 0.', shared: true, needs: null }]
}

/**
 * All six bars for a spot. A bar stays empty until its test has been run. `sample` is what the
 * tubes sealed at the sample sites are worth (0 to 100), or null while none are sealed.
 */
export function spotBars(r: RoverSpec, p: Pt, done: TestId[], sample: { value: number; text: string } | null): Bar[] {
  const reg = region(r.region)
  const has = (t: TestId) => done.includes(t)
  const g = groundAt(r, p)
  const day = avg(WEATHER.map(daylightHours))
  const tmin = Math.round(avg(WEATHER.map(w => w.minAirTemp))), tmax = Math.round(avg(WEATHER.map(w => w.maxAirTemp)))
  const gale = `Curiosity REMS, Gale Crater, sols ${WEATHER[0].sol}–${WEATHER[WEATHER.length - 1].sol}`
  const standIn = r.region === 'gale' ? 'Measured at Gale Crater.' : "Measured at Gale Crater and used here as a stand-in: Perseverance's weather feed is too patchy."
  const levelScore = has('photo') ? pct(100 * (1 - g.tiltDeg / 15)) : null
  const levelModel = `Score: 0° is 100, 15° is 0. A base needs ${MAX_BASE_TILT}° or less.`
  const steep = g.tiltDeg > MAX_BASE_TILT ? `too steep, the limit is ${MAX_BASE_TILT}°` : `a base needs ${MAX_BASE_TILT}° or less`
  const level: Bar = g.source === 'rover'
    ? { id: 'level', name: 'Level ground', score: levelScore, value: has('photo') ? `Tilt ${g.tiltDeg}° (${steep})` : 'Photograph to measure the slope', source: `${r.name} position data, sol ${g.sol}, ${g.distM} m from this spot`, real: `The tilt NASA recorded when ${r.name} really parked here, at ${g.elevationM} m elevation.`, model: levelModel, shared: false, needs: 'photo' }
    : { id: 'level', name: 'Level ground', score: levelScore, value: has('photo') ? `Slope about ${g.tiltDeg}° (${steep})` : 'Photograph to measure the slope', source: 'MOLA laser altimeter heights (463 m grid)', real: `No rover has parked within ${STOP_RANGE_M} m, so this is the average slope from orbit over about 460 m, at ${g.elevationM} m elevation. Small bumps and dips do not show.`, model: levelModel, shared: false, needs: 'photo' }
  return [
    level,
    ...orbitBars(reg),
    { id: 'sun', name: 'Sunlight', score: has('weather') ? pct((day / 14) * 100) : null, value: has('weather') ? `${Math.round(day * 10) / 10} hours of daylight for solar panels` : 'Take a weather reading', source: gale, real: `Sunrise and sunset. ${standIn}`, model: 'Score: 14 h of daylight is 100.', shared: true, needs: 'weather' },
    { id: 'warm', name: 'Warmth', score: has('weather') ? pct(tmin + 100) : null, value: has('weather') ? `Nights ${tmin} °C, days ${tmax} °C: hard for a greenhouse` : 'Take a weather reading', source: gale, real: `Air temperature. ${standIn}`, model: 'Score: a −100 °C night is 0, a 0 °C night is 100.', shared: true, needs: 'weather' },
    { id: 'rad', name: 'Low radiation', score: has('radiation') ? pct(100 * (1 - RADIATION.mGyPerSol / 0.5)) : null, value: has('radiation') ? `${RADIATION.mGyPerSol} mGy each Mars day, measured at Gale` : 'Take a radiation reading', source: RADIATION.label, real: RADIATION.note, model: 'Score: 0 mGy per sol is 100, 0.5 or more is 0.', shared: true, needs: 'radiation' },
    { id: 'sample', name: 'Rock samples', score: sample ? sample.value : null, value: sample ? sample.text : 'Fill three tubes at the sample sites', source: "Game rule, modelled on Perseverance's sample tubes", real: 'The five rocks at the sample sites are modelled on samples Perseverance really sealed. What each is worth, and which site it lies at, is our model, not a NASA figure.', model: 'Score: the science value of the tubes you sealed, out of 100. No tubes: 0.', shared: true, needs: 'drill' },
  ]
}

/** Site score: the average of all six bars, counting an unmeasured bar as 0, plus any bonus. */
export const siteScore = (bars: Bar[], bonus = 0) => Math.min(100, Math.round(avg(bars.map(b => b.score ?? 0))) + bonus)

export interface Verdict { level: 'good' | 'risky' | 'bad' | 'unknown'; title: string; good: string[]; bad: string[]; missing: string[] }
export function verdict(bars: Bar[], score: number, ground: Ground): Verdict {
  const lv = bars.find(b => b.id === 'level')!
  const good = bars.filter(b => b.score !== null && b.score >= 66).map(b => `${b.name}: ${b.value}`)
  const bad = bars.filter(b => b.score !== null && b.score < 40).map(b => `${b.name}: ${b.value}`)
  const missing = bars.filter(b => b.score === null).map(b => b.name)
  if (lv.score === null) return { level: 'unknown', title: 'Not checked yet: photograph the ground to measure its slope', good, bad, missing }
  if (ground.tiltDeg > MAX_BASE_TILT) return { level: 'bad', title: `Bad place: ${ground.tiltDeg}° is too steep for a base (the limit is ${MAX_BASE_TILT}°)`, good, bad, missing }
  if (score >= GOOD_SCORE) return { level: 'good', title: `Good place: the ground is level and the site scores ${score} out of 100`, good, bad, missing }
  return { level: 'risky', title: missing.length ? `Risky place: level enough, but ${missing.length} check${missing.length > 1 ? 's are' : ' is'} still missing` : `Risky place: level enough, but it only scores ${score} out of 100`, good, bad, missing }
}

/** 0–3 stars for the base that was built. */
export const starsFor = (score: number, approved: boolean, level: Verdict['level']) => !approved ? 0 : level === 'good' && score >= 65 ? 3 : level === 'good' || (level === 'risky' && score >= 50) ? 2 : 1

// ---------------------------------------------------------------- Mission days and recharging
/** REAL: a Mars day (sol) lasts 24 h 39 min 35 s. */
export const SOL_HOURS = 24.6597
/** MODEL: Mars days the crew can wait in orbit before the base has to be chosen. A game number, not NASA's. */
export const MISSION_SOLS = 10
/**
 * Power going into the battery while the rover is parked: what its MMRTG makes now (REAL inputs)
 * minus the always-on load (MODEL).
 */
export const rechargeW = (r: RoverSpec) => mmrtgNowW(r) - BASE_LOAD_W
/** Hours of parking needed to fill the battery from a given charge. */
export const rechargeHours = (r: RoverSpec, fromWh: number) => Math.max(0, r.batteryWh - fromWh) / rechargeW(r)
/** Mars days for a full recharge, starting from the safe-mode line. */
export const fullRechargeSols = (r: RoverSpec) => rechargeHours(r, reserveWh(r)) / SOL_HOURS
/** Metres of flat driving on one full battery. */
export const rangeM = (r: RoverSpec) => (r.batteryWh - reserveWh(r)) / driveWhPerM(r, false)

// ---------------------------------------------------------------- Real photo places
/** A place inside the map where the real rover took the saved photos. */
export interface PhotoPlace { id: number; x: number; y: number; sol: number; photos: Photo[] }
const placeCache = new Map<RoverId, PhotoPlace[]>()
export function photoPlaces(r: RoverSpec): PhotoPlace[] {
  const hit = placeCache.get(r.id)
  if (hit) return hit
  const out: PhotoPlace[] = []
  for (const p of r.area.photos) {
    const at = out.find(q => q.x === p.x && q.y === p.y)
    if (at) at.photos.push(p)
    else out.push({ id: out.length, x: p.x, y: p.y, sol: p.sol, photos: [p] })
  }
  placeCache.set(r.id, out)
  return out
}
/** MODEL: how close the rover must pass to a photo place to photograph it. Its cameras do this by themselves. */
export const PHOTO_RANGE_M = 120
/** MODEL: each real photo place found adds this to the base score, up to the cap. */
export const PHOTO_BONUS_EACH = 2
export const PHOTO_BONUS_MAX = 10
export const photoBonus = (found: number) => Math.min(PHOTO_BONUS_MAX, found * PHOTO_BONUS_EACH)

/** The real photo place the rover is at: the nearest one within range of a position, or null. */
export function placeNear(r: RoverSpec, pos: Pt): { place: PhotoPlace; distM: number } | null {
  let best: PhotoPlace | null = null, bd = Infinity
  for (const pl of photoPlaces(r)) {
    const d = dist(pl, pos)
    if (d < bd) { bd = d; best = pl }
  }
  return best && bd <= PHOTO_RANGE_M ? { place: best, distM: bd } : null
}
/** Every photo place within range of a position (the rover is parked beside them). */
export const placesInRange = (r: RoverSpec, pos: Pt) => photoPlaces(r).filter(pl => dist(pl, pos) <= PHOTO_RANGE_M)

/**
 * New photo places a drive passes within range, each with the distance along the drive at which
 * the rover first comes into range. Sorted by that distance, so they are in the order it meets them.
 */
function photosAlong(r: RoverSpec, legs: Leg[], found: number[]): DrivePhoto[] {
  const out: DrivePhoto[] = []
  for (const pl of photoPlaces(r)) {
    if (found.includes(pl.id)) continue
    let acc = 0
    for (const leg of legs) {
      // Where the straight leg first comes within range of the place (a circle around it).
      const dx = leg.to.x - leg.from.x, dy = leg.to.y - leg.from.y
      const fx = leg.from.x - pl.x, fy = leg.from.y - pl.y
      const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - PHOTO_RANGE_M ** 2
      let t: number | null = null
      if (c <= 0) t = 0
      else if (a > 0) {
        const disc = b * b - 4 * a * c
        if (disc >= 0) { const t1 = (-b - Math.sqrt(disc)) / (2 * a); if (t1 >= 0 && t1 <= 1) t = t1 }
      }
      if (t !== null) { out.push({ place: pl.id, alongM: Math.round((acc + t * leg.distM) * 10) / 10 }); break }
      acc += leg.distM
    }
  }
  return out.sort((x, y) => x.alongM - y.alongM)
}

// ---------------------------------------------------------------- Choosing a rover: what each is good and bad at
export interface Trait { title: string; text: string }
export interface RoverTraits { pros: Trait[]; cons: Trait[]; stats: { label: string; value: string }[]; easier: boolean }
const tens = (n: number) => (Math.round(n / 10) * 10).toLocaleString('en-US')
const tenth = (n: number) => (Math.round(n * 10) / 10).toString()

/**
 * Pros and cons for the "choose your rover" screen. Every line comes from the same numbers the
 * game plays with: REAL facts (power source, mass, where the rover is parked, what it can
 * measure) and the range and recharge time our MODEL works out from them.
 */
export function roverTraits(r: RoverSpec): RoverTraits {
  const o = Object.values(ROVERS).find(x => x.id !== r.id)!
  const reg = region(r.region), oreg = region(o.region)
  const pros: Trait[] = [], cons: Trait[] = []
  const range = rangeM(r), sols = fullRechargeSols(r), tilt = Math.round(r.area.centre.tiltDeg * 10) / 10
  if (range >= rangeM(o)) pros.push({ title: 'Goes farther', text: `about ${tens(range)} m on one charge, because its power source still makes ${mmrtgNowW(r)} W` })
  else cons.push({ title: 'Shorter range', text: `about ${tens(range)} m on one charge, because its older power source makes only ${mmrtgNowW(r)} W` })
  if (sols <= fullRechargeSols(o)) pros.push({ title: 'Recharges fast', text: `a full charge takes about ${tenth(sols)} Mars days` })
  else cons.push({ title: 'Recharges slowly', text: `a full charge takes about ${tenth(sols)} Mars days` })
  if (r.area.centre.tiltDeg <= MAX_BASE_TILT) pros.push({ title: 'Starts on gentle ground', text: `it is parked on a ${tilt}° slope, level enough for a base` })
  else cons.push({ title: 'Starts on a steep slope', text: `it is parked on a ${tilt}° slope, too steep for a base, so it must drive to find level ground` })
  if (reg.roughnessM <= oreg.roughnessM) pros.push({ title: 'Smoother crater', text: `bumps about ${reg.roughnessM} m high, seen from orbit` })
  else cons.push({ title: 'Rougher crater', text: `bumps about ${reg.roughnessM} m high, seen from orbit` })
  const close = (x: RoverSpec) => photoPlaces(x).filter(p => Math.hypot(p.x, p.y) <= 600).length
  if (close(r) >= close(o)) pros.push({ title: 'Photo spots close by', text: `${close(r)} real photo spots within 600 m of the start` })
  else cons.push({ title: 'Photo spots far apart', text: `only ${close(r)} real photo spots within 600 m of the start` })
  if (r.massKg <= o.massKg) pros.push({ title: 'Light', text: `${r.massKg.toLocaleString('en-US')} kg, so climbing a hill costs less battery` })
  else cons.push({ title: 'Heavy', text: `${r.massKg.toLocaleString('en-US')} kg, so climbing a hill costs more battery` })
  if (r.region === 'gale') pros.push({ title: 'Its own weather and radiation', text: 'both were really measured in this crater, by this rover' })
  else cons.push({ title: 'Borrowed weather and radiation', text: "it has no radiation detector, so those numbers come from Curiosity's crater" })
  return {
    pros, cons, easier: pros.length > cons.length,
    stats: [
      { label: 'Power now', value: `${mmrtgNowW(r)} W` },
      { label: 'Range per charge', value: `${tens(range)} m` },
      { label: 'Full recharge', value: `${tenth(sols)} Mars days` },
      { label: 'Weight', value: `${r.massKg.toLocaleString('en-US')} kg` },
    ],
  }
}
