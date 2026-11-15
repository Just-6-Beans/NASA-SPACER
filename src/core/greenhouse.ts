// The station greenhouse, played as two short missions and one event. Plain TypeScript, no DOM
// and no Phaser, so the tests can run it and the panels and the deck only read it.
//
//   G1  Grow Light     Set six controls in three steps, then keep plant health above 80 % for a
//                      10-day test without drawing more power than the budget.
//   G2  What to Grow   Pick 3 of 6 crops, plant the 8 bays, then feed the crew for 30 days
//                      without running out of water. One "harvest all" brings in every ready bay.
//   E   Pump failure   By chance during G2 both pumps stop and there is one spare part: the
//                      player saves side A or side B, and the other side grows at half speed.
//
// REAL AND MODEL. The idea follows NASA's plant chambers on the ISS (Veggie and the Advanced
// Plant Habitat). Every number here is OUR GAME MODEL: the good zones, the power budget, the
// crew's calories, the tank and the score.
//
// CLOCK. The greenhouse keeps its own clock. A mission lasts a few real seconds and its "days"
// are greenhouse days: they never move the mission time or the Mars days of the rover.
import { CROPS, crop, stageAt, type BayKind, type CropId, type Stage } from './crops'

// ------------------------------------------------------------------ Model constants
export const GH = {
  /** Plants standing on a rack of each kind. Must match the racks in src/art/geo.json. */
  plants: { tier: 8, tall: 3 } as Record<BayKind, number>,
  /** One orbit of the exterior view in real seconds, and the sunlit share of it (for the array wings). */
  orbitSeconds: 184,
  orbitOffset: 8,
  sunlitShare: 0.62,

  // G1: the health test
  testSeconds: 10,
  testDays: 10,
  /** Plant health must stay at or above this, in percent. */
  healthLine: 80,
  /** Health lost each second for every reading outside its good zone, and won back each second when all are inside. */
  harmPerSecond: 5,
  healPerSecond: 2,
  powerBudgetKw: 3.5,
  /** Lamps at full, pumps at full, and what always runs (fans, controls). */
  lightKw: 4,
  pumpKw: 0.5,
  baseKw: 0.6,
  /** Seconds over the budget, in total, before the breaker trips. */
  overdrawSeconds: 3,

  // G2: the feeding run
  runSeconds: 10,
  runDays: 30,
  /** How many crops the player picks. */
  picks: 3,
  /** Calories the crew needs from the greenhouse each day. The run must bring in 30 days of it. */
  crewKcalPerDay: 1000,
  tankL: 1400,
  /** Extra water in the tank when the station's water purifier has been repaired. */
  purifierBonusL: 120,
  /** The forecast assumes "harvest all" is pressed this many real seconds after a bay is ready. */
  forecastDelay: 0.5,

  // the pump failure
  pumpChance: 0.5,
  /** The failure starts between these real seconds of the run (days 15 to 22). */
  pumpWindow: [5, 7.5] as [number, number],
  /** Growth speed of the side that is not saved. */
  slowSpeed: 0.5,

  points: { g1: 40, g2: 50, pump: 10 },
} as const

/** Real seconds the simulation advances at once. */
const STEP = 0.05
const EPS = 1e-6
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// ------------------------------------------------------------------ Bays
export type BayId = 'A1' | 'A2' | 'A3' | 'A4' | 'B1' | 'B2' | 'B3' | 'B4'
/** A side of the module: one pump feeds the four bays of a side. */
export type LoopId = 'A' | 'B'
export const BAY_IDS: BayId[] = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4']
/** Bay hardware: which side it is on and what its rack is built for (scripts/build-geo.mjs mirrors this). */
export const BAY_PLAN: Record<BayId, { loop: LoopId; kind: BayKind }> = {
  A1: { loop: 'A', kind: 'tier' }, A2: { loop: 'A', kind: 'tier' }, A3: { loop: 'A', kind: 'tall' }, A4: { loop: 'A', kind: 'tall' },
  B1: { loop: 'B', kind: 'tier' }, B2: { loop: 'B', kind: 'tier' }, B3: { loop: 'B', kind: 'tall' }, B4: { loop: 'B', kind: 'tall' },
}
/** What the leaves show on the deck. */
export type Symptom = 'none' | 'wilt' | 'yellow' | 'spots'
/** How loud the module's beacon is. */
export type AlertLevel = 'warning' | 'degraded' | 'damage' | 'recovery'

