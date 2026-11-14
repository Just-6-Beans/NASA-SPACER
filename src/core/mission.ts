// Mission state and rules. Plain TypeScript: runs in Node tests, the browser, and shares
// validation with the co-op server.
import { OPS_DATES, opsDate, type OpsDate } from '../data/opsDates'
import { CARGO_REWARD, INSTRUMENTS, SHIPS, byId, type CargoId, type InstrumentId, type ShipId, type SuitId } from './data'
import { cargoKg, cargoValue, cleanLoadout, designCost, type LaunchRecord, type Loadout } from './loadout'
import { DEFAULT_POWER, LIFE_NEED, powerBlock, researchFilter, signalLeg, validPower, type Power } from './power'
import { ROVERS, type RoverId, type RoverSpec } from './rovers'
import {
  MAX_BASE_TILT, MAX_WAYPOINTS, MISSION_SOLS, REGIONS, SOL_HOURS, TESTS, dist, driveWhPerM, groundAt, inMap, photoBonus, placesInRange,
  rechargeHours, rechargeW, region, reserveWh, simulateDrive, siteScore, spotBars, starsFor, testWh, verdict,
  type Bar, type DriveResult, type Ground, type Pt, type RegionId, type TestId, type Verdict,
} from './survey'
import type { TaskId } from './tasks'

export interface Profile {
  callSign: string
  suit: SuitId
  ship: ShipId
  /** The station cargo loaded on the launch. Without one (the tests, an old save) the station starts with none. */
  loadout?: Loadout
  /** How the launch went, for the report. */
  launch?: LaunchRecord
}

export const cleanCallSign = (raw: string) => {
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, 20).trim()
  return s || 'Pilot'
}

export interface LogEntry { at: string; text: string; kind: 'task' | 'mission' | 'rover' | 'alert' | 'landing' }

/** A place the rover stopped: where it is, which tests it ran there, and how much battery it arrived with. */
export interface Spot { id: number; label: string; p: Pt; tests: TestId[]; arrivedWh: number; stranded: boolean }
/** A spot judged as a base site. */
export interface SpotReport { spot: Spot; name: string; ground: Ground; bars: Bar[]; score: number; verdict: Verdict; stars: number }
export interface BaseOutcome { id: number | 'defer'; approved: boolean; name: string; score: number; stars: number; level: Verdict['level']; reason: string; bars: Bar[] }

/** MODEL: the station water purifier adds this to the base score (less water to haul from Earth). */
export const WATER_BONUS = 5
/** MODEL: how fast Mars time runs while the rover recharges. One Mars hour passes each real second. */
export const CHARGE_MS_PER_HOUR = 1000
/** A recharge under way: where it started, where it will end, and how many Mars hours it takes. */
export interface Charging { startedAt: number; fromWh: number; toWh: number; fromHours: number; hours: number }
/** Where a recharge stands at one moment of real time. */
export interface ChargeProgress { fraction: number; wh: number; hoursDone: number; hoursLeft: number; msLeft: number }
const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const TASK_INFO: Record<TaskId, { name: string; group: 'Routine' | 'Mission' | 'Emergency'; where: string; reward: string }> = {
  battery: { name: 'Battery balancing', group: 'Routine', where: 'Power Grid', reward: 'Rover driving draws 30 W less' },
  cargo: { name: 'Cargo reconciliation', group: 'Routine', where: 'Payload', reward: '+5 supply credits' },
  water: { name: 'Water purification', group: 'Routine', where: 'Hab Systems', reward: `+${WATER_BONUS} to the base score` },
  medical: { name: 'Crew medical check', group: 'Routine', where: 'Hab Systems', reward: 'Clearance for habitat commissioning' },
  calibration: { name: 'Two-point calibration', group: 'Mission', where: 'Calibration', reward: 'Drilled samples are analysed (uncalibrated: flagged)' },
  relay: { name: 'Relay repair', group: 'Emergency', where: 'Rover Comms', reward: 'Restores the uplink' },
  habitat: { name: 'Habitat commissioning', group: 'Mission', where: 'Mission Report', reward: 'Crew quarters on Mars' },
}

