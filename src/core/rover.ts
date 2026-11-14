// One shared calculation for the rover forecast AND the executed pass.
import {
  BALANCE_SAVING, ICE_ESTIMATE, RESERVE_FLOOR, ROUTES, SCANS, STRONG_LOW_END, DUST_DEADLINE, byId,
  type InstrumentId, type RouteId, type ScanId, INSTRUMENTS,
} from './data'
import { powerBlock, researchFilter, signalLeg, type Power } from './power'

export type CommandKind = 'drive' | 'scan' | 'return'
export const COMMAND_ORDER: CommandKind[] = ['drive', 'scan', 'return']
export const COMMAND_LABEL: Record<CommandKind, string> = { drive: 'Drive', scan: 'Scan', return: 'Return' }

export interface PlanSnapshot {
  relayMin: number
  startBattery: number
  power: Power
  instrument: InstrumentId
  calibrated: boolean
  route: RouteId
  scan: ScanId
  balanced: boolean
  queue: CommandKind[]
}

export interface CommandResult {
  kind: CommandKind
  start: number
  end: number
  batteryStart: number
  batteryEnd: number
  /** 1 for complete, 0..1 for a reserve stop, 0 for cancelled. */
  fraction: number
  status: 'complete' | 'partial' | 'cancelled'
  /** When Earth receives this command's telemetry (null if cancelled). */
  telemetryAt: number | null
}

export interface IceReading { estimate: number; uncertainty: number; low: number; high: number; strong: boolean }

export interface PassResult {
  uplink: number
  downlink: number
  commands: CommandResult[]
  reading: IceReading | null
  readingAt: number | null
  safeMode: { at: number; arriveAt: number; battery: number } | null
  finalBattery: number
  finalTelemetryAt: number
  returned: boolean
  legDraw: number
  scanDraw: number
}

export function queueError(queue: CommandKind[]): string | null {
  if (queue.length === 0) return 'Queue Drive, Scan, then Return.'
  for (let i = 0; i < queue.length; i++) {
    if (queue[i] !== COMMAND_ORDER[i]) return `Command ${i + 1} should be ${COMMAND_LABEL[COMMAND_ORDER[i]]}, not ${COMMAND_LABEL[queue[i]]}.`
  }
  if (queue.length < 3) return `Queue is incomplete: add ${COMMAND_ORDER.slice(queue.length).map(k => COMMAND_LABEL[k]).join(' → ')}.`
  if (queue.length > 3) return 'Only one Drive → Scan → Return pass is allowed.'
  return null
}

export function uncertaintyFor(instrument: InstrumentId, calibrated: boolean, power: Power, scan: ScanId) {
  let u = byId(INSTRUMENTS, instrument).baseUncertainty
  u += calibrated ? -5 : 9
  if (researchFilter(power)) u -= 4
  u -= byId(SCANS, scan).uncertaintyCut
  return Math.max(3, u)
}