// ------------------------------------------------------------------ G1: the six controls
export type SliderId = 'light' | 'temp' | 'humidity' | 'co2' | 'water' | 'nutrients'
export interface SliderSpec {
  id: SliderId
  label: string
  unit: string
  min: number
  max: number
  step: number
  /** MODEL: the good zone. A reading outside it costs plant health. */
  good: [number, number]
  /** Where the control stands when the module is handed over: always outside the good zone. */
  start: number
  /** What is wrong when the reading is below or above the zone. */
  low: string
  high: string
}
export const SLIDERS: SliderSpec[] = [
  { id: 'light', label: 'Light', unit: '%', min: 0, max: 100, step: 5, good: [40, 80], start: 20, low: 'too little light', high: 'too much light' },
  { id: 'temp', label: 'Temperature', unit: '°C', min: 10, max: 35, step: 1, good: [20, 25], start: 15, low: 'too cold', high: 'too hot' },
  { id: 'humidity', label: 'Humidity', unit: '%', min: 30, max: 95, step: 5, good: [55, 70], start: 85, low: 'air too dry', high: 'air too humid' },
  { id: 'co2', label: 'CO2', unit: 'ppm', min: 400, max: 2000, step: 100, good: [800, 1200], start: 400, low: 'too little CO2', high: 'too much CO2' },
  { id: 'water', label: 'Water', unit: '%', min: 0, max: 100, step: 5, good: [40, 60], start: 85, low: 'under-watering', high: 'over-watering' },
  { id: 'nutrients', label: 'Nutrients', unit: '%', min: 0, max: 100, step: 5, good: [40, 60], start: 15, low: 'too few nutrients', high: 'too many nutrients' },
]
export const slider = (id: SliderId) => SLIDERS.find(s => s.id === id)!
export const SLIDER_IDS = SLIDERS.map(s => s.id)

/** The three steps of the G1 checklist and the controls under each. */
export const STEPS: { n: 1 | 2 | 3; label: string; sliders: SliderId[] }[] = [
  { n: 1, label: 'Set light level', sliders: ['light'] },
  { n: 2, label: 'Balance temperature and humidity', sliders: ['temp', 'humidity', 'co2'] },
  { n: 3, label: 'Set water and nutrients', sliders: ['water', 'nutrients'] },
]

/**
 * MODEL: what the growing plants do to the room during the test. Each one pushes a reading out
 * of its good zone wherever the control stood inside it, and can always be corrected.
 */
export const DRIFTS: { slider: SliderId; delta: number; text: string }[] = [
  { slider: 'temp', delta: 6, text: 'The lamps are warming the air. Lower the temperature.' },
  { slider: 'humidity', delta: 20, text: 'The plants are breathing out water. Lower the humidity.' },
  { slider: 'co2', delta: -500, text: 'The plants are using up the CO2. Raise the CO2.' },
  { slider: 'water', delta: -25, text: 'The plants are drinking more. Raise the water.' },
  { slider: 'nutrients', delta: -25, text: 'The plants are using up the nutrients. Raise the nutrients.' },
]
/** Real seconds a drift takes to reach its full size. */
const DRIFT_RAMP = 1