export class Mission {
  profile: Profile
  instrumentDraft: InstrumentId | null = null
  instrument: InstrumentId | null = null
  payloadActive = false
  power: Power = { ...DEFAULT_POWER }
  completed = new Set<TaskId>()
  relayFault = false
  calibrated = false
  /**
   * Operations date (YYYY-MM-DD) that sets the Earth to Mars signal delay. REAL: the light time
   * for that date comes from JPL Horizons. It starts on the first date on offer.
   */
  opsDate: string = OPS_DATES[0].id
  /** The crater of the rover chosen for the expedition. One rover for the whole mission. */
  region: RegionId | null = null
  /** Rover position on the map, metres east and north of where the real rover is now. */
  pos: Pt = { x: 0, y: 0 }
  /** Battery charge now, watt-hours. Driving, tests and photos drain it; parking recharges it. */
  batteryWh = 0
  /** Mission time used by driving and recharging, in hours. The mission lasts MISSION_SOLS Mars days. */
  hoursUsed = 0
  recharges = 0
  /**
   * Real photo places in the album (ids from photoPlaces). The rover's cameras save them by
   * themselves whenever it drives or parks within range of one; each adds to the base score.
   */
  photos: number[] = []
  /** A recharge in progress. While it runs, the battery and the Mars days follow real time. */
  charging: Charging | null = null
  /** Points placed on the map for the next deployment. The last one is the spot to check. */
  waypoints: Pt[] = []
  drives: DriveResult[] = []
  spots: Spot[] = []
  /** Region-wide readings already taken (weather, radiation). */
  regional: TestId[] = []
  /** The battery hit the 40 % line mid-drive: the rover is in safe mode until it recharges. */
  stranded = false
  base: BaseOutcome | null = null
  log: LogEntry[] = []
  /** UI drafts for each task panel, kept so closing and reopening a panel preserves work. */
  drafts: Record<string, unknown> = {}
  dockedAt = Date.now()

  constructor(profile: Profile) {
    this.profile = { ...profile, callSign: cleanCallSign(profile.callSign), loadout: profile.loadout && cleanLoadout(profile.loadout) }
  }

  /** The design that flew, or undefined when the mission was started without one. */
  get loadout() { return this.profile.loadout }
  /** Effect size of a station cargo item carried up on the launch (CARGO in data.ts), 0 if it was not loaded. */
  cargo(id: CargoId) { return cargoValue(this.loadout, id) }
  /** Credits the launch and its cargo took out of the mission budget, before the instrument is bought aboard. */
  get launchSpent() { return this.loadout ? designCost(this.ship, this.loadout).cargo : 0 }
  /** OUR MODEL, cargo: oxygen tanks let life support run on fewer power units. */
  get lifeNeed() { return LIFE_NEED - this.cargo('oxygen') }
  /** OUR MODEL, cargo: a food supply lets the crew wait in orbit longer. */
  get missionSols() { return MISSION_SOLS + this.cargo('food') }
  /** Drilled samples are studied: the instrument was calibrated, or a full experiment rack came up. */
  get samplesStudied() { return this.calibrated || this.cargo('rack') >= 2 }

  get ship() { return byId(SHIPS, this.profile.ship) }
  /** Rover charge at the start, per cent of a full battery. */
  get startBattery() { return this.ship.battery }
  get instrumentInfo() { return this.instrument ? byId(INSTRUMENTS, this.instrument) : null }

