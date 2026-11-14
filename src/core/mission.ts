// Mission state and rules. Plain TypeScript: runs in Node tests, the browser, and shares
// validation with the co-op server.
import { OPS_DATES, lightTimeSource, opsDate, weatherSource, type OpsDate } from '../data/opsDates'
import {
  CARGO_REWARD, DUST_DEADLINE, INSTRUMENTS, KIT_COST, PATCH_HANDOFF, PREP_HOURS, RESERVE_FLOOR, ROUTES, SCANS, SHIPS, SITES, STRONG_LOW_END, SURVEY_DRAW,
  WATER_COST, WATER_DISCOUNT, byId,
  type InstrumentId, type RouteId, type ScanId, type ShipId, type SiteId, type SuitId,
} from './data'
import { DEFAULT_POWER, powerBlock, validPower, type Power } from './power'
import {
  passCauses, simulatePass, timeline, type Cause, type PassResult, type PlanSnapshot, type TimelineEvent, fmt, fmtTemp,
} from './rover'
import type { TaskId } from './tasks'

export interface Profile { callSign: string; suit: SuitId; ship: ShipId }

export const cleanCallSign = (raw: string) => {
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, 20).trim()
  return s || 'Pilot'
}

export interface LogEntry { at: string; text: string; kind: 'task' | 'mission' | 'rover' | 'alert' | 'landing' }

export interface LandingOutcome {
  site: SiteId | 'defer'
  approved: boolean
  reason: string
  spent: number
  decidedAt: number
  importedWater: boolean
}

export interface SiteAssessment {
  site: SiteId
  status: 'clear' | 'needs-water' | 'closed' | 'held' | 'needs-package'
  canLand: boolean
  cost: number
  reason: string
  action: string
}

export const TASK_INFO: Record<TaskId, { name: string; group: 'Routine' | 'Mission' | 'Emergency'; where: string; reward: string }> = {
  battery: { name: 'Battery balancing', group: 'Routine', where: 'Power Grid', reward: 'Each drive uses 3% less rover battery' },
  cargo: { name: 'Cargo reconciliation', group: 'Routine', where: 'Payload', reward: '+5 credits' },
  water: { name: 'Water purification', group: 'Routine', where: 'Hab Systems', reward: 'Imported water costs 8 cr less' },
  medical: { name: 'Crew medical check', group: 'Routine', where: 'Hab Systems', reward: 'Clears the crew to commission the habitat' },
  calibration: { name: 'Two-point calibration', group: 'Mission', where: 'Calibration', reward: 'Ice reading ±5 tighter (skipped: ±9 looser)' },
  relay: { name: 'Full relay repair', group: 'Emergency', where: 'Rover Comms', reward: 'Relay hand-off stays at its normal length' },
  habitat: { name: 'Habitat commissioning', group: 'Mission', where: 'Mission Report', reward: 'Crew quarters on Mars' },
}

/**
 * Crew-hours each task takes (our model). The station has PREP_HOURS in all, so the crew cannot
 * do everything: which preparation to do is a decision. Commissioning the habitat happens on
 * Mars after landing and takes none.
 */
export const PREP_COST: Record<TaskId, number> = { battery: 1, cargo: 1, water: 1, medical: 1, calibration: 1, relay: 1, habitat: 0 }