export type ReadingStatus = 'low' | 'ok' | 'high'
interface Drift { at: number; slider: SliderId; delta: number; text: string }
export interface Test {
  /** Real seconds into the test. */
  t: number
  health: number
  minHealth: number
  /** Seconds spent over the power budget so far. */
  overdraw: number
  drifts: Drift[]
  /** Seconds each reading has spent outside its zone. */
  harm: Record<SliderId, number>
}
export interface TestResult {
  won: boolean
  /** The greenhouse day the test ended on, 1 to 10. */
  day: number
  health: number
  minHealth: number
  cause: 'health' | 'power' | null
  reason: string
}

// ------------------------------------------------------------------ G2: the feeding run
export type Plan = Record<BayId, CropId | null>
export const emptyPlan = (): Plan => ({ A1: null, A2: null, A3: null, A4: null, B1: null, B2: null, B3: null, B4: null })

export interface RunBay {
  id: BayId
  loop: LoopId
  crop: CropId | null
  /** 0..1 toward the next harvest. */
  progress: number
  ready: boolean
  harvests: number
  /** 1, or GH.slowSpeed on the side that lost its pump. */
  speed: number
}
export interface Pump {
  /** Real second of the run when the pumps fail, or null when they never do. */
  at: number | null
  state: 'none' | 'pending' | 'fixed'
  /** The side the spare part went to. */
  saved: LoopId | null
}
export interface Harvest { day: number; crop: CropId; bays: number; kcal: number }
export interface Run {
  /** Real seconds into the run. */
  t: number
  waterL: number
  tankL: number
  bays: RunBay[]
  pump: Pump
  harvests: Harvest[]
  /** Calories brought in so far. The run is won when this reaches NEED_KCAL by day 30. */
  kcalHarvested: number
  over: { won: boolean; cause: 'food' | 'water' | null } | null
}
export interface RunResult {
  won: boolean
  /** The greenhouse day the run ended on, 1 to 30. */
  day: number
  cause: 'food' | 'water' | null
  reason: string
  kcalHarvested: number
  /** Days of the 30 the harvest feeds the crew. */
  fedDays: number
  waterL: number
  tankL: number
  harvests: Harvest[]
  /** The side saved after a pump failure, or null when no pump failed. */
  pump: LoopId | null
}
export interface Forecast {
  won: boolean
  cause: 'food' | 'water' | null
  /** The day the water runs out, or 30. */
  day: number
  /** Calories brought in by the end of each day: 30 values. */
  curve: number[]
  kcalHarvested: number
  fedDays: number
  waterL: number
  harvests: Harvest[]
}

const DAYS_PER_SECOND = GH.runDays / GH.runSeconds
/** Calories the run must bring in: the crew's need for all 30 days. */
export const NEED_KCAL = GH.crewKcalPerDay * GH.runDays
export const runDay = (r: { t: number }) => clamp(Math.floor(r.t * DAYS_PER_SECOND + EPS) + 1, 1, GH.runDays)
export const fedDays = (kcal: number) => clamp(Math.floor(kcal / GH.crewKcalPerDay + EPS), 0, GH.runDays)

export function newRun(plan: Plan, tankL: number = GH.tankL, pumpAt: number | null = null): Run {
  return {
    t: 0, waterL: tankL, tankL,
    bays: BAY_IDS.map(id => ({ id, loop: BAY_PLAN[id].loop, crop: plan[id], progress: 0, ready: false, harvests: 0, speed: 1 })),
    pump: { at: pumpAt, state: 'none', saved: null },
    harvests: [], kcalHarvested: 0, over: null,
  }
}

/** Brings in every ready bay and lets it regrow. Returns how many bays were harvested. */
export function collect(r: Run): number {
  if (r.over) return 0
  const day = runDay(r)
  let n = 0
  for (const b of r.bays) {
    if (!b.crop || !b.ready) continue
    const c = crop(b.crop)
    r.kcalHarvested += c.kcal
    b.ready = false; b.progress = 0; b.harvests++
    const h = r.harvests.find(x => x.day === day && x.crop === c.id)
    if (h) { h.bays++; h.kcal += c.kcal } else r.harvests.push({ day, crop: c.id, bays: 1, kcal: c.kcal })
    n++
  }
  return n
}