  private stamp() {
    if (this.region) return `Day ${this.sol} · ${this.batteryWh} Wh`
    const s = Math.floor((Date.now() - this.dockedAt) / 1000)
    return `Dock ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  note(text: string, kind: LogEntry['kind'] = 'mission') { this.log.push({ at: this.stamp(), text, kind }) }

  // ---- Budget ------------------------------------------------------------
  /** Credits left after the launch, its cargo and the rover instrument. */
  get credits() {
    let c = this.ship.budget - this.launchSpent
    const inst = this.instrument ?? this.instrumentDraft
    if (inst) c -= byId(INSTRUMENTS, inst).cost
    if (this.completed.has('cargo')) c += CARGO_REWARD
    return c
  }
  /** Supply credits left. Nothing after the instrument is charged for, so this equals the credits. */
  get funds() { return this.credits }

  // ---- Payload -----------------------------------------------------------
  instrumentBlock(id: InstrumentId): string | null {
    const inst = byId(INSTRUMENTS, id)
    // with a launch design the rover flew on its own rocket: only the price matters, out of what the launch left
    if (this.loadout) {
      const left = this.ship.budget - this.launchSpent
      return inst.cost > left ? `${inst.code} costs ${inst.cost} cr; the launch and its cargo left ${left} cr.` : null
    }
    if (inst.massKg > this.ship.payloadKg) return `${inst.code} is ${inst.massKg} kg; ${this.ship.name} carries ${this.ship.payloadKg} kg.`
    if (inst.cost > this.ship.budget) return `${inst.code} costs ${inst.cost} cr; budget is ${this.ship.budget} cr.`
    return null
  }
  selectInstrument(id: InstrumentId): string | null {
    if (this.payloadActive) return 'Payload is locked after activation.'
    const block = this.instrumentBlock(id)
    if (block) return block
    this.instrumentDraft = id
    return null
  }
  activatePayload(): string | null {
    if (this.payloadActive) return 'Payload already active.'
    if (!this.instrumentDraft) return 'Select an instrument first.'
    this.instrument = this.instrumentDraft
    this.payloadActive = true
    this.relayFault = true // deterministic once-per-run interruption
    const inst = byId(INSTRUMENTS, this.instrument)
    this.note(`Payload activated: ${inst.name} (${inst.code}), ${inst.cost} cr, ${inst.massKg} kg.`)
    this.note('Relay fault: Mars link interrupted on payload power-up.', 'alert')
    if (this.cargo('parts')) this.complete('relay', 'fixed with a spare from the parts container')
    return null
  }

  // ---- Power -------------------------------------------------------------
  setPower(p: Power): string | null {
    if (!validPower(p)) return 'Allocation must use whole units, total at most 10.'
    this.power = { ...p }
    return null
  }

  // ---- Tasks -------------------------------------------------------------
  /** Marks a task complete once. Returns false if already rewarded. */
  complete(task: TaskId, detail: string): boolean {
    if (this.completed.has(task)) return false
    this.completed.add(task)
    if (task === 'relay') this.relayFault = false
    if (task === 'calibration') this.calibrated = true
    this.note(`${TASK_INFO[task].name} complete — ${detail}`, 'task')
    return true
  }
  taskAvailable(task: TaskId): string | null {
    if (task === 'calibration' && !this.payloadActive) return 'Activate a payload instrument first.'
    if (task === 'relay' && !this.relayFault && !this.completed.has('relay')) return 'Relay is nominal.'
    if (task === 'habitat') {
      if (!this.base?.approved) return 'Needs a base site.'
      if (!this.completed.has('medical')) return 'Crew medical clearance was skipped: complete the Hab Systems medical check before commissioning.'
    }
    return null
  }

  // ---- Rover access ------------------------------------------------------
  roverAccess(): string | null {
    if (!this.payloadActive) return 'Activate the payload at the Payload terminal first.'
    if (this.relayFault) return 'Relay fault: repair the relay before the planner can reach Mars.'
    return null
  }
  /** The NASA data for the operations date. */
  get ops(): OpsDate { return opsDate(this.opsDate) }
  setOpsDate(id: string): string | null {
    if (!OPS_DATES.some(d => d.id === id)) return 'That operations date is not on offer.'
    this.opsDate = id
    return null
  }
  /** One-way signal delay in minutes: the real light time for the operations date plus the relay hand-off. */
  get signalMin() { return signalLeg(this.ops.lightMin, this.ship.handoffMin, this.power) }

  // ---- The rover -----------------------------------------------------------
  get rover(): RoverSpec | null { return this.region ? ROVERS[region(this.region).rover] : null }
  get balanced() { return this.completed.has('battery') || this.cargo('parts') >= 2 }
  get fastDrill() { return researchFilter(this.power) || this.cargo('rack') >= 1 }
  /** Battery above the 40 % safe-mode line. */
  get spareWh() { return this.rover ? Math.max(0, this.batteryWh - reserveWh(this.rover)) : 0 }

  /** Picks the rover for the whole mission. It starts in its real crater, where the real rover is now. */
  chooseRover(id: RoverId): string | null {
    if (this.region) return 'You already chose your rover. It stays with you for the whole mission.'
    if (!ROVERS[id]) return 'Unknown rover.'
    return this.chooseRegion(ROVERS[id].region)
  }
  chooseRegion(id: RegionId): string | null {
    if (this.region) return 'You already chose your rover. It stays with you for the whole mission.'
    if (!REGIONS.some(r => r.id === id)) return 'Unknown region.'
    this.region = id
    const rv = this.rover!
    // The ship's rover-battery figure scales the one charge the rover gets.
    this.batteryWh = Math.round((rv.batteryWh * this.startBattery) / 100)
    this.pos = { x: 0, y: 0 }
    this.spots = [{ id: 0, label: 'A', p: { x: 0, y: 0 }, tests: [], arrivedWh: this.batteryWh, stranded: false }]
    // Parked beside a real photo spot, the rover saves its photo straight away.
    this.photos = placesInRange(rv, this.pos).map(p => p.id)
    this.note(`Rover chosen: ${rv.name}, ${region(id).name}. It starts where the real rover is (sol ${rv.area.centre.sol}) with ${this.batteryWh} Wh.`)
    return null
  }

  // ---- Planning a path -----------------------------------------------------
  /** The spot the rover is standing on, if any. */
  get spotHere(): Spot | null { return this.spots.find(s => dist(s.p, this.pos) < 1) ?? null }
  /** The rover can still drive at least 20 m. */
  get canDrive() { const rv = this.rover; return !!rv && !this.stranded && !this.base && !this.timeUp && !this.charging && this.spareWh >= driveWhPerM(rv, this.balanced) * 20 }

  // ---- Mission days --------------------------------------------------------
  get hoursLeft() { return Math.max(0, this.missionSols * SOL_HOURS - this.hoursUsed) }
  get solsLeft() { return this.hoursLeft / SOL_HOURS }
  /** The Mars day the mission is on, counting from 1. */
  get sol() { return Math.min(this.missionSols, Math.floor(this.hoursUsed / SOL_HOURS) + 1) }
  /** The mission days are used up: no more driving, tests or recharging. */
  get timeUp() { return !!this.rover && this.hoursLeft < 0.05 }

  // ---- Recharging ----------------------------------------------------------
  // The rover parks and its power source refills the battery. That takes real Mars time, and the
  // game plays it on a countdown: CHARGE_MS_PER_HOUR of real time for each Mars hour. The rules
  // are handed the real time (in milliseconds) by whoever is watching the clock.

  /** What a recharge would do from here: how long it takes and where it leaves the battery. */
  rechargePlan(): { hours: number; sols: number; toWh: number; full: boolean; realMs: number } | null {
    const rv = this.rover
    if (!rv) return null
    const need = rechargeHours(rv, this.batteryWh)
    const hours = Math.min(need, this.hoursLeft)
    const full = hours >= need - 1e-9
    return { hours, sols: hours / SOL_HOURS, toWh: full ? rv.batteryWh : Math.min(rv.batteryWh, Math.round(this.batteryWh + hours * rechargeW(rv))), full, realMs: hours * CHARGE_MS_PER_HOUR }
  }
  rechargeBlock(): string | null {
    const rv = this.rover
    if (!rv) return 'Choose a rover first.'
    if (this.base) return 'The base is already decided.'
    if (this.charging) return 'The rover is already recharging.'
    if (this.batteryWh >= rv.batteryWh - 1) return 'The battery is already full.'
    if (this.timeUp) return `The mission's ${this.missionSols} Mars days are used up.`
    return null
  }
  /** Parks the rover and starts the countdown at real time `now`. */
  startRecharge(now: number): string | null {
    const block = this.rechargeBlock()
    if (block) return block
    const p = this.rechargePlan()!
    this.charging = { startedAt: now, fromWh: this.batteryWh, toWh: p.toWh, fromHours: this.hoursUsed, hours: p.hours }
    this.note(`Recharge started at ${this.batteryWh} Wh: ${Math.round(p.hours * 10) / 10} Mars hours to reach ${p.toWh} Wh.`, 'rover')
    return null
  }
  /** Where the recharge stands at real time `now`, or null when the rover is not recharging. */
  chargeProgress(now: number): ChargeProgress | null {
    const c = this.charging
    if (!c) return null
    const total = c.hours * CHARGE_MS_PER_HOUR
    // A hair short of the end counts as the end, so rounding in the clock cannot leave it hanging.
    const raw = total <= 0 ? 1 : (now - c.startedAt) / total
    const fraction = raw >= 1 - 1e-9 ? 1 : Math.max(0, raw)
    return { fraction, wh: Math.round(c.fromWh + (c.toWh - c.fromWh) * fraction), hoursDone: c.hours * fraction, hoursLeft: c.hours * (1 - fraction), msLeft: total * (1 - fraction) }
  }
  /** Brings the battery and the Mars days up to real time `now`. Returns true if the recharge just finished. */
  syncRecharge(now: number): boolean {
    const c = this.charging
    if (!c) return false
    const p = this.chargeProgress(now)!
    this.batteryWh = p.wh
    this.hoursUsed = c.fromHours + p.hoursDone
    if (p.fraction < 1) return false
    this.endRecharge()
    return true
  }
  /** Stops the recharge at real time `now` and keeps the charge gained so far. */
  stopRecharge(now: number): string | null {
    if (!this.charging) return 'The rover is not recharging.'
    if (!this.syncRecharge(now)) this.endRecharge()
    return null
  }
  /** Skips the wait: the battery reaches its target at once and all of the Mars time is used. */
  skipRecharge(): string | null {
    const c = this.charging
    if (!c) return 'The rover is not recharging.'
    this.batteryWh = c.toWh
    this.hoursUsed = c.fromHours + c.hours
    this.endRecharge()
    return null
  }
  /** A whole recharge with no waiting: start, then skip. */
  recharge(): string | null { return this.startRecharge(0) ?? this.skipRecharge() }
  private endRecharge() {
    const c = this.charging!
    this.charging = null
    this.recharges++
    if (this.batteryWh > reserveWh(this.rover!)) this.stranded = false
    const sols = Math.round(((this.hoursUsed - c.fromHours) / SOL_HOURS) * 10) / 10
    this.note(`Recharged from ${c.fromWh} Wh to ${this.batteryWh} Wh in ${sols} Mars days${this.batteryWh < c.toWh ? ' (stopped early)' : this.batteryWh < this.rover!.batteryWh ? ' (the mission days ran out before it was full)' : ''}.`, 'rover')
  }