export class Mission {
  profile: Profile
  instrumentDraft: InstrumentId | null = null
  instrument: InstrumentId | null = null
  payloadActive = false
  power: Power = { ...DEFAULT_POWER }
  completed = new Set<TaskId>()
  relayFault = false
  /** The relay was patched rather than repaired: usable, but its hand-off is PATCH_HANDOFF minutes longer. */
  relayPatched = false
  calibrated = false
  /** Operations date for the rover pass (YYYY-MM-DD). Null until the player picks one. */
  opsDate: string | null = null
  route: RouteId = 'ridge'
  scan: ScanId = 'quick'
  plan: PlanSnapshot | null = null
  pass: PassResult | null = null
  events: TimelineEvent[] = []
  processed = 0
  clock = 0
  landing: LandingOutcome | null = null
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
    if (this.pass) return `T+${fmt(this.clock)}`
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
  get funds() { return this.credits - (this.landing?.spent ?? 0) }

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
  /** Crew-hours already spent on preparation tasks. */
  get prepSpent() { return [...this.completed].reduce((a, t) => a + PREP_COST[t], 0) }
  /** Crew-hours still free. Each preparation task takes one. */
  get prepLeft() { return PREP_HOURS - this.prepSpent }
  /** Why a task cannot be paid for, or null when there are crew-hours for it. */
  prepBlock(task: TaskId): string | null {
    if (this.completed.has(task) || PREP_COST[task] <= this.prepLeft) return null
    return `No crew-hours left: all ${PREP_HOURS} went to other preparation.`
  }
  /** Marks a task complete once. Returns false if already rewarded, or if no crew-hours are left for it. */
  complete(task: TaskId, detail: string): boolean {
    if (this.completed.has(task) || this.prepBlock(task)) return false
    this.completed.add(task)
    if (task === 'relay') { this.relayFault = false; this.relayPatched = false }
    if (task === 'calibration') this.calibrated = true
    this.note(`${TASK_INFO[task].name} complete — ${detail}`, 'task')
    return true
  }
  taskAvailable(task: TaskId): string | null {
    if (task === 'calibration' && !this.payloadActive) return 'Activate a payload instrument first.'
    if (task === 'relay' && !this.completed.has('relay')) {
      if (!this.relayFault && !this.relayPatched) return 'Relay is nominal.'
      if (this.pass) return 'The pass was already sent over the patched relay.'
    }
    if (task === 'habitat') {
      if (!this.landing?.approved) return 'Needs an approved landing.'
      if (!this.completed.has('medical')) return 'The crew has no medical clearance: the Hab Systems medical check was not done.'
    }
    return this.prepBlock(task)
  }

  // ---- Relay -------------------------------------------------------------
  /**
   * The quick fix for the relay fault: free and instant, but a patched relay adds PATCH_HANDOFF
   * minutes to its hand-off. A direct link never uses the relay, so it loses nothing. The full
   * repair is the 'relay' task, which takes a crew-hour instead.
   */
  patchRelay(): string | null {
    if (!this.relayFault) return this.relayPatched ? 'The relay is already patched.' : 'Relay is nominal.'
    this.relayFault = false
    this.relayPatched = true
    this.note(`Relay patched: link restored, hand-off ${this.ship.handoffMin + PATCH_HANDOFF} min instead of ${this.ship.handoffMin}.`, 'task')
    return null
  }
  /** Minutes the relay adds to each signal as it stands: the ship's hand-off, plus the patch if there is one. */
  get handoffMin() { return this.ship.handoffMin + (this.relayPatched ? PATCH_HANDOFF : 0) }