/** The spare part goes to one side. The other side grows at half speed for the rest of the run. */
export function fitSpare(r: Run, side: LoopId): void {
  if (r.pump.state !== 'pending') return
  r.pump.state = 'fixed'
  r.pump.saved = side
  for (const b of r.bays) b.speed = b.loop === side ? 1 : GH.slowSpeed
}

/** Advances the run by `dt` real seconds (one STEP at most). It waits while a pump choice is open. */
export function stepRun(r: Run, dt: number): void {
  if (r.over || r.pump.state === 'pending') return
  if (r.pump.at !== null && r.pump.state === 'none' && r.t >= r.pump.at) { r.pump.state = 'pending'; return }
  r.t += dt
  const days = dt * DAYS_PER_SECOND
  for (const b of r.bays) {
    if (!b.crop || b.ready) continue
    const c = crop(b.crop), grown = days * b.speed
    b.progress += grown / c.growDays
    r.waterL -= c.waterLPerDay * grown
    if (b.progress >= 1 - EPS) { b.progress = 1; b.ready = true }
  }
  if (r.waterL <= EPS) { r.waterL = 0; r.over = { won: false, cause: 'water' }; return }
  if (r.t >= GH.runSeconds - EPS) {
    collect(r) // the last harvest comes in by itself when the 30 days are up
    const won = r.kcalHarvested >= NEED_KCAL - EPS
    r.over = { won, cause: won ? null : 'food' }
  }
}

/**
 * What the plan gives when "harvest all" is pressed `delay` real seconds after a bay is ready
 * and no pump fails. The plan screen shows this before the run starts.
 */
export function forecast(plan: Plan, tankL: number = GH.tankL, delay: number = GH.forecastDelay): Forecast {
  const r = newRun(plan, tankL), curve: number[] = []
  let readySince = -1
  while (!r.over) {
    const any = r.bays.some(b => b.ready)
    if (!any) readySince = -1
    else if (readySince < 0) readySince = r.t
    if (any && r.t - readySince >= delay - EPS) { collect(r); readySince = -1 }
    stepRun(r, STEP)
    while (curve.length < Math.floor(r.t * DAYS_PER_SECOND + EPS) && curve.length < GH.runDays) curve.push(r.kcalHarvested)
  }
  const day = r.over!.cause === 'water' ? runDay(r) : GH.runDays
  while (curve.length < GH.runDays) curve.push(r.kcalHarvested)
  curve[GH.runDays - 1] = r.kcalHarvested
  return { won: r.over!.won, cause: r.over!.cause, day, curve, kcalHarvested: r.kcalHarvested, fedDays: fedDays(r.kcalHarvested), waterL: r.waterL, harvests: r.harvests }
}

// ------------------------------------------------------------------ Score, notices, options
export interface ScorePart { id: 'g1' | 'g2' | 'pump'; label: string; points: number; max: number; why: string }
export interface Score { total: number; parts: ScorePart[] }
/** Something the app should announce even when no greenhouse panel is open. */
export interface Notice { text: string; kind: 'ok' | 'warn' | 'bad' }

/**
 * Where the greenhouse stands. A result is final: there is no retry.
 *   g1-setup  → g1-test → g1-result → g2-brief → g2-plan → g2-run → g2-result → done
 */
export type Phase = 'g1-setup' | 'g1-test' | 'g1-result' | 'g2-brief' | 'g2-plan' | 'g2-run' | 'g2-result' | 'done'

/** What the outside world tells the module each tick. All optional. */
export interface TickInput {
  /** 0..1 around the orbit, from the deck's exterior view, so the array wings follow what the windows show. */
  orbitPhase?: number
  crewInside?: boolean
  quiet?: boolean
}
export interface GreenhouseOptions {
  /** Seed for the drifts of the test and for the pump failure. The same seed gives the same game. */
  seed?: number
  /** False switches the drifts and the pump failure off. */
  events?: boolean
  /** Sets the real second of the run when the pumps fail (null: never). Overrides the dice. */
  pumpAt?: number | null
}

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ------------------------------------------------------------------ The module
export class Greenhouse {
  phase: Phase = 'g1-setup'
  /** The G1 pop-up has been shown (the first walk into the module). */
  briefed = false
  /** Real seconds the module has been ticked, for the orbit of the array wings. */
  t = 0
  sunlit = true