  // ---- Photos on the way ---------------------------------------------------
  // Nothing to press: deploy() adds every real photo spot the drive passes, and choosing the rover
  // adds the one it starts beside. Each spot counts once.
  get photoBonus() { return photoBonus(this.photos.length) }

  addWaypoint(p: Pt): string | null {
    const rv = this.rover
    if (!rv) return 'Choose a rover first.'
    if (this.base) return 'The base is already decided.'
    if (this.timeUp) return `The mission's ${this.missionSols} Mars days are used up.`
    if (this.charging) return 'The rover is recharging. Stop the recharge first.'
    if (this.stranded) return 'The rover is in safe mode. Recharge it before driving.'
    if (!inMap(rv, p)) return 'That point is off the map.'
    if (this.waypoints.length >= MAX_WAYPOINTS) return `At most ${MAX_WAYPOINTS} points per deployment.`
    // A tap on (or right beside) a spot already visited goes back to exactly that spot.
    const known = this.spots.find(s => dist(s.p, p) < 25)
    const q = known ? known.p : { x: Math.round(p.x), y: Math.round(p.y) }
    const last = this.waypoints[this.waypoints.length - 1] ?? this.pos
    if (dist(last, q) < 10) return 'Too close to the last point.'
    this.waypoints = [...this.waypoints, q]
    return null
  }
  undoWaypoint() { this.waypoints = this.waypoints.slice(0, -1) }
  clearWaypoints() { this.waypoints = [] }