  // ---- Rover plan --------------------------------------------------------
  /** The NASA data for the chosen operations date, or null before the player picks. */
  get ops(): OpsDate | null { return this.opsDate ? opsDate(this.opsDate) : null }
  setOpsDate(id: string): string | null {
    if (this.pass) return 'The plan is already transmitted.'
    if (!OPS_DATES.some(d => d.id === id)) return 'That operations date is not on offer.'
    this.opsDate = id
    return null
  }
  /** The plan as it stands. Null until an instrument and an operations date are chosen. */
  snapshot(): PlanSnapshot | null {
    const d = this.ops
    if (!this.instrument || !d) return null
    return {
      date: d.id, lightMin: d.lightMin, nightLowC: d.weather.minAirTemp, handoffMin: this.handoffMin, relayPatched: this.relayPatched,
      startBattery: this.ship.battery, power: { ...this.power },
      instrument: this.instrument, calibrated: this.calibrated, route: this.route, scan: this.scan,
      balanced: this.completed.has('battery'),
    }
  }
  forecast(): PassResult | null {
    const s = this.snapshot()
    return s ? simulatePass(s) : null
  }
  roverAccess(): string | null {
    if (!this.payloadActive) return 'Activate the payload at the Payload terminal first.'
    if (this.relayFault) return 'Relay fault: patch or repair the relay before the planner can reach Mars.'
    return null
  }
  transmitBlock(): string | null {
    if (this.pass) return 'One rover pass per mission. Fly again to try another plan.'
    const access = this.roverAccess()
    if (access) return access
    if (!this.opsDate) return 'Choose an operations date first.'
    return powerBlock(this.power)
  }
  transmit(): string | null {
    const block = this.transmitBlock()
    if (block) return block
    const d = this.ops!
    this.plan = this.snapshot()!
    this.pass = simulatePass(this.plan)
    this.events = timeline(this.pass)
    this.clock = 0
    this.processed = 0
    this.note(`Plan transmitted at T+0 for ${d.label}: Drive → Scan → Return via ${byId(ROUTES, this.route).name}, ${byId(SCANS, this.scan).name.toLowerCase()}, power ${this.power.life}/${this.power.comms}/${this.power.research}. Signal delay ${fmt(this.pass.uplink)} min each way (light time ${fmt(d.lightMin)} min: ${lightTimeSource(d)}). Night low ${fmtTemp(d.weather.minAirTemp)} (${weatherSource(d)}): heaters used ${this.pass.heaterDraw}% of the battery.`, 'rover')
    return null
  }
  /** Which choices caused the rover outcome, with their numbers. Empty before transmission. */
  get causes(): Cause[] { return this.plan && this.pass ? passCauses(this.plan, this.pass) : [] }

  get finalTelemetryAt() { return this.pass?.finalTelemetryAt ?? Infinity }
  get passDone() { return !!this.pass && this.clock >= this.pass.finalTelemetryAt }
  /** Scan evidence visible on Earth (only after its downlink arrives). */
  get receivedReading() {
    if (!this.pass?.reading || this.pass.readingAt === null) return null
    return this.clock >= this.pass.readingAt ? this.pass.reading : null
  }

  /** Advance the clock to t, processing crossed events once each, in order. Returns the new events. */
  advanceTo(t: number): TimelineEvent[] {
    if (!this.pass) return []
    const target = Math.min(Math.max(t, this.clock), this.pass.finalTelemetryAt)
    const fired: TimelineEvent[] = []
    while (this.processed < this.events.length && this.events[this.processed].t <= target) {
      const e = this.events[this.processed++]
      fired.push(e)
      if (e.type === 'telemetry' || e.type === 'safe-mode') this.log.push({ at: `T+${fmt(e.t)}`, text: e.text, kind: 'rover' })
    }
    this.clock = target
    return fired
  }
  nextEventTime(): number | null {
    if (!this.pass) return null
    const e = this.events.find((ev, i) => i >= this.processed && ev.t > this.clock) ?? this.events[this.processed]
    return e ? e.t : null
  }

  // ---- Landing -----------------------------------------------------------
  get waterCost() { return WATER_COST - (this.completed.has('water') ? WATER_DISCOUNT : 0) }