  // G1
  settings: Record<SliderId, number>
  /** What the plants add to each reading during the test. */
  offsets: Record<SliderId, number>
  test: Test | null = null
  testResult: TestResult | null = null

  // G2
  picks: CropId[] = []
  plan: Plan = emptyPlan()
  run: Run | null = null
  runResult: RunResult | null = null

  private purifier = false
  private notices: Notice[] = []
  private rng: () => number
  private events: boolean
  private pumpAt: number | null | undefined

  constructor(opts: GreenhouseOptions = {}) {
    this.rng = mulberry(opts.seed ?? Math.floor(Math.random() * 2 ** 32))
    this.events = opts.events ?? true
    this.pumpAt = opts.pumpAt
    this.settings = Object.fromEntries(SLIDERS.map(s => [s.id, s.start])) as Record<SliderId, number>
    this.offsets = Object.fromEntries(SLIDERS.map(s => [s.id, 0])) as Record<SliderId, number>
  }

  // ---------------------------------------------------------------- shared
  /** The player has started a mission. */
  get attempted(): boolean { return this.phase !== 'g1-setup' }
  /** Both missions have their final result. */
  get finished(): boolean { return this.phase === 'done' }
  /** The task counts as done: both missions are finished and at least one was won. */
  get complete(): boolean { return this.finished && (!!this.testResult?.won || !!this.runResult?.won) }
  markBriefed(): void { this.briefed = true }
  /** The station's water purifier is repaired: the tank starts fuller. */
  setPurifier(on: boolean): void { this.purifier = !!on }
  get tankStartL(): number { return GH.tankL + (this.purifier ? GH.purifierBonusL : 0) }
  /** Notices raised since the last call. */
  takeNotices(): Notice[] { const n = this.notices; this.notices = []; return n }

  /** Moves on from a result or a briefing. Returns a reason when there is nothing to move on from. */
  next(): string | null {
    if (this.phase === 'g1-result') this.phase = 'g2-brief'
    else if (this.phase === 'g2-brief') this.phase = 'g2-plan'
    else if (this.phase === 'g2-result') this.phase = 'done'
    else return 'Nothing to continue from here.'
    return null
  }

  tick(dt: number, input: TickInput = {}): void {
    if (!(dt > 0)) return
    this.t += dt
    const phase = clamp(input.orbitPhase ?? ((this.t + GH.orbitOffset) % GH.orbitSeconds) / GH.orbitSeconds, 0, 0.999999)
    this.sunlit = phase < GH.sunlitShare
    for (let left = dt; left > EPS; left -= STEP) {
      const d = Math.min(STEP, left)
      if (this.phase === 'g1-test') this.stepTest(d)
      else if (this.phase === 'g2-run') this.stepFeeding(d)
      else break
    }
  }

  // ---------------------------------------------------------------- G1
  /** What a sensor shows: the control, plus what the plants add during the test. */
  reading(id: SliderId): number { return this.settings[id] + this.offsets[id] }
  status(id: SliderId): ReadingStatus {
    const s = slider(id), v = this.reading(id)
    return v < s.good[0] - EPS ? 'low' : v > s.good[1] + EPS ? 'high' : 'ok'
  }
  /** Every control of a checklist step reads inside its good zone. */
  stepOk(n: 1 | 2 | 3): boolean { return STEPS[n - 1].sliders.every(id => this.status(id) === 'ok') }
  get powerKw(): number { return GH.baseKw + GH.lightKw * this.settings.light / 100 + GH.pumpKw * this.settings.water / 100 }
  get overBudget(): boolean { return this.powerKw > GH.powerBudgetKw + EPS }
  /** Plant health in percent: 100 before the test, the final value after it. */
  get health(): number { return this.test?.health ?? this.testResult?.health ?? 100 }
  /** The drift that is pushing a reading out now, if any, for the hint under that control. */
  hint(id: SliderId): string {
    const d = this.test?.drifts.find(x => x.slider === id && this.test!.t >= x.at)
    return d && this.status(id) !== 'ok' ? d.text : ''
  }