  /** What the planned drive would do, from the same calculation the deployment runs. */
  forecast(): DriveResult | null {
    const rv = this.rover
    return rv && this.waypoints.length ? simulateDrive(rv, this.pos, this.waypoints, this.batteryWh, this.balanced, this.photos) : null
  }

  deployBlock(): string | null {
    const access = this.roverAccess()
    if (access) return access
    if (!this.rover) return 'Choose a rover first.'
    if (this.base) return 'The base is already decided.'
    if (this.timeUp) return `The mission's ${this.missionSols} Mars days are used up. Choose your base.`
    if (this.charging) return 'The rover is recharging. Stop the recharge first.'
    if (this.stranded) return 'The rover is in safe mode. Recharge it before driving.'
    const pb = powerBlock(this.power, this.lifeNeed)
    if (pb) return pb
    if (!this.canDrive) return 'The battery is too low to drive. Recharge it first.'
    if (!this.waypoints.length) return 'Tap the map to place at least one point.'
    const f = this.forecast()!
    if (f.hours > this.hoursLeft + 1e-9) return `This drive takes ${f.hours} hours, but only ${Math.floor(this.hoursLeft * 10) / 10} hours of the mission are left. Make it shorter.`
    return null
  }

  /** Sends the rover along the placed points. The place it stops becomes a new spot. */
  deploy(): string | null {
    const block = this.deployBlock()
    if (block) return block
    const rv = this.rover!
    const d = simulateDrive(rv, this.pos, this.waypoints, this.batteryWh, this.balanced, this.photos)
    this.note(`Deployment ${this.drives.length + 1}: ${this.waypoints.length} point${this.waypoints.length > 1 ? 's' : ''}, ${d.distM} m, ${d.climbM} m of climb.`, 'rover')
    this.drives.push(d)
    this.pos = d.end
    this.batteryWh = d.endWh
    this.hoursUsed += d.hours
    this.photos = [...this.photos, ...d.photos.map(p => p.place)]
    this.waypoints = []
    this.stranded = d.safeMode
    let spot = this.spotHere
    if (!spot) {
      spot = { id: this.spots.length, label: LABELS[this.spots.length % LABELS.length], p: d.end, tests: [], arrivedWh: d.endWh, stranded: d.safeMode }
      this.spots.push(spot)
    }
    if (d.safeMode) this.note(`Safe mode: the battery reached ${Math.round((reserveWh(rv) / rv.batteryWh) * 100)} % after ${d.distM} m. The rover stopped at spot ${spot.label}.`, 'alert')
    else this.note(`Arrived at spot ${spot.label} using ${d.usedWh} Wh over ${d.hours} h of driving.`, 'rover')
    if (d.photos.length) this.note(`${d.photos.length} real photo spot${d.photos.length > 1 ? 's' : ''} passed on the way: saved to the album (${this.photos.length} in all).`, 'rover')
    return null
  }

