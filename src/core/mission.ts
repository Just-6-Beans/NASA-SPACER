// Mission state and rules. Plain TypeScript: runs in Node tests, the browser, and shares
// validation with the co-op server.
import {
  CARGO_REWARD, DUST_DEADLINE, INSTRUMENTS, KIT_COST, SHIPS, SITES, WATER_COST, WATER_DISCOUNT, byId,
  type InstrumentId, type RouteId, type ScanId, type ShipId, type SiteId, type SuitId,
} from './data'
import { DEFAULT_POWER, powerBlock, validPower, type Power } from './power'
import {
  queueError, simulatePass, timeline, type CommandKind, type PassResult, type PlanSnapshot, type TimelineEvent, fmt,
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
  battery: { name: 'Battery balancing', group: 'Routine', where: 'Power Grid', reward: 'Saves 3 battery points per driving leg' },
  cargo: { name: 'Cargo reconciliation', group: 'Routine', where: 'Payload', reward: '+5 supply credits' },
  water: { name: 'Water purification', group: 'Routine', where: 'Hab Systems', reward: 'Imported water costs 8 cr less' },
  medical: { name: 'Crew medical check', group: 'Routine', where: 'Hab Systems', reward: 'Clearance for habitat commissioning' },
  calibration: { name: 'Two-point calibration', group: 'Mission', where: 'Calibration', reward: '−5 uncertainty (skip: +9)' },
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
  route: RouteId = 'ridge'
  scan: ScanId = 'quick'
  queue: CommandKind[] = []
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
      if (!this.landing?.approved) return 'Needs an approved landing.'
      if (!this.completed.has('medical')) return 'Crew medical clearance was skipped: complete the Hab Systems medical check before commissioning.'
    }
    return null
  }

  // ---- Rover plan --------------------------------------------------------
  snapshot(): PlanSnapshot | null {
    if (!this.instrument) return null
    return {
      relayMin: this.ship.relayMin, startBattery: this.ship.battery, power: { ...this.power },
      instrument: this.instrument, calibrated: this.calibrated, route: this.route, scan: this.scan,
      balanced: this.completed.has('battery'), queue: [...this.queue],
    }
  }
  forecast(): PassResult | null {
    const s = this.snapshot()
    return s ? simulatePass(s) : null
  }
  roverAccess(): string | null {
    if (!this.payloadActive) return 'Activate the payload at the Payload terminal first.'
    if (this.relayFault) return 'Relay fault: repair the relay before the planner can reach Mars.'
    return null
  }
  transmitBlock(): string | null {
    if (this.pass) return 'One rover pass per run. Use replay to try another strategy.'
    const access = this.roverAccess()
    if (access) return access
    return powerBlock(this.power) ?? queueError(this.queue)
  }
  transmit(): string | null {
    const block = this.transmitBlock()
    if (block) return block
    this.plan = this.snapshot()!
    this.pass = simulatePass(this.plan)
    this.events = timeline(this.pass)
    this.clock = 0
    this.processed = 0
    this.note(`Plan transmitted at T+0: ${this.queue.join(' → ')} via ${this.route === 'ridge' ? 'Ridge bypass' : 'Basin shortcut'}, ${this.scan === 'deep' ? 'deep scan' : 'quick sweep'}, power ${this.power.life}/${this.power.comms}/${this.power.research}. Signal leg ${this.pass.uplink} min.`, 'rover')
    return null
  }

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
    if (site === 'hollow') return { site, status: 'held', canLand: false, cost: 0, reason: 'Ice is plausible but unverified, the slopes are loose, and solar power is weak. Landing is held until a slope survey and backup power are available.', action: 'Held' }
    if (site === 'plain') {
      const cost = this.waterCost + KIT_COST
      const can = cost <= funds
      return { site, status: 'needs-package', canLand: can, cost, reason: `Stable terrain but no local water. Needs imported water (${this.waterCost} cr${this.completed.has('water') ? ', purifier discount applied' : ''}) and a dust-rated power kit (${KIT_COST} cr) = ${cost} cr. ${can ? `Affordable with ${funds} cr.` : `Only ${funds} cr available.`}`, action: `Land with package · ${cost} cr` }
    }
    if (this.clock >= DUST_DEADLINE) return { site, status: 'closed', canLand: false, cost: 0, reason: `The dust front closed the solar landing window at T+${DUST_DEADLINE}. Final telemetry arrived at T+${fmt(this.finalTelemetryAt)}. Good evidence or imported water cannot reopen it.`, action: 'Window closed' }
    if (reading?.strong) return { site, status: 'clear', canLand: true, cost: 0, reason: `Received ice ${reading.estimate}% ±${reading.uncertainty}: low end ${reading.low}% meets the 22% threshold. Level bedrock, open solar window until T+${DUST_DEADLINE}.`, action: 'Land at Ares Shelf' }
    const cost = this.waterCost
    const can = cost <= funds
    const why = reading ? `Received ice low end ${reading.low}% is below 22%` : 'No ice reading was received'
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
    this.landing = { site, approved: true, reason: a.reason, spent: a.cost, decidedAt: this.clock, importedWater: a.status === 'needs-water' || site === 'plain' }
    this.note(`Landing approved at ${byId(SITES, site).name} (T+${fmt(this.clock)}). Spent ${a.cost} cr.`, 'landing')
    return null
  }
}