  setSlider(id: SliderId, value: number): string | null {
    if (this.phase !== 'g1-setup' && this.phase !== 'g1-test') return 'The test is over: the controls are locked.'
    const s = slider(id)
    this.settings[id] = clamp(Math.round(value / s.step) * s.step, s.min, s.max)
    return null
  }

  startTest(): string | null {
    if (this.phase !== 'g1-setup') return 'The test has already been run.'
    const open = STEPS.find(s => !this.stepOk(s.n))
    if (open) return `Finish step ${open.n} first: ${open.label.toLowerCase()}. Move each control into its green zone.`
    const drifts: Drift[] = []
    if (this.events) {
      const pool = [...DRIFTS]
      for (const from of [1.5, 5]) {
        const d = pool.splice(Math.floor(this.rng() * pool.length), 1)[0]
        drifts.push({ ...d, at: from + this.rng() * 1.5 })
      }
    }
    this.test = { t: 0, health: 100, minHealth: 100, overdraw: 0, drifts, harm: Object.fromEntries(SLIDER_IDS.map(id => [id, 0])) as Record<SliderId, number> }
    this.phase = 'g1-test'
    return null
  }

  get testDay(): number { return this.test ? clamp(Math.floor(this.test.t / GH.testSeconds * GH.testDays + EPS) + 1, 1, GH.testDays) : 0 }

  private stepTest(dt: number): void {
    const x = this.test!
    x.t += dt
    for (const d of x.drifts) if (x.t >= d.at) this.offsets[d.slider] = d.delta * clamp((x.t - d.at) / DRIFT_RAMP, 0, 1)
    const out = SLIDER_IDS.filter(id => this.status(id) !== 'ok')
    for (const id of out) x.harm[id] += dt
    x.health = out.length ? Math.max(0, x.health - GH.harmPerSecond * out.length * dt) : Math.min(100, x.health + GH.healPerSecond * dt)
    x.minHealth = Math.min(x.minHealth, x.health)
    if (this.overBudget) x.overdraw += dt
    if (x.health < GH.healthLine - EPS) this.endTest('health')
    else if (x.overdraw >= GH.overdrawSeconds - EPS) this.endTest('power')
    else if (x.t >= GH.testSeconds - EPS) this.endTest(null)
  }

  private endTest(cause: 'health' | 'power' | null): void {
    const x = this.test!, day = this.testDay
    let reason = `Plant health stayed above ${GH.healthLine}% for all ${GH.testDays} days and the power stayed inside the budget.`
    if (cause === 'health') {
      const worst = SLIDER_IDS.reduce((a, b) => (x.harm[b] > x.harm[a] ? b : a))
      const s = slider(worst)
      reason = `Plant health fell below ${GH.healthLine}% on day ${day}. Main cause: ${this.reading(worst) < s.good[0] ? s.low : s.high}.`
    } else if (cause === 'power') reason = `Power overdraw: the greenhouse drew more than its ${GH.powerBudgetKw} kW budget for too long, and the breaker tripped on day ${day}.`
    this.testResult = { won: !cause, day, health: x.health, minHealth: x.minHealth, cause, reason }
    this.phase = 'g1-result'
    this.notices.push({ text: `Greenhouse test ${cause ? 'failed' : 'passed'}. ${reason}`, kind: cause ? 'bad' : 'ok' })
  }