  // ---- Tests at the spot ---------------------------------------------------
  /** Tests that count for a spot: its own plus the region-wide readings. */
  testsFor(spot: Spot): TestId[] { return [...new Set([...spot.tests, ...this.regional])] }
  testCost(t: TestId) { return testWh(t, this.instrument ?? 'ir', this.fastDrill) }
  testBlock(t: TestId): string | null {
    const spot = this.spotHere
    if (!this.rover || !spot) return 'Drive to a spot first.'
    if (this.base) return 'The base is already decided.'
    if (this.testsFor(spot).includes(t)) return TESTS[t].scope === 'region' ? 'Already measured for this region.' : 'Already done at this spot.'
    if (this.timeUp) return `The mission's ${this.missionSols} Mars days are used up.`
    if (this.charging) return 'The rover is recharging. Stop the recharge first.'
    if (this.stranded) return 'Safe mode: no power to spare for tests. Recharge first.'
    const cost = this.testCost(t)
    if (cost > this.spareWh) return `Needs ${cost} Wh, but only ${this.spareWh} Wh is left above the safe-mode line.`
    return null
  }
  runTest(t: TestId): string | null {
    const block = this.testBlock(t)
    if (block) return block
    const spot = this.spotHere!
    this.batteryWh -= this.testCost(t)
    if (TESTS[t].scope === 'region') this.regional = [...this.regional, t]
    else spot.tests = [...spot.tests, t]
    this.note(`Spot ${spot.label}: ${TESTS[t].verb.toLowerCase()} (${this.testCost(t)} Wh)${t === 'drill' && !this.calibrated ? ', instrument uncalibrated' : ''}.`, 'rover')
    return null
  }