  assess(site: SiteId): SiteAssessment {
    const funds = this.funds
    const reading = this.receivedReading
    if (site === 'hollow') {
      // Our model: shaded, so it runs on a backup power kit and has no dust deadline. The rover
      // must survey the loose slope with the battery it has left, and only a strong shelf reading
      // stands in for ice here; otherwise the crew imports water.
      if (!this.pass?.returned) return { site, status: 'held', canLand: false, cost: 0, reason: `The loose slopes need a rover survey first, and the rover stopped in safe mode at the ${RESERVE_FLOOR}% reserve. A landing at Eos Hollow is held.`, action: 'Held: rover in safe mode' }
      const spare = this.pass.finalBattery - RESERVE_FLOOR
      if (spare < SURVEY_DRAW) return { site, status: 'held', canLand: false, cost: 0, reason: `The slope survey needs ${SURVEY_DRAW}% of rover battery above the ${RESERVE_FLOOR}% reserve. The rover came home with ${this.pass.finalBattery}%, only ${spare}% to spare. A landing at Eos Hollow is held.`, action: 'Held: no battery for the slope survey' }
      const water = reading?.strong ? 0 : this.waterCost
      const cost = KIT_COST + water
      const can = cost <= funds
      const ice = reading?.strong ? `The strong reading at the shelf (low end ${reading.low}%) counts for the ice here` : `Without a strong reading the crew imports water (${water} cr)`
      return { site, status: 'needs-package', canLand: can, cost, reason: `Shaded, so the dust front does not close it. The rover has ${spare}% to spare for the slope survey. ${ice}. Backup power kit ${KIT_COST} cr${water ? `, ${cost} cr in all` : ''}. ${can ? `Affordable with ${funds} cr.` : `Only ${funds} cr available.`}`, action: `Land with ${water ? 'package' : 'power kit'} · ${cost} cr` }
    }
    if (site === 'plain') {
      const cost = this.waterCost + KIT_COST
      const can = cost <= funds
      return { site, status: 'needs-package', canLand: can, cost, reason: `Stable terrain but no local water. Needs imported water (${this.waterCost} cr${this.completed.has('water') ? ', purifier discount applied' : ''}) and a dust-rated power kit (${KIT_COST} cr) = ${cost} cr. ${can ? `Affordable with ${funds} cr.` : `Only ${funds} cr available.`}`, action: `Land with package · ${cost} cr` }
    }
    if (this.clock >= DUST_DEADLINE) return { site, status: 'closed', canLand: false, cost: 0, reason: `The dust front closed the solar landing window at T+${DUST_DEADLINE}. Final telemetry arrived at T+${fmt(this.finalTelemetryAt)}. Good evidence or imported water cannot reopen it.`, action: 'Window closed' }
    if (this.pass && !this.pass.returned) return { site, status: 'held', canLand: false, cost: 0, reason: `The rover stopped in safe mode at the ${RESERVE_FLOOR}% reserve and never got back to the relay base, so it cannot mark the landing zone. A landing at Ares Shelf is held.`, action: 'Held: rover in safe mode' }
    if (reading?.strong) return { site, status: 'clear', canLand: true, cost: 0, reason: `Received ice ${reading.estimate}% ±${reading.uncertainty}: low end ${reading.low}% meets the ${STRONG_LOW_END}% threshold. Rover back at base, level bedrock, open solar window until T+${DUST_DEADLINE}.`, action: 'Land at Ares Shelf' }
    const cost = this.waterCost
    const can = cost <= funds
    const why = reading ? `Received ice low end ${reading.low}% is below ${STRONG_LOW_END}%` : 'No ice reading was received'
    return { site, status: 'needs-water', canLand: can, cost, reason: `${why}. The shelf can still be cleared by budgeting imported water (${cost} cr). ${can ? `Affordable with ${funds} cr.` : `Only ${funds} cr available.`}`, action: `Land with imported water · ${cost} cr` }
  }

  landingBlock(): string | null {
    if (!this.pass) return 'Transmit a rover plan first.'
    if (!this.passDone) return 'Wait for the final telemetry before choosing a site.'
    if (this.landing) return 'Landing decision already made.'
    return null
  }

  decideLanding(site: SiteId | 'defer'): string | null {
    const block = this.landingBlock()
    if (block) return block
    if (site === 'defer') {
      this.landing = { site, approved: false, reason: 'Crew stays in orbit. No surface commitment while evidence or margins are insufficient.', spent: 0, decidedAt: this.clock, importedWater: false }
      this.note('Landing deferred: crew remains in orbit.', 'landing')
      return null
    }
    const a = this.assess(site)
    if (!a.canLand) return a.reason
    this.landing = { site, approved: true, reason: a.reason, spent: a.cost, decidedAt: this.clock, importedWater: a.status === 'needs-water' || site === 'plain' || (site === 'hollow' && a.cost > KIT_COST) }
    this.note(`Landing approved at ${byId(SITES, site).name} (T+${fmt(this.clock)}). Spent ${a.cost} cr.`, 'landing')
    return null
  }
}