  // ---------------------------------------------------------------- G2
  /** Adds a crop to the three picked, or takes it out again (its bays are cleared). */
  togglePick(id: CropId): string | null {
    if (this.phase !== 'g2-plan') return 'Crops are picked before the run starts.'
    if (this.picks.includes(id)) {
      this.picks = this.picks.filter(p => p !== id)
      for (const b of BAY_IDS) if (this.plan[b] === id) this.plan[b] = null
      return null
    }
    if (this.picks.length >= GH.picks) return `You can pick ${GH.picks} crops. Take one out first.`
    this.picks = CROPS.map(c => c.id).filter(c => c === id || this.picks.includes(c))
    return null
  }

  /** Plants a bay with one of the picked crops, or empties it. */
  assign(bay: BayId, id: CropId | null): string | null {
    if (this.phase !== 'g2-plan') return 'Bays are planted before the run starts.'
    if (id && !this.picks.includes(id)) return 'Pick that crop in the table first.'
    this.plan[bay] = id
    return null
  }

  /** The next choice for a bay when it is clicked: empty, then each picked crop in turn. */
  cycle(bay: BayId): string | null {
    if (!this.picks.length) return `Pick ${GH.picks} crops in the table first.`
    const i = this.plan[bay] ? this.picks.indexOf(this.plan[bay]!) : -1
    return this.assign(bay, i + 1 < this.picks.length ? this.picks[i + 1] : null)
  }

  get planted(): number { return BAY_IDS.filter(b => this.plan[b]).length }
  /** What the plan would give with perfect harvests and no pump failure. */
  forecast(): Forecast { return forecast(this.plan, this.tankStartL) }

  startRun(): string | null {
    if (this.phase !== 'g2-plan') return 'The run has already started.'
    if (this.picks.length < GH.picks) return `Pick ${GH.picks} crops first.`
    if (!this.planted) return 'Plant at least one bay first.'
    const [from, to] = GH.pumpWindow
    const at = this.pumpAt !== undefined ? this.pumpAt : this.events && this.rng() < GH.pumpChance ? from + this.rng() * (to - from) : null
    this.run = newRun(this.plan, this.tankStartL, at)
    this.phase = 'g2-run'
    return null
  }

  get runDay(): number { return this.run ? runDay(this.run) : 0 }
  get readyBays(): number { return this.run ? this.run.bays.filter(b => b.ready).length : 0 }
  get pumpPending(): boolean { return this.run?.pump.state === 'pending' }

  /** One button: brings in every ready bay. */
  harvestAll(): string | null {
    if (this.phase !== 'g2-run' || !this.run) return 'There is no run under way.'
    if (this.pumpPending) return 'The pumps have failed. Choose which side to save first.'
    return collect(this.run) ? null : 'Nothing is ready yet.'
  }

  /** The pump-failure choice: the one spare part goes to side A or side B. */
  choosePump(side: LoopId): string | null {
    if (!this.pumpPending) return 'No pump is waiting for a spare part.'
    fitSpare(this.run!, side)
    return null
  }

  private stepFeeding(dt: number): void {
    const r = this.run!
    const was = r.pump.state
    stepRun(r, dt)
    if (was === 'none' && r.pump.state === 'pending') this.notices.push({ text: 'Greenhouse alert: pump failure. Choose which side to save at Greenhouse Control or the Service Bay.', kind: 'bad' })
    if (r.over) this.endRun()
  }

  private endRun(): void {
    const r = this.run!, o = r.over!, day = o.cause === 'water' ? runDay(r) : GH.runDays, fed = fedDays(r.kcalHarvested)
    const reason = o.cause === 'water' ? `The water tank ran dry on day ${day}.`
      : o.cause === 'food' ? `The harvest came up short: it feeds the crew for ${fed} of the ${GH.runDays} days.`
      : `The crew was fed for all ${GH.runDays} days and the tank still holds ${Math.round(r.waterL)} L.`
    this.runResult = { won: o.won, day, cause: o.cause, reason, kcalHarvested: r.kcalHarvested, fedDays: fed, waterL: r.waterL, tankL: r.tankL, harvests: r.harvests, pump: r.pump.saved }
    this.phase = 'g2-result'
    this.notices.push({ text: `Greenhouse feeding run ${o.won ? 'won' : 'failed'}. ${reason}`, kind: o.won ? 'ok' : 'bad' })
  }