  // ---- Judging spots and choosing the base ---------------------------------
  /** Points added to every spot's score: the station water purifier and the real photo places found. */
  get bonus() { return (this.completed.has('water') ? WATER_BONUS : 0) + this.photoBonus + this.cargo('water') }
  report(spot: Spot): SpotReport {
    const rv = this.rover!
    const ground = groundAt(rv, spot.p)
    // shielding panels carried up on the launch protect the habitat: they add to the radiation score (our model)
    const shield = this.cargo('shielding')
    const bars = spotBars(rv, spot.p, this.testsFor(spot), this.samplesStudied).map(b => b.id !== 'rad' || b.score === null || !shield ? b
      : { ...b, score: Math.min(100, b.score + shield), value: `${b.value} · +${shield} from the shielding panels`, model: `${b.model} Shielding panels carried up add ${shield} (our model).` })
    const score = siteScore(bars, this.bonus)
    const v = verdict(bars, score, ground)
    return { spot, name: `Spot ${spot.label}`, ground, bars, score, verdict: v, stars: starsFor(score, true, v.level) }
  }
  reports(): SpotReport[] { return this.spots.map(s => this.report(s)) }

  /** Build the base on any spot the rover has stopped at, good or bad, or stay in orbit. */
  decideBase(id: number | 'defer'): string | null {
    if (!this.rover) return 'Choose a rover first.'
    if (this.base) return 'Base decision already made.'
    if (this.charging) return 'The rover is recharging. Stop the recharge first.'
    if (id === 'defer') {
      this.base = { id, approved: false, name: 'No base', score: 0, stars: 0, level: 'unknown', reason: 'The crew stays in orbit. No base was built.', bars: [] }
      this.note('Base decision: the crew stays in orbit.', 'landing')
      return null
    }
    const spot = this.spots.find(s => s.id === id)
    if (!spot) return 'Unknown spot.'
    const r = this.report(spot)
    this.base = { id, approved: true, name: r.name, score: r.score, stars: r.stars, level: r.verdict.level, reason: r.verdict.title, bars: r.bars }
    this.waypoints = []
    this.note(`Base built at spot ${spot.label}: ${r.verdict.title} (${r.score}/100).`, 'landing')
    return null
  }

