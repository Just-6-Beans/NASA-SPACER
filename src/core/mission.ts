// Mission state and rules. Plain TypeScript: runs in Node tests, the browser, and shares
// validation with the co-op server.
import { CARGO_REWARD, INSTRUMENTS, SHIPS, byId, type InstrumentId, type ShipId, type SuitId } from './data'
import { DEFAULT_POWER, powerBlock, researchFilter, signalLeg, validPower, type Power } from './power'
import { ROVERS, type RoverId, type RoverSpec } from './rovers'
import {
  DRIVE_PHOTO_WH, MAX_BASE_TILT, MAX_WAYPOINTS, MISSION_SOLS, PHOTO_RANGE_M, REGIONS, SOL_HOURS, TESTS, dist, distToPath, driveWhPerM, groundAt, inMap, photoBonus, photoPlaces,
  rechargeHours, rechargeW, region, reserveWh, simulateDrive, siteScore, spotBars, starsFor, testWh, verdict,
  type Bar, type DriveResult, type Ground, type Pt, type RegionId, type TestId, type Verdict,
} from './survey'
import type { TaskId } from './tasks'

export interface Profile { callSign: string; suit: SuitId; ship: ShipId }

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
  /** The crater of the rover chosen for the expedition. One rover for the whole mission. */
  region: RegionId | null = null
  /** Rover position on the map, metres east and north of where the real rover is now. */
  pos: Pt = { x: 0, y: 0 }
  /** Battery charge now, watt-hours. Driving, tests and photos drain it; parking recharges it. */
  batteryWh = 0
  /** Mission time used by driving and recharging, in hours. The mission lasts MISSION_SOLS Mars days. */
  hoursUsed = 0
  recharges = 0
  /** Real photo places the rover has photographed (ids from photoPlaces). */
  photos: number[] = []
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
    this.profile = { ...profile, callSign: cleanCallSign(profile.callSign) }
  }

  get ship() { return byId(SHIPS, this.profile.ship) }
  get instrumentInfo() { return this.instrument ? byId(INSTRUMENTS, this.instrument) : null }

  private stamp() {
    if (this.region) return `Day ${this.sol} · ${this.batteryWh} Wh`
    const s = Math.floor((Date.now() - this.dockedAt) / 1000)
    return `Dock ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  note(text: string, kind: LogEntry['kind'] = 'mission') { this.log.push({ at: this.stamp(), text, kind }) }

  // ---- Budget ------------------------------------------------------------
  get credits() {
    let c = this.ship.budget
    const inst = this.instrument ?? this.instrumentDraft
    if (inst) c -= byId(INSTRUMENTS, inst).cost
    if (this.completed.has('cargo')) c += CARGO_REWARD
    return c
  }

  // ---- Payload -----------------------------------------------------------
  instrumentBlock(id: InstrumentId): string | null {
    const inst = byId(INSTRUMENTS, id)
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
  get signalMin() { return signalLeg(this.ship.relayMin, this.power) }

  // ---- The rover -----------------------------------------------------------
  get rover(): RoverSpec | null { return this.region ? ROVERS[region(this.region).rover] : null }
  get balanced() { return this.completed.has('battery') }
  get fastDrill() { return researchFilter(this.power) }
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
    this.batteryWh = Math.round((rv.batteryWh * this.ship.battery) / 100)
    this.pos = { x: 0, y: 0 }
    this.spots = [{ id: 0, label: 'A', p: { x: 0, y: 0 }, tests: [], arrivedWh: this.batteryWh, stranded: false }]
    this.note(`Rover chosen: ${rv.name}, ${region(id).name}. It starts where the real rover is (sol ${rv.area.centre.sol}) with ${this.batteryWh} Wh.`)
    return null
  }

  // ---- Planning a path -----------------------------------------------------
  /** The spot the rover is standing on, if any. */
  get spotHere(): Spot | null { return this.spots.find(s => dist(s.p, this.pos) < 1) ?? null }
  /** The rover can still drive at least 20 m. */
  get canDrive() { const rv = this.rover; return !!rv && !this.stranded && !this.base && !this.timeUp && this.spareWh >= driveWhPerM(rv, this.balanced) * 20 }

  // ---- Mission days --------------------------------------------------------
  get hoursLeft() { return Math.max(0, MISSION_SOLS * SOL_HOURS - this.hoursUsed) }
  get solsLeft() { return this.hoursLeft / SOL_HOURS }
  /** The Mars day the mission is on, counting from 1. */
  get sol() { return Math.min(MISSION_SOLS, Math.floor(this.hoursUsed / SOL_HOURS) + 1) }
  /** The mission days are used up: no more driving, tests or recharging. */
  get timeUp() { return !!this.rover && this.hoursLeft < 0.05 }

  // ---- Recharging ----------------------------------------------------------
  /** What a recharge would do now: how long it takes and where it leaves the battery. */
  rechargePlan(): { hours: number; sols: number; toWh: number; full: boolean } | null {
    const rv = this.rover
    if (!rv) return null
    const need = rechargeHours(rv, this.batteryWh)
    const hours = Math.min(need, this.hoursLeft)
    const full = hours >= need - 1e-9
    return { hours, sols: hours / SOL_HOURS, toWh: full ? rv.batteryWh : Math.min(rv.batteryWh, Math.round(this.batteryWh + hours * rechargeW(rv))), full }
  }
  rechargeBlock(): string | null {
    const rv = this.rover
    if (!rv) return 'Choose a rover first.'
    if (this.base) return 'The base is already decided.'
    if (this.batteryWh >= rv.batteryWh - 1) return 'The battery is already full.'
    if (this.timeUp) return `The mission's ${MISSION_SOLS} Mars days are used up.`
    return null
  }
  /** Parks the rover while its power source refills the battery. Costs mission days; ends safe mode. */
  recharge(): string | null {
    const block = this.rechargeBlock()
    if (block) return block
    const p = this.rechargePlan()!
    const from = this.batteryWh
    this.batteryWh = p.toWh
    this.hoursUsed += p.hours
    this.recharges++
    this.stranded = false
    this.note(`Recharged from ${from} Wh to ${p.toWh} Wh in ${Math.round(p.sols * 10) / 10} Mars days${p.full ? '' : ' (the mission days ran out before it was full)'}.`, 'rover')
    return null
  }

  // ---- Photos on the way ---------------------------------------------------
  /** Why the rover cannot photograph a real photo place right now, or null if it can. */
  photoBlock(placeId: number): string | null {
    const rv = this.rover
    if (!rv) return 'Choose a rover first.'
    if (this.base) return 'The base is already decided.'
    const place = photoPlaces(rv).find(p => p.id === placeId)
    if (!place) return 'Unknown photo place.'
    if (this.photos.includes(placeId)) return 'Already in your album.'
    // In reach if the last drive passed it or the rover is parked beside it.
    const last = this.drives[this.drives.length - 1]
    const path = last ? [last.start, ...last.legs.map(l => l.to)] : [this.pos]
    if (Math.min(distToPath(place, path), dist(place, this.pos)) > PHOTO_RANGE_M) return `Too far: the rover must pass within ${PHOTO_RANGE_M} m of the camera mark.`
    if (DRIVE_PHOTO_WH > this.spareWh) return `Needs ${DRIVE_PHOTO_WH} Wh, but only ${this.spareWh} Wh is left above the safe-mode line.`
    return null
  }
  /** Photographs a real photo place: its real NASA photos join the album and add to the base score. */
  takePhoto(placeId: number): string | null {
    const block = this.photoBlock(placeId)
    if (block) return block
    this.batteryWh -= DRIVE_PHOTO_WH
    this.photos = [...this.photos, placeId]
    const place = photoPlaces(this.rover!).find(p => p.id === placeId)!
    this.note(`Photo taken where the real ${this.rover!.name} stood on sol ${place.sol} (${DRIVE_PHOTO_WH} Wh). Album: ${this.photos.length} place${this.photos.length > 1 ? 's' : ''}.`, 'rover')
    return null
  }
  get photoBonus() { return photoBonus(this.photos.length) }

  addWaypoint(p: Pt): string | null {
    const rv = this.rover
    if (!rv) return 'Choose a rover first.'
    if (this.base) return 'The base is already decided.'
    if (this.timeUp) return `The mission's ${MISSION_SOLS} Mars days are used up.`
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
    return rv && this.waypoints.length ? simulateDrive(rv, this.pos, this.waypoints, this.batteryWh, this.balanced) : null
  }

  deployBlock(): string | null {
    const access = this.roverAccess()
    if (access) return access
    if (!this.rover) return 'Choose a rover first.'
    if (this.base) return 'The base is already decided.'
    if (this.timeUp) return `The mission's ${MISSION_SOLS} Mars days are used up. Choose your base.`
    if (this.stranded) return 'The rover is in safe mode. Recharge it before driving.'
    const pb = powerBlock(this.power)
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
    const d = simulateDrive(rv, this.pos, this.waypoints, this.batteryWh, this.balanced)
    this.note(`Deployment ${this.drives.length + 1}: ${this.waypoints.length} point${this.waypoints.length > 1 ? 's' : ''}, ${d.distM} m, ${d.climbM} m of climb.`, 'rover')
    this.drives.push(d)
    this.pos = d.end
    this.batteryWh = d.endWh
    this.hoursUsed += d.hours
    this.waypoints = []
    this.stranded = d.safeMode
    let spot = this.spotHere
    if (!spot) {
      spot = { id: this.spots.length, label: LABELS[this.spots.length % LABELS.length], p: d.end, tests: [], arrivedWh: d.endWh, stranded: d.safeMode }
      this.spots.push(spot)
    }
    if (d.safeMode) this.note(`Safe mode: the battery reached ${Math.round((reserveWh(rv) / rv.batteryWh) * 100)} % after ${d.distM} m. The rover stopped at spot ${spot.label}.`, 'alert')
    else this.note(`Arrived at spot ${spot.label} using ${d.usedWh} Wh over ${d.hours} h of driving.`, 'rover')
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
    if (this.timeUp) return `The mission's ${MISSION_SOLS} Mars days are used up.`
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
  get bonus() { return (this.completed.has('water') ? WATER_BONUS : 0) + this.photoBonus }
  report(spot: Spot): SpotReport {
    const rv = this.rover!
    const ground = groundAt(rv, spot.p)
    const bars = spotBars(rv, spot.p, this.testsFor(spot), this.calibrated)
    const score = siteScore(bars, this.bonus)
    const v = verdict(bars, score, ground)
    return { spot, name: `Spot ${spot.label}`, ground, bars, score, verdict: v, stars: starsFor(score, true, v.level) }
  }
  reports(): SpotReport[] { return this.spots.map(s => this.report(s)) }

  /** Build the base on any spot the rover has stopped at, good or bad, or stay in orbit. */
  decideBase(id: number | 'defer'): string | null {
    if (!this.rover) return 'Choose a rover first.'
    if (this.base) return 'Base decision already made.'
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
    if (this.recharges) out.push({ good: !this.timeUp, text: `Recharged ${this.recharges} time${this.recharges > 1 ? 's' : ''}. Driving and recharging used ${Math.round((this.hoursUsed / SOL_HOURS) * 10) / 10} of the ${MISSION_SOLS} Mars days.` })
    if (this.timeUp) out.push({ good: false, text: `The ${MISSION_SOLS} Mars days ran out, so the base had to be chosen from the spots already visited.` })
    if (this.photos.length) out.push({ good: true, text: `${this.photos.length} real photo place${this.photos.length > 1 ? 's' : ''} found on the way: +${this.photoBonus} to the base score.` })
    else if (this.drives.length) out.push({ good: false, text: 'No photo places were photographed on the way, so there was no photo bonus.' })
    const b = this.base
    if (b?.approved) {
      const spot = this.spots.find(s => s.id === b.id)!
      const r = this.report(spot)
      if (r.verdict.level === 'bad') out.push({ good: false, text: `The base stands on a ${r.ground.tiltDeg}° slope, steeper than the ${MAX_BASE_TILT}° limit.` })
      if (r.verdict.level === 'good') out.push({ good: true, text: `The base stands on level ground (${r.ground.tiltDeg}°)${r.ground.source === 'rover' ? `, measured by the real ${rv.name} on sol ${r.ground.sol}` : ', judged from orbit'}.` })
      if (r.verdict.missing.length) out.push({ good: false, text: `Not measured at the base, so scored 0: ${r.verdict.missing.join(', ').toLowerCase()}.` })
      for (const t of r.verdict.bad) out.push({ good: false, text: `Weak point: ${t}.` })
      if (spot.tests.includes('drill')) out.push({ good: this.calibrated, text: this.calibrated ? 'The rock sample was analysed.' : 'The rock sample could not be analysed: the instrument was never calibrated.' })
    }
    const checked = this.spots.filter(s => s.tests.includes('photo')).length
    if (this.spots.length > 1) out.push({ good: checked > 1, text: `${checked} of ${this.spots.length} spots were photographed, so ${checked} slope${checked === 1 ? ' was' : 's were'} known.` })
    if (this.balanced && this.drives.length) out.push({ good: true, text: 'Balanced battery pack: every drive drew 30 W less.' })
    if (this.completed.has('water') && b?.approved) out.push({ good: true, text: `Water purifier: +${WATER_BONUS} to the base score.` })
    return out
  }
}