  // ---------------------------------------------------------------- what the deck draws
  /** Each bay as the deck shows it: the test trays during G1, the plan as seed plugs, then the run. */
  bayViews(): { id: BayId; crop: CropId | null; stage: Stage; progress: number; ready: boolean; slow: boolean; symptom: Symptom }[] {
    const r = this.run
    return BAY_IDS.map(id => {
      if (r) {
        const b = r.bays.find(x => x.id === id)!
        const stage = b.crop ? (b.ready ? 'ready' : b.harvests && b.progress < 0.42 ? 'postharvest' : stageAt(crop(b.crop), b.progress)) : 'seed'
        // once the run is over the bays keep their last crops, with nothing left to do at them
        return { id, crop: b.crop, stage, progress: b.progress, ready: b.ready && !r.over, slow: b.speed < 1 && !r.over, symptom: 'none' as Symptom }
      }
      if (this.phase === 'g2-plan' || this.phase === 'g2-brief') return { id, crop: this.plan[id], stage: 'seed' as Stage, progress: 0, ready: false, slow: false, symptom: 'none' as Symptom }
      // G1: lettuce test trays on the two leaf racks of side A
      if (id !== 'A1' && id !== 'A2') return { id, crop: null, stage: 'seed' as Stage, progress: 0, ready: false, slow: false, symptom: 'none' as Symptom }
      const p = this.test ? clamp(this.test.t / GH.testSeconds, 0, 1) : 0
      const symptom: Symptom = this.health < GH.healthLine ? 'wilt' : this.health < 90 ? 'yellow' : 'none'
      return { id, crop: 'lettuce' as CropId, stage: (p < 0.5 ? 'seedling' : 'vegetative') as Stage, progress: p, ready: false, slow: false, symptom }
    })
  }

  // ---------------------------------------------------------------- score
  score(): Score {
    const P = GH.points, t = this.testResult, r = this.runResult
    const g1 = t?.won ? Math.round(P.g1 * (0.6 + 0.4 * clamp((t.minHealth - GH.healthLine) / (100 - GH.healthLine), 0, 1))) : 0
    // a win is worth 60 % of the points; the rest is for food beyond the need (full at +30 %) and water left (full at 20 % of the tank)
    const g2 = r?.won ? Math.round(P.g2 * (0.6 + 0.2 * clamp((r.kcalHarvested - NEED_KCAL) / (0.3 * NEED_KCAL), 0, 1) + 0.2 * clamp(r.waterL / (0.2 * r.tankL), 0, 1))) : 0
    const pump = r && (!r.pump || r.won) ? P.pump : 0
    const parts: ScorePart[] = [
      { id: 'g1', label: 'Grow Light (G1)', points: g1, max: P.g1, why: !t ? 'Not played yet.' : t.won ? `Passed. Lowest plant health ${Math.round(t.minHealth)}%.` : `Failed: no points. ${t.reason}` },
      { id: 'g2', label: 'What to Grow (G2)', points: g2, max: P.g2, why: !r ? 'Not played yet.' : r.won ? `Crew fed for ${GH.runDays} days: ${Math.round(r.kcalHarvested).toLocaleString('en-US')} kcal harvested, ${Math.round(r.waterL)} L of water left.` : `Failed: no points. ${r.reason}` },
      { id: 'pump', label: 'Pump failure', points: pump, max: P.pump, why: !r ? 'Not played yet.' : !r.pump ? 'No pump failed in this run.' : r.won ? `Side ${r.pump} was saved and the crew was still fed.` : `Side ${r.pump} was saved, but the crew was not fed.` },
    ]
    return { total: g1 + g2 + pump, parts }
  }
}

export type { CropId, Stage }
