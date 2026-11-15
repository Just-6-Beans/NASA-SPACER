// Mission state and rules. Plain TypeScript: runs in Node tests, the browser, and shares
// validation with the co-op server.
import { OPS_DATES, opsDate, type OpsDate } from '../data/opsDates'
import { sampleFacts } from '../data/roverTasks'
import { CARGO_REWARD, INSTRUMENTS, SHIPS, byId, type CargoId, type InstrumentId, type ShipId, type SuitId } from './data'
import { BACKUP_SOLS, ROCKET_MIN, delivered, deliveryRocket, failureStory, rocketRefusal, rocketsFor, type Delivery, type DeliveryId } from './delivery'
import { Greenhouse } from './greenhouse'
import { cargoKg, cargoValue, cleanLoadout, designCost, type LaunchRecord, type Loadout } from './loadout'
import { DEFAULT_POWER, LIFE_NEED, powerBlock, researchFilter, signalLeg, validPower, type Power } from './power'
import {
  CAUSES, FIXES, RESCUE_LIMIT_SOLS, START_WEAR, WEAR_LIMIT, WORN_SPEED, cutPath, fixOutcome, newRescue, rescueLeft, routeRisk, stuckOn,
  type FixId, type Rescue, type RouteRisk, type StuckCause,
} from './rescue'
import { ROVERS, type RoverId, type RoverSpec } from './rovers'
import { ROCK_IDS, SAMPLE_SNAP_M, TUBE_COUNT, cacheRating, picksBlock, rock, sampleSites, sampleValue, siteAt, type RockId, type SampleResult, type SampleSite } from './samples'
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
  calibration: { name: 'Two-point calibration', group: 'Mission', where: 'Calibration', reward: 'Rock scans read clearly at the sample sites (uncalibrated: the composition is a guess)' },
  relay: { name: 'Relay repair', group: 'Emergency', where: 'Rover Comms', reward: 'Restores the uplink' },
  habitat: { name: 'Habitat commissioning', group: 'Mission', where: 'Mission Report', reward: 'Crew quarters on Mars' },
  greenhouse: { name: 'Station greenhouse', group: 'Routine', where: 'Greenhouse module', reward: 'A greenhouse score of 0 to 100, counted beside the base score' },
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
  /** The dice: the launch of the rover's rocket, getting stuck, the order the rocks lie in. Tests replace it. */
  rng: () => number = Math.random
  /** How the rover got to Mars: the rocket chosen for it, and whether a backup had to fly. Null until it is launched. */
  delivery: Delivery | null = null
  /** Wheel wear, per cent (OUR MODEL). At WEAR_LIMIT the rover drives slower for the rest of the mission. */
  wheelWear = 0
  /** The stuck-rover rescue: under way while its result is null, kept afterwards for the report. One per mission. */
  rescue: Rescue | null = null
  /** The tubes sealed so far, at one sample site or several. Null until the first is sealed. */
  samples: SampleResult | null = null
  private worn: RoverSpec | null = null
  base: BaseOutcome | null = null
  log: LogEntry[] = []
  /** UI drafts for each task panel, kept so closing and reopening a panel preserves work. */
  drafts: Record<string, unknown> = {}
  dockedAt = Date.now()
  /** The station greenhouse. Optional: it never blocks the mission, and it is scored on its own. */
  greenhouse = new Greenhouse()

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
  /** Rock scans read clearly: the instrument was calibrated, or a full experiment rack came up. */
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
  /** Credits left after the launch, its cargo, the rover instrument and the rover's rocket. */
  get credits() {
    let c = this.ship.budget - this.launchSpent
    const inst = this.instrument ?? this.instrumentDraft
    if (inst) c -= byId(INSTRUMENTS, inst).cost
    if (this.completed.has('cargo')) c += CARGO_REWARD
    if (this.delivery) c -= deliveryRocket(this.delivery.rocket).price ?? 0
    return c
  }
  /** Supply credits left. Nothing after the rover's rocket is charged for, so this equals the credits. */
  get funds() { return this.credits }

  // ---- Payload -----------------------------------------------------------
  /** An instrument has to leave enough for the cheapest rocket that can carry a rover. */
  instrumentBlock(id: InstrumentId): string | null {
    const inst = byId(INSTRUMENTS, id)
    // with a launch design the rover flies on its own rocket: only the price matters, out of what the launch left
    if (this.loadout) {
      const left = this.ship.budget - this.launchSpent
      return inst.cost + ROCKET_MIN > left ? `${inst.code} costs ${inst.cost} cr and the rover's rocket at least ${ROCKET_MIN} cr; the launch and its cargo left ${left} cr.` : null
    }
    if (inst.massKg > this.ship.payloadKg) return `${inst.code} is ${inst.massKg} kg; ${this.ship.name} carries ${this.ship.payloadKg} kg.`
    if (inst.cost + ROCKET_MIN > this.ship.budget) return `${inst.code} costs ${inst.cost} cr and the rover's rocket at least ${ROCKET_MIN} cr; budget is ${this.ship.budget} cr.`
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
    if (task === 'water') this.greenhouse.setPurifier(true) // the purifier also returns more of the greenhouse's water
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
  /**
   * The chosen rover. Once its wheels are worn past the limit it is the same rover with a lower
   * top speed, so every drive after that takes longer and costs more battery per metre.
   */
  get rover(): RoverSpec | null {
    if (!this.region) return null
    const real = ROVERS[region(this.region).rover]
    if (!this.wheelsWorn) return real
    return this.worn ??= { ...real, topSpeedMh: Math.round(real.topSpeedMh * WORN_SPEED) }
  }
  get balanced() { return this.completed.has('battery') || this.cargo('parts') >= 2 }
  get fastDrill() { return researchFilter(this.power) || this.cargo('rack') >= 1 }
  /** Battery above the 40 % safe-mode line. */
  get spareWh() { return this.rover ? Math.max(0, this.batteryWh - reserveWh(this.rover)) : 0 }

  /** Why a rover cannot be chosen, or null: one rover for the whole mission, and the budget must cover a rocket that can carry it. */
  roverBlock(id: RoverId): string | null {
    if (this.region) return 'You already chose your rover. It stays with you for the whole mission.'
    if (!ROVERS[id]) return 'Unknown rover.'
    const cheapest = rocketsFor(id)[0]
    if (cheapest.price! > this.credits) return `${ROVERS[id].name} can only reach Mars on the ${cheapest.name} (${cheapest.price} cr), and ${this.credits} cr is left.`
    return null
  }
  /** Picks the rover for the whole mission. It starts in its real crater, where the real rover is now. */
  chooseRover(id: RoverId): string | null {
    return this.roverBlock(id) ?? this.chooseRegion(ROVERS[id].region)
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
    this.wheelWear = START_WEAR[rv.id]
    this.note(`Rover chosen: ${rv.name}, ${region(id).name}. It starts where the real rover is (sol ${rv.area.centre.sol}) with ${this.batteryWh} Wh.`)
    return null
  }

  // ---- The rover's rocket --------------------------------------------------
  // The rover flies on its own rocket, chosen after the rover. REAL: which rockets flew the rovers
  // and what NASA paid. OUR MODEL: the price in credits, the success rate, and what a failure costs.

  /** Why a rocket cannot launch this rover, or null. */
  rocketBlock(id: DeliveryId): string | null {
    const rv = this.rover
    if (!rv) return 'Choose a rover first.'
    if (this.delivery) return 'The rover has already been launched.'
    const k = deliveryRocket(id)
    const refusal = rocketRefusal(k, rv.id)
    if (refusal) return refusal
    if (k.price! > this.credits) return `${k.name} costs ${k.price} cr, and ${this.credits} cr is left.`
    return null
  }
  /**
   * Launches the rover. The dice decide whether it reaches Mars; if it does not, a backup rover
   * flies and the crew loses BACKUP_SOLS Mars days waiting for it. Never a dead end.
   */
  chooseRocket(id: DeliveryId): string | null {
    const block = this.rocketBlock(id)
    if (block) return block
    const rv = this.rover!, k = deliveryRocket(id)
    const ok = delivered(k, this.rng())
    this.delivery = { rocket: id, ok, solsLost: ok ? 0 : BACKUP_SOLS }
    if (ok) this.note(`${rv.name} launched on the ${k.name} (${k.price} cr) and reached Mars.`)
    else {
      this.hoursUsed += BACKUP_SOLS * SOL_HOURS
      this.note(`The ${k.name} launch failed. ${failureStory(k)} A backup ${rv.name} flew: ${BACKUP_SOLS} Mars days lost.`, 'alert')
    }
    return null
  }
  /** Why the rover cannot work right now, or null: it has not been launched, or it is stuck. */
  private held(): string | null {
    if (!this.delivery) return 'Choose the rocket that carries your rover first.'
    if (this.stuck) return 'The rover is stuck. Free it first.'
    return null
  }

  // ---- Planning a path -----------------------------------------------------
  /** The spot the rover is standing on, if any. */
  get spotHere(): Spot | null { return this.spots.find(s => dist(s.p, this.pos) < 1) ?? null }
  /** The rover can still drive at least 20 m. */
  get canDrive() { const rv = this.rover; return !!rv && !this.held() && !this.stranded && !this.base && !this.timeUp && !this.charging && this.spareWh >= driveWhPerM(rv, this.balanced) * 20 }

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
    const held = this.held()
    if (held) return held
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
    const held = this.held()
    if (held) return held
    if (this.base) return 'The base is already decided.'
    if (this.timeUp) return `The mission's ${this.missionSols} Mars days are used up.`
    if (this.charging) return 'The rover is recharging. Stop the recharge first.'
    if (this.stranded) return 'The rover is in safe mode. Recharge it before driving.'
    if (!inMap(rv, p)) return 'That point is off the map.'
    if (this.waypoints.length >= MAX_WAYPOINTS) return `At most ${MAX_WAYPOINTS} points per deployment.`
    // A tap on (or right beside) a spot already visited goes back to exactly that spot, and a tap
    // on a sample site's marker goes to the site itself.
    const known = this.spots.find(s => dist(s.p, p) < 25)
    const site = sampleSites(rv).find(x => dist(x, p) <= SAMPLE_SNAP_M)
    const q = known ? known.p : site ? { x: site.x, y: site.y } : { x: Math.round(p.x), y: Math.round(p.y) }
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

  /** How risky the planned path is: the real slope under it and how far it strays from where the real rover parked. */
  routeRisk(): RouteRisk | null {
    const rv = this.rover
    return rv && this.waypoints.length ? routeRisk(rv, this.pos, this.waypoints) : null
  }

  deployBlock(): string | null {
    const access = this.roverAccess()
    if (access) return access
    if (!this.rover) return 'Choose a rover first.'
    const held = this.held()
    if (held) return held
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
    const plan = simulateDrive(rv, this.pos, this.waypoints, this.batteryWh, this.balanced, this.photos)
    // Wheel trouble, once a mission: the drive ends where the rover gets stuck, and the rest of the path is lost.
    const hit = this.rescue ? null : stuckOn(rv, this.pos, this.waypoints, plan, this.drives.length, this.rng)
    const d = hit ? simulateDrive(rv, this.pos, cutPath(this.pos, this.waypoints, hit.alongM), this.batteryWh, this.balanced, this.photos) : plan
    this.note(`Deployment ${this.drives.length + 1}: ${this.waypoints.length} point${this.waypoints.length > 1 ? 's' : ''}, ${plan.distM} m, ${plan.climbM} m of climb.`, 'rover')
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
    if (hit && !d.safeMode) {
      this.rescue = newRescue(hit.cause, d.end, spot.label, this.wheelWear, this.rng)
      this.note(`Wheel trouble ${d.distM} m along: the rover is stuck at spot ${spot.label}.`, 'alert')
    } else if (d.safeMode) this.note(`Safe mode: the battery reached ${Math.round((reserveWh(rv) / rv.batteryWh) * 100)} % after ${d.distM} m. The rover stopped at spot ${spot.label}.`, 'alert')
    else this.note(`Arrived at spot ${spot.label} using ${d.usedWh} Wh over ${d.hours} h of driving.`, 'rover')
    if (d.photos.length) this.note(`${d.photos.length} real photo spot${d.photos.length > 1 ? 's' : ''} passed on the way: saved to the album (${this.photos.length} in all).`, 'rover')
    return null
  }

  // ---- Stuck rover rescue ----------------------------------------------------
  // OUR MODEL throughout (rescue.ts). The pilot reads the telemetry, says what the trouble is,
  // and tries fixes. Each fix costs Mars days whether it works or not, and a wrong one wears the wheels.

  /** The rover is stuck right now. */
  get stuck() { return !!this.rescue && this.rescue.result === null }
  /** The wheels are worn past the limit: top speed is down for the rest of the mission. */
  get wheelsWorn() { return this.wheelWear >= WEAR_LIMIT }
  /** Records what the pilot thinks the trouble is. It can be changed until the rover is free. */
  diagnose(cause: StuckCause): string | null {
    if (!this.stuck) return 'The rover is not stuck.'
    if (!CAUSES[cause]) return 'Unknown cause.'
    this.rescue!.diagnosis = cause
    return null
  }
  fixBlock(fix: FixId): string | null {
    const r = this.rescue
    if (!r || r.result !== null) return 'The rover is not stuck.'
    const info = FIXES[fix]
    if (!info) return 'Unknown fix.'
    if (info.sols > rescueLeft(r) + 1e-9) return `${info.name} takes ${info.sols} Mars days, and only ${rescueLeft(r)} are left before the ${RESCUE_LIMIT_SOLS}-day limit.`
    return null
  }
  /** Tries one fix. The Mars days pass whatever happens. */
  tryFix(fix: FixId): string | null {
    const block = this.fixBlock(fix)
    if (block) return block
    const r = this.rescue!, info = FIXES[fix], o = fixOutcome(r.cause, fix)
    const wasWorn = this.wheelsWorn
    this.hoursUsed += Math.min(info.sols * SOL_HOURS, this.hoursLeft)
    r.solsUsed = Math.round((r.solsUsed + info.sols) * 100) / 100
    this.wheelWear = Math.min(100, this.wheelWear + o.wear)
    r.tries.push({ fix, freed: o.freed, sols: info.sols, wear: o.wear, text: o.text })
    const shortest = Math.min(...Object.values(FIXES).map(f => f.sols))
    if (o.freed) r.result = r.tries.length === 1 ? 'clean' : 'freed'
    else if (rescueLeft(r) < shortest - 1e-9 || this.timeUp) r.result = 'held'
    this.note(`Rescue at spot ${r.spot}: ${info.name.toLowerCase()} (${info.sols} Mars days). ${o.text}${o.wear ? ` Wheel wear +${o.wear} %.` : ''}`, o.freed ? 'rover' : 'alert')
    if (r.result === 'held') this.note(`The rover was held for ${r.solsUsed} Mars days before the team worked it free.`, 'alert')
    if (!wasWorn && this.wheelsWorn) {
      this.worn = null
      this.note(`Wheel wear reached ${this.wheelWear} %: top speed is down to ${Math.round(WORN_SPEED * 100)} % for the rest of the mission.`, 'alert')
    }
    return null
  }

  // ---- Sample selection ------------------------------------------------------
  // Three sample sites hold five rocks between them, and the rover has three tubes for the whole
  // mission. Scanning is free; coring costs battery for each tube. The tubes can be filled at one
  // site or spread over several, and what they are worth fills the Rock samples check for the
  // whole region.

  /** The sample sites on this rover's map: places the real rover parked (REAL), chosen by the game. Nearest first. */
  get sampleSites(): SampleSite[] { const rv = this.rover; return rv ? sampleSites(rv) : [] }
  /** The sample site the rover is standing at, if any. */
  get siteHere(): SampleSite | null { const rv = this.rover; return rv ? siteAt(rv, this.pos) : null }
  get atSampleSite() { return !!this.siteHere }
  /** Tubes still empty. */
  get tubesLeft() { return TUBE_COUNT - (this.samples?.picks.length ?? 0) }
  /** The rocks at a site that are not in a tube yet. */
  rocksLeft(site: SampleSite): RockId[] { return site.rocks.filter(id => !this.samples?.picks.includes(id)) }
  /** There is still coring to do where the rover stands: an empty tube and a rock not yet taken. */
  get siteOpen() { const site = this.siteHere; return !!site && this.tubesLeft > 0 && this.rocksLeft(site).length > 0 }
  /** Battery that coring one tube uses, watt-hours: a third of what three tubes cost. */
  get tubeCost() { return Math.round(this.testCost('drill') / TUBE_COUNT) }
  /** Battery that coring all three tubes uses, watt-hours. */
  get sampleCost() { return this.testCost('drill') }
  sampleBlock(): string | null {
    if (!this.rover) return 'Choose a rover first.'
    const held = this.held()
    if (held) return held
    if (this.base) return 'The base is already decided.'
    if (this.tubesLeft <= 0) return 'All three tubes are already sealed.'
    const site = this.siteHere
    if (!site) return 'Drive to a sample site first.'
    if (!this.rocksLeft(site).length) return 'Every rock at this site is already in a tube.'
    if (this.timeUp) return `The mission's ${this.missionSols} Mars days are used up.`
    if (this.charging) return 'The rover is recharging. Stop the recharge first.'
    if (this.stranded) return 'Safe mode: no power to spare for coring. Recharge first.'
    if (this.tubeCost > this.spareWh) return `Coring a tube needs ${this.tubeCost} Wh, but only ${this.spareWh} Wh is left above the safe-mode line.`
    return null
  }
  /** Cores the chosen rocks at this site and seals one tube for each. */
  collectSamples(picks: RockId[]): string | null {
    const before = this.samples
    const block = this.sampleBlock() ?? picksBlock(picks, this.siteHere!, before?.picks ?? [])
    if (block) return block
    const wh = this.tubeCost * picks.length
    if (wh > this.spareWh) return `Coring ${picks.length} tubes needs ${wh} Wh, but only ${this.spareWh} Wh is left above the safe-mode line.`
    const site = this.siteHere!
    this.batteryWh -= wh
    const all = [...(before?.picks ?? []), ...picks]
    const value = sampleValue(all)
    this.samples = { picks: all, value, clear: this.samplesStudied && (before?.clear ?? true), organics: all.filter(id => rock(id).organic).length, wh: (before?.wh ?? 0) + wh }
    if (!this.regional.includes('drill')) this.regional = [...this.regional, 'drill']
    this.note(`${picks.length} tube${picks.length === 1 ? '' : 's'} sealed at sample ${site.name.toLowerCase()} (${wh} Wh): ${picks.map(id => sampleFacts(id).name).join(', ')}. ${all.length} of ${TUBE_COUNT} tubes full, science value ${value} of 100.`, 'rover')
    return null
  }

  // ---- Tests at the spot ---------------------------------------------------
  /** Tests that count for a spot: its own plus the region-wide readings. */
  testsFor(spot: Spot): TestId[] { return [...new Set([...spot.tests, ...this.regional])] }
  testCost(t: TestId) { return testWh(t, this.instrument ?? 'ir', this.fastDrill) }
  testBlock(t: TestId): string | null {
    const spot = this.spotHere
    if (!this.rover || !spot) return 'Drive to a spot first.'
    if (t === 'drill') return 'Rock cores are taken at a sample site: the rover has three tubes for all of them.'
    const held = this.held()
    if (held) return held
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
    this.note(`Spot ${spot.label}: ${TESTS[t].verb.toLowerCase()} (${this.testCost(t)} Wh).`, 'rover')
    return null
  }

  // ---- Judging spots and choosing the base ---------------------------------
  /** Points added to every spot's score: the station water purifier and the real photo places found. */
  /** What a leaderboard would rank: the base score, the greenhouse score, and their sum (each 0 to 100). */
  get scoreboard() {
    const base = this.base?.approved ? this.base.score : 0
    const greenhouse = this.greenhouse.score().total
    return { base, greenhouse, total: base + greenhouse, tasks: this.completed.size }
  }
  get bonus() { return (this.completed.has('water') ? WATER_BONUS : 0) + this.photoBonus + this.cargo('water') }
  report(spot: Spot): SpotReport {
    const rv = this.rover!
    const ground = groundAt(rv, spot.p)
    // shielding panels carried up on the launch protect the habitat: they add to the radiation score (our model)
    const shield = this.cargo('shielding')
    const s = this.samples
    const tubes = s ? { value: s.value, text: `${s.picks.length < TUBE_COUNT ? `${s.picks.length} of ${TUBE_COUNT} tubes` : cacheRating(s.value).word}: ${s.picks.map(id => sampleFacts(id).name).join(', ')}` } : null
    const bars = spotBars(rv, spot.p, this.testsFor(spot), tubes).map(b => b.id !== 'rad' || b.score === null || !shield ? b
      : { ...b, score: Math.min(100, b.score + shield), value: `${b.value} · +${shield} from the shielding panels`, model: `${b.model} Shielding panels carried up add ${shield} (our model).` })
    const score = siteScore(bars, this.bonus)
    const v = verdict(bars, score, ground)
    return { spot, name: `Spot ${spot.label}`, ground, bars, score, verdict: v, stars: starsFor(score, true, v.level) }
  }
  reports(): SpotReport[] { return this.spots.map(s => this.report(s)) }

  /** Build the base on any spot the rover has stopped at, good or bad, or stay in orbit. */
  decideBase(id: number | 'defer'): string | null {
    if (!this.rover) return 'Choose a rover first.'
    const held = this.held()
    if (held) return held
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
    // the rocket that carried the rover
    const del = this.delivery
    if (del) {
      const k = deliveryRocket(del.rocket)
      out.push(del.ok
        ? { good: true, text: `${k.name} carried ${rv.name} to Mars for ${k.price} cr. Our model gave it a ${k.successPct}% chance.` }
        : { good: false, text: `The ${k.name} launch failed: our model gave it a ${100 - k.successPct!}% chance of that. A backup rover flew and ${del.solsLost} Mars days were lost.` })
    }
    // the stuck rover
    const res = this.rescue
    if (res && res.result) {
      const days = `${res.solsUsed} Mars day${res.solsUsed === 1 ? '' : 's'}`, truth = CAUSES[res.cause]
      const read = res.diagnosis === res.cause ? `You read the telemetry right (${truth.name.toLowerCase()})` : res.diagnosis ? `The telemetry showed ${truth.name.toLowerCase()}, not ${CAUSES[res.diagnosis].name.toLowerCase()}` : `The telemetry showed ${truth.name.toLowerCase()}`
      if (res.result === 'clean') out.push({ good: true, text: `Stuck at spot ${res.spot}: ${read}, and ${FIXES[res.tries[0].fix].name.toLowerCase()} freed the rover at the first try, in ${days}.` })
      else if (res.result === 'freed') out.push({ good: false, text: `Stuck at spot ${res.spot}: it took ${res.tries.length} tries and ${days} to free the rover. ${read}: ${truth.sign.toLowerCase()}.` })
      else out.push({ good: false, text: `Stuck at spot ${res.spot}: no fix worked, and the rover was held for ${days}. ${read}: ${truth.sign.toLowerCase()}.` })
      const added = this.wheelWear - res.wearBefore
      if (this.wheelsWorn) out.push({ good: false, text: `Wheel wear reached ${this.wheelWear}%, past the ${WEAR_LIMIT}% limit, so top speed fell to ${Math.round(WORN_SPEED * 100)}% for the rest of the mission.` })
      else out.push({ good: true, text: `The rescue added ${added}% wheel wear (now ${this.wheelWear}%), under the ${WEAR_LIMIT}% limit: full speed kept.` })
    }
    // the sample tubes
    const tubes = this.samples
    if (tubes) {
      const n = tubes.picks.length
      out.push({ good: tubes.value >= 70, text: `${n === TUBE_COUNT ? 'Three tubes' : n === 1 ? 'One tube' : 'Two tubes'} sealed, science value ${tubes.value} of 100: ${tubes.picks.map(id => sampleFacts(id).name).join(', ')}.` })
      if (n < TUBE_COUNT) out.push({ good: false, text: `${TUBE_COUNT - n} tube${TUBE_COUNT - n === 1 ? ' was' : 's were'} never filled: the rover did not reach a site with a rock to put in ${TUBE_COUNT - n === 1 ? 'it' : 'them'}.` })
      const left = ROCK_IDS.filter(id => rock(id).organic && !tubes.picks.includes(id)).length
      if (left) out.push({ good: false, text: `${left === 1 ? 'A rock' : `${left} rocks`} with an organic-like signal stayed behind${tubes.clear ? '' : ': the uncalibrated instrument could not read it'}.` })
      if (tubes.picks.includes('roubion')) out.push({ good: false, text: 'One tube was spent on a crumbling rock and sealed empty.' })
    } else if (this.base?.approved && this.drives.length) out.push({ good: false, text: 'No rock samples: the rover never filled a tube at a sample site, so that check scored 0.' })
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
    if (this.cargo('rack')) out.push({ good: true, text: `Scientific experiment rack (${kgOf('rack')} kg): coring rock samples used 30% less battery${this.cargo('rack') >= 2 ? ', and rock scans read clearly without calibration' : ''}.` })
    if (this.loadout && !cargoKg(this.loadout)) out.push({ good: false, text: 'The launch carried no station cargo.' })
    return out
  }
}