  /** Choices that helped or hurt, with numbers, for the debrief. */
  causes(): { good: boolean; text: string }[] {
    const out: { good: boolean; text: string }[] = []
    const rv = this.rover
    if (!rv) return out
    const driven = this.drives.reduce((a, d) => a + d.distM, 0), climbed = this.drives.reduce((a, d) => a + d.climbM, 0), used = this.drives.reduce((a, d) => a + d.usedWh, 0)
    if (this.drives.length) out.push({ good: !this.stranded, text: `${rv.name} drove ${driven} m and climbed ${climbed} m in ${this.drives.length} deployment${this.drives.length > 1 ? 's' : ''}, using ${used} Wh.` })
    if (this.stranded) out.push({ good: false, text: 'A drive was longer than the battery allowed, so the rover ended in safe mode.' })
    if (this.recharges) out.push({ good: !this.timeUp, text: `Recharged ${this.recharges} time${this.recharges > 1 ? 's' : ''}. Driving and recharging used ${Math.round((this.hoursUsed / SOL_HOURS) * 10) / 10} of the ${this.missionSols} Mars days.` })
    if (this.timeUp) out.push({ good: false, text: `The ${this.missionSols} Mars days ran out, so the base had to be chosen from the spots already visited.` })
    if (this.photos.length) out.push({ good: true, text: `${this.photos.length} real photo place${this.photos.length > 1 ? 's' : ''} passed or parked at: +${this.photoBonus} to the base score.` })
    else if (this.drives.length) out.push({ good: false, text: 'The rover passed no real photo places, so there was no photo bonus.' })
    const b = this.base
    if (b?.approved) {
      const spot = this.spots.find(s => s.id === b.id)!
      const r = this.report(spot)
      if (r.verdict.level === 'bad') out.push({ good: false, text: `The base stands on a ${r.ground.tiltDeg}° slope, steeper than the ${MAX_BASE_TILT}° limit.` })
      if (r.verdict.level === 'good') out.push({ good: true, text: `The base stands on level ground (${r.ground.tiltDeg}°)${r.ground.source === 'rover' ? `, measured by the real ${rv.name} on sol ${r.ground.sol}` : ', judged from orbit'}.` })
      if (r.verdict.missing.length) out.push({ good: false, text: `Not measured at the base, so scored 0: ${r.verdict.missing.join(', ').toLowerCase()}.` })
      for (const t of r.verdict.bad) out.push({ good: false, text: `Weak point: ${t}.` })
      if (spot.tests.includes('drill')) out.push({ good: this.samplesStudied, text: this.samplesStudied ? `The rock sample was analysed${this.calibrated ? '' : ' in the experiment rack'}.` : 'The rock sample could not be analysed: the instrument was never calibrated.' })
    }
    const checked = this.spots.filter(s => s.tests.includes('photo')).length
    if (this.spots.length > 1) out.push({ good: checked > 1, text: `${checked} of ${this.spots.length} spots were photographed, so ${checked} slope${checked === 1 ? ' was' : 's were'} known.` })
    if (this.balanced && this.drives.length) out.push({ good: true, text: 'Balanced battery pack: every drive drew 30 W less.' })
    if (this.completed.has('water') && b?.approved) out.push({ good: true, text: `Water purifier: +${WATER_BONUS} to the base score.` })
    // what the cargo carried up on the launch did
    const kgOf = (id: CargoId) => (this.loadout?.cargo[id] ?? 0).toLocaleString('en-US')
    if (this.cargo('water') && b?.approved) out.push({ good: true, text: `Water storage tanks (${kgOf('water')} kg): +${this.cargo('water')} to the base score.` })
    if (this.cargo('shielding') && b?.approved) out.push({ good: true, text: `Radiation shielding panels (${kgOf('shielding')} kg): +${this.cargo('shielding')} on the radiation score${b.bars.some(x => x.id === 'rad' && x.score !== null) ? '' : ', but radiation was never measured at the base'}.` })
    if (this.cargo('oxygen')) out.push({ good: true, text: `Oxygen storage tanks (${kgOf('oxygen')} kg): life support needed only ${this.lifeNeed} power unit${this.lifeNeed === 1 ? '' : 's'}.` })
    if (this.cargo('food')) out.push({ good: true, text: `Food supply container (${kgOf('food')} kg): the mission had ${this.missionSols} Mars days instead of ${MISSION_SOLS}.` })
    if (this.cargo('parts')) out.push({ good: true, text: `Spare parts container (${kgOf('parts')} kg): the relay was fixed from spares${this.cargo('parts') >= 2 ? ', and the balanced battery pack cut driving power by 30 W' : ''}.` })
    if (this.cargo('rack')) out.push({ good: true, text: `Scientific experiment rack (${kgOf('rack')} kg): drilling used 30% less battery${this.cargo('rack') >= 2 ? ', and samples were studied without calibration' : ''}.` })
    if (this.loadout && !cargoKg(this.loadout)) out.push({ good: false, text: 'The launch carried no station cargo.' })
    return out
  }
}
