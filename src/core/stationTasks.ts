// The station tasks from the team's mission spec (TasksList.pdf, section 2), and the signal
// tuning that repairs the relay. Pure rules: no DOM, no Phaser and no clock of their own. Whoever
// shows a task hands it the seconds that have passed.
//
//   S1  Square Peg, Round Hole   an alert    'scrubber'
//   S2  Water Recycling Loop     a mission   'water'
//   S3  Power Rationing          an alert    'rationing'
//   S4  Fire or Leak Response    an alert    'cabin'
//   S5  Crew Schedule            a mission   'schedule'
//
// REAL (src/data/stationTasks.ts): the events each task is modelled on, the station's water
// recovery of 93 to 94% without its brine processor and 98% with it, and two hours of exercise a
// day. Everything else in this file is OUR MODEL: the parts, the timers, the power draws, the
// readings, the crew performance figure and the points.

export type Rng = () => number
/** A copy of a list in a random order. */
function shuffled<T>(rng: Rng, list: readonly T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// ---------------------------------------------------------------- Alerts
export type AlertId = 'scrubber' | 'rationing' | 'cabin'
export const ALERT_IDS: AlertId[] = ['scrubber', 'rationing', 'cabin']
/** How many of the station's required steps are done when the first and the second alert of a run go off. */
export const ALERT_AFTER = [1, 4]
/** One or two of the three alerts for this run, in the order they will go off. */
export function planAlerts(rng: Rng): AlertId[] {
  const order = shuffled(rng, ALERT_IDS)
  return order.slice(0, rng() < 0.5 ? 1 : 2)
}
/** The most an alert adds to the mission score. */
export const ALERT_POINTS = 80
/** Points for an alert dealt with: half for doing it, half for how much was left (time or battery), 0 to 1. */
export const alertPoints = (left: number) => Math.round(ALERT_POINTS / 2 + (ALERT_POINTS / 2) * clamp(left, 0, 1))
/** Crew health lost, in points of 100, when an alert is not dealt with. */
export const HEALTH_COST: Record<AlertId, number> = { scrubber: 25, rationing: 20, cabin: 25 }

// ---------------------------------------------------------------- S5 Crew schedule
// A day in twelve two-hour blocks. REAL: about two hours of exercise a day. The other needs are ours.
export type Activity = 'sleep' | 'work' | 'exercise' | 'rest'
export const BLOCK_HOURS = 2
export const DAY_BLOCKS = 12
export const ACTIVITIES: { id: Activity; name: string; clue: string }[] = [
  { id: 'sleep', name: 'Sleep', clue: 'A tired crew makes mistakes' },
  { id: 'work', name: 'Work', clue: 'Station upkeep and science' },
  { id: 'exercise', name: 'Exercise', clue: 'Keeps bones and muscles from wasting' },
  { id: 'rest', name: 'Meals and rest', clue: 'Food, washing, time off' },
]
export const SLEEP_NEED_H = 8
/** REAL: "Crews exercise for an average of two hours a day." */
export const EXERCISE_NEED_H = 2
export const REST_NEED_H = 4
/** The least work that keeps the station running, and the most a crew does without tiring. */
export const WORK_NEED_H = 6
export const WORK_FAIR_H = 8
export const SCHEDULE_TARGET = 75
/** The plan the crew arrives with: far too much work, too little sleep, no exercise. */
export const SCHEDULE_START: Activity[] = ['sleep', 'sleep', 'sleep', 'work', 'work', 'work', 'work', 'rest', 'work', 'work', 'work', 'work']

export interface DayResult {
  hours: Record<Activity, number>
  /** Crew performance, 0 to 100. */
  performance: number
  /** What is pulling performance down, in the order of the activities. */
  costs: { activity: Activity; lost: number; why: string }[]
}
export function crewDay(day: readonly Activity[]): DayResult {
  const hours: Record<Activity, number> = { sleep: 0, work: 0, exercise: 0, rest: 0 }
  for (const a of day) hours[a] += BLOCK_HOURS
  const costs: DayResult['costs'] = []
  const short = (a: Activity, need: number, each: number, why: string) => {
    if (hours[a] < need) costs.push({ activity: a, lost: (need - hours[a]) * each, why })
  }
  short('sleep', SLEEP_NEED_H, 8, `${hours.sleep} h of sleep, ${SLEEP_NEED_H} h needed`)
  short('exercise', EXERCISE_NEED_H, 10, 'No exercise: muscles and bones weaken')
  short('rest', REST_NEED_H, 5, `${hours.rest} h for meals and rest, ${REST_NEED_H} h needed`)
  if (hours.work > WORK_FAIR_H) costs.push({ activity: 'work', lost: (hours.work - WORK_FAIR_H) * 6, why: `${hours.work} h of work: more than ${WORK_FAIR_H} h tires the crew` })
  return { hours, performance: clamp(100 - costs.reduce((n, c) => n + c.lost, 0), 0, 100), costs }
}
/** Why a day cannot be handed to the crew, or null. */
export function scheduleBlock(day: readonly Activity[]): string | null {
  if (day.length !== DAY_BLOCKS) return `Plan all ${DAY_BLOCKS} blocks of the day.`
  const { hours } = crewDay(day)
  if (hours.work < WORK_NEED_H) return `The station needs at least ${WORK_NEED_H} hours of work a day.`
  if (hours.sleep < BLOCK_HOURS) return 'Nobody can go a whole day without sleep.'
  return null
}
export const SCHEDULE_POINTS = 60
/** Points for a day: 40 for meeting the target, and 5 for each hour of work past the least, up to 20. */
export function schedulePoints(day: readonly Activity[]): number {
  const r = crewDay(day)
  if (r.performance < SCHEDULE_TARGET) return 10
  return 40 + Math.min(20, (r.hours.work - WORK_NEED_H) * 5)
}
/** How the crew's performance stretches or cuts the time an alert allows. With no plan yet, the time is unchanged. */
export function alertTimeFactor(performance: number | null): number {
  if (performance === null) return 1
  return performance >= 90 ? 1.15 : performance >= SCHEDULE_TARGET ? 1 : 0.75
}

// ---------------------------------------------------------------- S2 Water recycling loop
export const LOOP_PARTS = [
  { id: 'distiller', name: 'Urine distiller', clue: 'Boils urine at low pressure and keeps the vapour. It takes the raw waste.' },
  { id: 'filters', name: 'Filter beds', clue: 'Trap particles and salts. Raw urine would clog them at once.' },
  { id: 'reactor', name: 'Catalytic reactor', clue: 'Heat and oxygen destroy what the filters let through.' },
  { id: 'tank', name: 'Water tank', clue: 'Stores only water that has passed every stage.' },
] as const
export const LOOP_ORDER = ['distiller', 'filters', 'reactor', 'tank']
/** The order the parts are offered in. */
export const LOOP_POOL = ['reactor', 'tank', 'distiller', 'filters']
export function loopCheck(order: readonly string[]): { ok: boolean; message: string } {
  if (order.length < LOOP_ORDER.length) return { ok: false, message: 'Connect all four parts between the waste line and the tap.' }
  if (order[0] !== 'distiller') return { ok: false, message: 'Raw urine reaches a part that cannot take it. What handles the raw waste?' }
  if (order[3] !== 'tank') return { ok: false, message: 'The tank must come last: it stores only finished water.' }
  if (order[1] !== 'filters') return { ok: false, message: 'The reactor needs clear water: particles and salts have to come out before it.' }
  return { ok: true, message: 'Loop connected: distiller, filter beds, catalytic reactor, tank.' }
}
/** REAL: the station's water recovery before its brine processor ("between 93 and 94%") and with it. */
export const WATER_BASE_PCT = 93
export const WATER_BRINE_PCT = 98
export const WATER_TARGET = 90
/** Credits a fresh filter bed costs. */
export const FILTER_COST = 3
/** Recovery lost to a clogged filter bed, in points. */
export const CLOG_LOSS = 8
/** Life support units the brine processor needs: 40% of the station's power. */
export const BRINE_LIFE_UNITS = 4
/** Water recovered, per cent. `fresh`: the filter bed was changed. `brine`: the brine processor has power. */
export const waterRecovery = (fresh: boolean, brine: boolean) => (brine ? WATER_BRINE_PCT : WATER_BASE_PCT) - (fresh ? 0 : CLOG_LOSS)
/** A clogged filter bed lets contaminants through: the water is not safe to drink. */
export const waterSafe = (fresh: boolean) => fresh
export const waterWon = (fresh: boolean, brine: boolean) => waterSafe(fresh) && waterRecovery(fresh, brine) >= WATER_TARGET
export const WATER_POINTS = 60
export const waterPoints = (fresh: boolean, brine: boolean) => !waterWon(fresh, brine) ? 10 : waterRecovery(fresh, brine) >= WATER_BRINE_PCT ? WATER_POINTS : 45
/** What the loop adds to the base score: less water to haul from Earth. */
export const waterBonus = (fresh: boolean, brine: boolean) => !waterWon(fresh, brine) ? 0 : waterRecovery(fresh, brine) >= WATER_BRINE_PCT ? 8 : 5

// ---------------------------------------------------------------- S1 Square peg, round hole
export type AdapterRole = 'enclose' | 'brace' | 'reach' | 'seal'
export const ADAPTER_ROLES: { id: AdapterRole; name: string; need: string }[] = [
  { id: 'enclose', name: 'Wrap the square canister', need: 'Airtight and flexible, so all the air goes through the canister' },
  { id: 'brace', name: 'Hold the airway open', need: 'Stiff, so suction cannot pull the wrap flat' },
  { id: 'reach', name: 'Reach the round socket', need: 'A round end that fits the socket, on something that bends' },
  { id: 'seal', name: 'Seal every joint', need: 'Sticks to anything and lets no air past' },
]
export interface CargoPart {
  id: string
  name: string
  shape: string
  size: string
  material: string
  /** The one job this part can do, or null for a part that can do none. */
  fits: AdapterRole | null
  /** What goes wrong when it is used for the job it looks right for. */
  fault: string
}
/** Two parts look right for each job: one works. */
export const ADAPTER_PARTS: CargoPart[] = [
  { id: 'bag', name: 'Plastic bag', shape: 'Any shape', size: 'Bigger than the canister', material: 'Airtight film', fits: 'enclose', fault: '' },
  { id: 'towel', name: 'Cloth towel', shape: 'Any shape', size: 'Bigger than the canister', material: 'Woven cloth', fits: null, fault: 'Air leaks through the weave and goes around the canister.' },
  { id: 'card', name: 'Cardboard cover', shape: 'Flat sheet', size: 'One side of the canister', material: 'Stiff card', fits: 'brace', fault: '' },
  { id: 'foil', name: 'Foil sheet', shape: 'Flat sheet', size: 'One side of the canister', material: 'Thin foil', fits: null, fault: 'The foil crumples and the wrap is sucked flat against the canister.' },
  { id: 'hose', name: 'Suit hose', shape: 'Round end', size: 'Fits the socket', material: 'Bends, airtight', fits: 'reach', fault: '' },
  { id: 'pipe', name: 'Metal pipe', shape: 'Round end', size: 'Wider than the socket', material: 'Rigid metal', fits: null, fault: 'The pipe is wider than the socket and cannot bend to reach it.' },
  { id: 'tape', name: 'Duct tape', shape: 'Strip', size: 'As long as needed', material: 'Sticky, airtight', fits: 'seal', fault: '' },
  { id: 'cord', name: 'Elastic cord', shape: 'Strip', size: 'As long as needed', material: 'Stretchy cord', fits: null, fault: 'The cord holds the parts together, but air leaks at every joint.' },
]
export const adapterPart = (id: string) => ADAPTER_PARTS.find(p => p.id === id)
/** The parts as they come out of the cargo bags: a different order each time. */
export const adapterInventory = (rng: Rng) => shuffled(rng, ADAPTER_PARTS).map(p => p.id)
export type AdapterPicks = Partial<Record<AdapterRole, string>>
/** What is wrong with the adapter as built, one line for each job that fails. Empty when it works. */
export function adapterFaults(picks: AdapterPicks): { role: AdapterRole; text: string }[] {
  const out: { role: AdapterRole; text: string }[] = []
  for (const r of ADAPTER_ROLES) {
    const part = picks[r.id] ? adapterPart(picks[r.id]!) : undefined
    if (!part) out.push({ role: r.id, text: `Nothing chosen to ${r.name.toLowerCase()}.` })
    else if (part.fits !== r.id) out.push({ role: r.id, text: part.fault || `${part.name} cannot ${r.name.toLowerCase()}.` })
  }
  return out
}
/** Seconds to fit the adapter before the air goes bad, and what a failed fitting costs. */
export const SCRUBBER_SECONDS = 90
export const SCRUBBER_PENALTY_S = 8
/** Where the CO2 gauge starts, in per cent of the limit. It reaches 100 when the time is up. */
export const CO2_START_PCT = 40
export const co2Pct = (usedS: number, limitS: number) => Math.round(clamp(CO2_START_PCT + (100 - CO2_START_PCT) * (usedS / limitS), 0, 100))

// ---------------------------------------------------------------- S3 Power rationing
export type Rating = 'critical' | 'needed' | 'useful' | 'spare'
export interface PowerSystem {
  id: string
  name: string
  /** Battery it uses each hour, in per cent of a full battery. */
  draw: number
  rating: Rating
  note: string
  /** Systems that must be running before this one is restarted. */
  needs: string[]
  /** Restarted after everything else that is coming back. */
  last?: boolean
  /** How the restart rule reads on screen. */
  rule: string
}
export const RATION_SYSTEMS: PowerSystem[] = [
  { id: 'bus', name: 'Power bus', draw: 2, rating: 'critical', note: 'Feeds every other system', needs: [], rule: '' },
  { id: 'air', name: 'Air and CO2 scrubber', draw: 5, rating: 'critical', note: 'The crew has minutes without it', needs: ['bus'], rule: '' },
  { id: 'heater', name: 'Cabin heater', draw: 6, rating: 'needed', note: 'Without it the cabin freezes', needs: ['bus'], rule: '' },
  { id: 'comms', name: 'Communications', draw: 3, rating: 'useful', note: 'Mission control reads the restart steps to the crew', needs: ['bus'], rule: 'Any time' },
  { id: 'nav', name: 'Navigation', draw: 3, rating: 'useful', note: 'Keeps the arrays facing the Sun: the blackout ends an hour sooner', needs: ['comms'], rule: 'After communications' },
  { id: 'lights', name: 'Cabin lights', draw: 2, rating: 'spare', note: 'The crew can work by torch', needs: ['bus'], rule: 'Any time' },
  { id: 'lab', name: 'Research racks', draw: 6, rating: 'spare', note: 'Experiments can wait', needs: ['lights'], rule: 'After the lights' },
  { id: 'greenhouse', name: 'Greenhouse lamps', draw: 8, rating: 'spare', note: 'Plants survive a few hours of dark', needs: [], last: true, rule: 'Last of all: the biggest load' },
]
export const rationSystem = (id: string) => RATION_SYSTEMS.find(s => s.id === id)!
/** Hours until the array is repaired: one more when navigation is off and the arrays drift off the Sun. */
export const BLACKOUT_HOURS = 4
export const DRIFT_HOURS = 1
/** The battery that has to be left when the array comes back, per cent. */
export const BATTERY_FLOOR = 5
/** Battery a wrong restart step costs: a breaker trips. */
export const RESTART_PENALTY = 3
/** Why a system cannot be switched off, or null. */
export const shedBlock = (id: string): string | null => rationSystem(id).rating === 'critical' ? `${rationSystem(id).name} cannot be switched off.` : null
export interface Blackout { hours: number; drawPerHour: number; used: number; left: number; frozen: boolean }
/** What the blackout does with these systems switched off. */
export function blackout(off: readonly string[]): Blackout {
  const drawPerHour = RATION_SYSTEMS.filter(s => !off.includes(s.id)).reduce((n, s) => n + s.draw, 0)
  const hours = BLACKOUT_HOURS + (off.includes('nav') ? DRIFT_HOURS : 0)
  const used = drawPerHour * hours
  return { hours, drawPerHour, used, left: Math.max(0, 100 - used), frozen: off.includes('heater') }
}
/** Why a system cannot be restarted yet, or null. `up`: what is running. `waiting`: what is still to restart. */
export function restartBlock(id: string, up: readonly string[], waiting: readonly string[]): string | null {
  const s = rationSystem(id)
  const missing = s.needs.find(n => !up.includes(n))
  if (missing) return `${s.name} tripped its breaker: ${rationSystem(missing).name.toLowerCase()} must be running first.`
  if (s.last && waiting.some(w => w !== id)) return `${s.name} tripped its breaker: the biggest load goes last.`
  return null
}
/** One order that restarts everything that was switched off. */
export function restartOrder(off: readonly string[]): string[] {
  const up = RATION_SYSTEMS.map(s => s.id).filter(id => !off.includes(id))
  const waiting = RATION_SYSTEMS.map(s => s.id).filter(id => off.includes(id))
  const order: string[] = []
  while (waiting.length) {
    const next = waiting.find(id => !restartBlock(id, up, waiting))
    if (!next) break
    order.push(next)
    up.push(next)
    waiting.splice(waiting.indexOf(next), 1)
  }
  return order
}
export interface RationResult { left: number; won: boolean; why: string }
/** How the power-down ended: the battery after the blackout and the restart mistakes. */
export function rationResult(off: readonly string[], mistakes: number): RationResult {
  const b = blackout(off)
  const left = Math.max(0, b.left - mistakes * RESTART_PENALTY)
  if (b.frozen) return { left, won: false, why: 'With the heater off the cabin froze before the array came back.' }
  if (b.left <= 0) return { left: 0, won: false, why: `The battery ran flat after ${Math.floor(100 / b.drawPerHour * 10) / 10} hours, before the array came back.` }
  if (left < BATTERY_FLOOR) return { left, won: false, why: `Only ${left}% was left: under the ${BATTERY_FLOOR}% the station needs in reserve.` }
  return { left, won: true, why: `${left}% of the battery was left when the array came back.` }
}
/** Points: half for getting through, half for the battery kept (30% or more counts as full). */
export const rationPoints = (r: RationResult) => r.won ? alertPoints(r.left / 30) : 0

// ---------------------------------------------------------------- S4 Fire or leak response
export type CabinModule = 'cupola' | 'node3' | 'node1' | 'lab' | 'node2' | 'dock' | 'greenhouse' | 'comms'
/** The station's modules and the hatches between them. test/station.test.ts checks this against the deck. */
export const CABIN_MODULES: { id: CabinModule; name: string }[] = [
  { id: 'cupola', name: 'Cupola' }, { id: 'node3', name: 'Node 3' }, { id: 'node1', name: 'Node 1' }, { id: 'lab', name: 'US Lab' },
  { id: 'node2', name: 'Node 2' }, { id: 'dock', name: 'Docking Port' }, { id: 'greenhouse', name: 'Greenhouse' }, { id: 'comms', name: 'Comms Module' },
]
export const CABIN_LINKS: { id: string; a: CabinModule; b: CabinModule }[] = [
  { id: 'cupola', a: 'cupola', b: 'node3' }, { id: 'n3-n1', a: 'node3', b: 'node1' }, { id: 'n1-lab', a: 'node1', b: 'lab' }, { id: 'lab-n2', a: 'lab', b: 'node2' },
  { id: 'dock', a: 'dock', b: 'node2' }, { id: 'greenhouse', a: 'node1', b: 'greenhouse' }, { id: 'comms', a: 'node2', b: 'comms' },
]
export const cabinName = (id: CabinModule) => CABIN_MODULES.find(m => m.id === id)!.name
/** The hatches of a module. */
export const hatchesOf = (m: CabinModule) => CABIN_LINKS.filter(l => l.a === m || l.b === m).map(l => l.id)
const neighbours = (m: CabinModule) => CABIN_LINKS.filter(l => l.a === m || l.b === m).map(l => (l.a === m ? l.b : l.a))
/** Where the crew gathers: the module with the ship home. It is never where the trouble starts. */
export const MUSTER: CabinModule = 'dock'
/** The modules an emergency can start in. Not the docking port, and not Node 2, the only way to it. */
export const CABIN_SOURCES: CabinModule[] = ['cupola', 'node3', 'node1', 'lab', 'greenhouse', 'comms']
export type Hazard = 'fire' | 'leak'
/** Smoke in per cent of the alarm level, and cabin pressure in kilopascals. */
export interface Reading { smoke: number; pressure: number }
export const NORMAL_KPA = 101
export interface CabinAlarm { hazard: Hazard; source: CabinModule; readings: Record<CabinModule, Reading> }
/** A fire or a leak in one module. Its neighbours read a little off too, so the worst reading has to be found. */
export function newCabinAlarm(rng: Rng): CabinAlarm {
  const hazard: Hazard = rng() < 0.5 ? 'fire' : 'leak'
  const source = CABIN_SOURCES[Math.min(CABIN_SOURCES.length - 1, Math.floor(rng() * CABIN_SOURCES.length))]
  const near = neighbours(source)
  const readings = {} as Record<CabinModule, Reading>
  for (const m of CABIN_MODULES) {
    const here = m.id === source, beside = near.includes(m.id)
    const jitter = rng()
    readings[m.id] = hazard === 'fire'
      ? { smoke: here ? 82 + Math.round(jitter * 14) : beside ? 24 + Math.round(jitter * 18) : Math.round(jitter * 3), pressure: NORMAL_KPA }
      : { smoke: 0, pressure: here ? 84 + Math.round(jitter * 5) : beside ? 97 + Math.round(jitter * 2) : NORMAL_KPA }
  }
  return { hazard, source, readings }
}
export const SHUTDOWNS: { id: string; name: string; clue: string; stops: Hazard | null }[] = [
  { id: 'power', name: 'Power and fans', clue: 'Moving air feeds a fire, and live equipment can relight it', stops: 'fire' },
  { id: 'air', name: 'Air supply valve', clue: 'Stops the station pumping its air out through the hole', stops: 'leak' },
  { id: 'water', name: 'Water loop pump', clue: 'Moves cooling water between modules', stops: null },
]
export type CabinStep = 'identify' | 'seal' | 'shutdown' | 'muster'
export const CABIN_STEPS: CabinStep[] = ['identify', 'seal', 'shutdown', 'muster']
/** Seconds to contain the emergency, and what a wrong move at each step wastes. */
export const CABIN_SECONDS = 30
export const CABIN_PENALTY_S: Record<CabinStep, number> = { identify: 5, seal: 3, shutdown: 4, muster: 4 }
/** Whether a move at one step is right. For `seal`, `choice` is one hatch; the step is done when every hatch of the module is closed. */
export function cabinMove(a: CabinAlarm, step: CabinStep, choice: string): { ok: boolean; text: string } {
  if (step === 'identify') return choice === a.source
    ? { ok: true, text: `${cabinName(a.source)} is the source.` }
    : { ok: false, text: `${cabinName(choice as CabinModule)} reads better than another module. Find the worst reading.` }
  if (step === 'seal') return hatchesOf(a.source).includes(choice)
    ? { ok: true, text: 'Hatch closed.' }
    : { ok: false, text: `That hatch does not open onto ${cabinName(a.source)}.` }
  if (step === 'shutdown') {
    const s = SHUTDOWNS.find(x => x.id === choice)
    return s?.stops === a.hazard ? { ok: true, text: `${s.name} shut down.` } : { ok: false, text: `${s?.name ?? 'That'} does not stop a ${a.hazard}.` }
  }
  return choice === MUSTER ? { ok: true, text: 'The crew is at the ship home.' } : { ok: false, text: 'Not there: the crew gathers where the ship home is docked.' }
}

// ---------------------------------------------------------------- Relay repair: tuning the signal
// The receiver has drifted off the carrier. The dial is turned until the noise is gone; the
// carrier then drifts again, by a different amount each time, two to four times before it holds.
export const DIAL_MAX = 100
export const DIAL_START = 50
export const RELAY_MIN_ROUNDS = 2
export const RELAY_MAX_ROUNDS = 4
/** Dial steps either side of the carrier that count as on it. */
export const RELAY_TOLERANCE = 3
/** Seconds the dial has to stay on the carrier for the lock to take. */
export const RELAY_HOLD_S = 1
/** Where the carrier sits in each round of one repair. */
export interface RelayTuning { targets: number[] }
/** A new repair: two to four drifts, each a different number of steps from where the dial was left. */
export function newRelayTuning(rng: Rng): RelayTuning {
  const rounds = RELAY_MIN_ROUNDS + Math.min(RELAY_MAX_ROUNDS - RELAY_MIN_ROUNDS, Math.floor(rng() * (RELAY_MAX_ROUNDS - RELAY_MIN_ROUNDS + 1)))
  const targets: number[] = [], used: number[] = []
  let at = DIAL_START
  for (let i = 0; i < rounds; i++) {
    let amount = 12 + Math.round(rng() * 33)
    while (used.includes(amount)) amount += 3
    used.push(amount)
    let dir = rng() < 0.5 ? -1 : 1
    if (at + dir * amount < 6 || at + dir * amount > DIAL_MAX - 6) dir = -dir
    at = clamp(at + dir * amount, 6, DIAL_MAX - 6)
    targets.push(at)
  }
  return { targets }
}
/** How much of the signal is noise with the dial here: 0 clean, 1 nothing but noise. */
export const relayNoise = (dial: number, target: number) => clamp(Math.abs(dial - target) / 40, 0, 1)
export const relayOnCarrier = (dial: number, target: number) => Math.abs(dial - target) <= RELAY_TOLERANCE
/** Signal quality in per cent, as the screen shows it. */
export const relayQuality = (dial: number, target: number) => Math.round((1 - relayNoise(dial, target)) * 100)