export function reading(uncertainty: number): IceReading {
  const low = ICE_ESTIMATE - uncertainty
  return { estimate: ICE_ESTIMATE, uncertainty, low, high: ICE_ESTIMATE + uncertainty, strong: low >= STRONG_LOW_END }
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** Plays the whole pass forward. Uses only the snapshot, so forecast and execution agree. */
export function simulatePass(s: PlanSnapshot): PassResult {
  const leg = signalLeg(s.relayMin, s.power)
  const route = byId(ROUTES, s.route)
  const scan = byId(SCANS, s.scan)
  const inst = byId(INSTRUMENTS, s.instrument)
  const legDraw = route.legDraw - (s.balanced ? BALANCE_SAVING : 0)
  const scanDraw = inst.quickDraw + scan.extraDraw
  const plan: { kind: CommandKind; minutes: number; draw: number }[] = [
    { kind: 'drive', minutes: route.legMin, draw: legDraw },
    { kind: 'scan', minutes: scan.minutes, draw: scanDraw },
    { kind: 'return', minutes: route.legMin, draw: legDraw },
  ]
  let t = leg // Drive starts after one uplink leg.
  let battery = s.startBattery
  let stopped = false
  let safeMode: PassResult['safeMode'] = null
  let readingResult: IceReading | null = null
  let readingAt: number | null = null
  const commands: CommandResult[] = []
  for (const step of plan) {
    if (stopped) {
      commands.push({ kind: step.kind, start: t, end: t, batteryStart: battery, batteryEnd: battery, fraction: 0, status: 'cancelled', telemetryAt: null })
      continue
    }
    const affordable = battery - RESERVE_FLOOR
    if (step.draw <= affordable) {
      const end = t + step.minutes
      const next = battery - step.draw
      commands.push({ kind: step.kind, start: t, end, batteryStart: battery, batteryEnd: next, fraction: 1, status: 'complete', telemetryAt: end + leg })
      if (step.kind === 'scan') {
        readingResult = reading(uncertaintyFor(s.instrument, s.calibrated, s.power, s.scan))
        readingAt = end + leg
      }
      t = end
      battery = next
    } else {
      const fraction = Math.max(0, affordable) / step.draw
      const end = round(t + step.minutes * fraction)
      commands.push({ kind: step.kind, start: t, end, batteryStart: battery, batteryEnd: RESERVE_FLOOR, fraction, status: 'partial', telemetryAt: round(end + leg) })
      battery = RESERVE_FLOOR
      safeMode = { at: end, arriveAt: round(end + leg), battery }
      stopped = true
      t = end
    }
  }
  const finalTelemetryAt = Math.max(...commands.map(c => c.telemetryAt ?? 0))
  return {
    uplink: leg, downlink: leg, commands, reading: readingResult, readingAt, safeMode,
    finalBattery: battery, finalTelemetryAt, returned: !stopped, legDraw, scanDraw,
  }
}

export interface ForecastWarning { level: 'warn' | 'danger'; text: string }

export function forecastWarnings(s: PlanSnapshot, r: PassResult): ForecastWarning[] {
  const w: ForecastWarning[] = []
  const block = powerBlock(s.power)
  if (block) w.push({ level: 'danger', text: block })
  if (r.safeMode) w.push({ level: 'danger', text: `Reserve risk: the rover hits the ${RESERVE_FLOOR}% floor during ${COMMAND_LABEL[r.commands.find(c => c.status === 'partial')!.kind]} and stops in safe mode.` })
  else if (r.finalBattery < RESERVE_FLOOR + 10) w.push({ level: 'warn', text: `Thin margin: rover returns with ${r.finalBattery}% (floor ${RESERVE_FLOOR}%).` })
  if (r.finalTelemetryAt >= DUST_DEADLINE) w.push({ level: 'warn', text: `Dust deadline: final telemetry at T+${fmt(r.finalTelemetryAt)} is after the T+${DUST_DEADLINE} Ares Shelf window.` })
  if (r.reading && !r.reading.strong) w.push({ level: 'warn', text: `Weak evidence expected: low end ${r.reading.low}% is below ${STRONG_LOW_END}%.` })
  if (!s.calibrated) w.push({ level: 'warn', text: 'Instrument uncalibrated: +9 points of uncertainty.' })
  return w
}

export const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

// ---- Clock / event timeline -------------------------------------------
export type TimelineEvent =
  | { t: number; type: 'uplink'; text: string }
  | { t: number; type: 'exec-start' | 'exec-end'; index: number; text: string }
  | { t: number; type: 'telemetry'; index: number; text: string }
  | { t: number; type: 'safe-mode'; text: string }

export function timeline(r: PassResult): TimelineEvent[] {
  const ev: TimelineEvent[] = [{ t: r.uplink, type: 'uplink', text: `Command uplink reaches Mars (${fmt(r.uplink)} min one-way).` }]
  r.commands.forEach((c, index) => {
    if (c.status === 'cancelled') return
    const name = COMMAND_LABEL[c.kind]
    ev.push({ t: c.start, type: 'exec-start', index, text: `${name} begins on Mars.` })
    ev.push({ t: c.end, type: 'exec-end', index, text: c.status === 'partial' ? `${name} halted at the ${RESERVE_FLOOR}% reserve floor.` : `${name} complete on Mars.` })
    if (c.status === 'complete' && c.telemetryAt !== null) {
      ev.push({ t: c.telemetryAt, type: 'telemetry', index, text: c.kind === 'scan' && r.reading
        ? `Scan telemetry received: ice ${r.reading.estimate}% ±${r.reading.uncertainty}.`
        : `${name} telemetry received. Battery ${c.batteryEnd}%.` })
    }
  })
  if (r.safeMode) ev.push({ t: r.safeMode.arriveAt, type: 'safe-mode', text: `SAFE MODE downlink: rover stopped at ${r.safeMode.battery}% reserve; remaining commands cancelled.` })
  const order = { uplink: 0, 'exec-end': 1, 'exec-start': 2, telemetry: 3, 'safe-mode': 4 }
  return ev.sort((a, b) => a.t - b.t || order[a.type] - order[b.type])
}

export type CommandStatus = 'queued' | 'executing' | 'downlink' | 'received' | 'cancelled' | 'awaiting'

/** What Earth-side operators know about each command at clock time t. */
export function commandStatus(r: PassResult, index: number, t: number): CommandStatus {
  const c = r.commands[index]
  if (c.status === 'cancelled') return r.safeMode && t >= r.safeMode.arriveAt ? 'cancelled' : t >= c.start ? 'awaiting' : 'queued'
  if (t < c.start) return 'queued'
  if (t < c.end) return 'executing'
  if (c.telemetryAt !== null && t < c.telemetryAt) return 'downlink'
  return 'received'
}

/** Rover position along the route (0 = base, 1 = sample site) and heading at clock t. */
export function roverPosition(r: PassResult, t: number): { along: number; returning: boolean; scanning: boolean } {
  let along = 0
  let returning = false
  let scanning = false
  for (const c of r.commands) {
    if (c.status === 'cancelled' || t < c.start) break
    const span = c.end - c.start
    const p = span <= 0 ? c.fraction : Math.min(1, (t - c.start) / span) * c.fraction
    if (c.kind === 'drive') along = p
    if (c.kind === 'scan') { along = r.commands[0].fraction; scanning = t < c.end }
    if (c.kind === 'return') { along = 1 - p; returning = true }
  }
  return { along, returning, scanning }
}
