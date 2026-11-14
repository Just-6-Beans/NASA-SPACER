// One shared calculation for the rover forecast AND the executed pass.
//
// Two inputs are real NASA data and arrive through the plan snapshot:
//   lightMin   one-way Earth to Mars light time on the operations date (JPL Horizons)
//   nightLowC  night-time low for that Mars season (Curiosity REMS, Gale Crater)
// Everything this file does with them (the relay hand-off, the heater draw, the durations,
// the battery points and the ice reading) is our model.
import {
  BALANCE_SAVING, CALIBRATED_CUT, DUST_DEADLINE, FILTER_CUT, HEATER_FREE_C, ICE_ESTIMATE, INSTRUMENTS, MIN_UNCERTAINTY,
  RESERVE_FLOOR, ROUTES, SCANS, STRONG_LOW_END, UNCALIBRATED_PENALTY, byId,
  type InstrumentId, type RouteId, type ScanId,
} from './data'
import { fastRelay, powerBlock, researchFilter, signalLeg, type Power } from './power'

export type CommandKind = 'drive' | 'scan' | 'return'
/** Every pass is these three commands, in this order. */
export const SEQUENCE: CommandKind[] = ['drive', 'scan', 'return']
export const COMMAND_LABEL: Record<CommandKind, string> = { drive: 'Drive', scan: 'Scan', return: 'Return' }

export interface PlanSnapshot {
  /** Operations date (YYYY-MM-DD), kept for the log and the report. */
  date: string
  /** One-way light time on that date, in minutes. Real: JPL Horizons. */
  lightMin: number
  /** Night-time low for that Mars season, in degrees C. Real: Curiosity REMS, Gale Crater. */
  nightLowC: number
  /** Relay hand-off added to each signal leg, in minutes. A simulated ship property, longer if the relay is patched. */
  handoffMin: number
  /** True when that hand-off includes the penalty of a patched, not repaired, relay. */
  relayPatched?: boolean
  startBattery: number
  power: Power
  instrument: InstrumentId
  calibrated: boolean
  route: RouteId
  scan: ScanId
  balanced: boolean
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
  /** Battery points the heaters used overnight, before the pass. */
  heaterDraw: number
  /** Charge the rover wakes with: cradle charge minus the heater draw. */
  wakeBattery: number
  commands: CommandResult[]
  reading: IceReading | null
  readingAt: number | null
  safeMode: { at: number; arriveAt: number; battery: number } | null
  finalBattery: number
  finalTelemetryAt: number
  returned: boolean
  legDraw: number
  scanDraw: number
  /** Battery points the plan needed beyond what was available above the reserve. 0 when the rover gets home. */
  shortfall: number
}

const round = (n: number) => Math.round(n * 1000) / 1000
export const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
/** A temperature with a real minus sign, for example "−79 °C". */
export const fmtTemp = (c: number) => `${c < 0 ? '−' : ''}${Math.abs(c)} °C`

/** Our model: one battery point for each degree the night low sits below HEATER_FREE_C. */
export const heaterDraw = (nightLowC: number) => Math.max(0, Math.round(HEATER_FREE_C - nightLowC))

export function uncertaintyFor(instrument: InstrumentId, calibrated: boolean, power: Power, scan: ScanId) {
  let u = byId(INSTRUMENTS, instrument).baseUncertainty
  u += calibrated ? -CALIBRATED_CUT : UNCALIBRATED_PENALTY
  if (researchFilter(power)) u -= FILTER_CUT
  u -= byId(SCANS, scan).uncertaintyCut
  return Math.max(MIN_UNCERTAINTY, u)
}

export function reading(uncertainty: number): IceReading {
  const low = ICE_ESTIMATE - uncertainty
  return { estimate: ICE_ESTIMATE, uncertainty, low, high: ICE_ESTIMATE + uncertainty, strong: low >= STRONG_LOW_END }
}

/** Plays the whole pass forward. Uses only the snapshot, so forecast and execution agree. */
export function simulatePass(s: PlanSnapshot): PassResult {
  const leg = signalLeg(s.lightMin, s.handoffMin, s.power)
  const route = byId(ROUTES, s.route)
  const scan = byId(SCANS, s.scan)
  const inst = byId(INSTRUMENTS, s.instrument)
  const legDraw = route.legDraw - (s.balanced ? BALANCE_SAVING : 0)
  const scanDraw = inst.quickDraw + scan.extraDraw
  // Heaters never take the pack below the reserve.
  const wakeBattery = Math.max(Math.min(RESERVE_FLOOR, s.startBattery), s.startBattery - heaterDraw(s.nightLowC))
  const plan: { kind: CommandKind; minutes: number; draw: number }[] = [
    { kind: 'drive', minutes: route.legMin, draw: legDraw },
    { kind: 'scan', minutes: scan.minutes, draw: scanDraw },
    { kind: 'return', minutes: route.legMin, draw: legDraw },
  ]
  let t = leg // Drive starts after one uplink leg.
  let battery = wakeBattery
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
      const end = round(t + step.minutes)
      const next = battery - step.draw
      commands.push({ kind: step.kind, start: t, end, batteryStart: battery, batteryEnd: next, fraction: 1, status: 'complete', telemetryAt: round(end + leg) })
      if (step.kind === 'scan') {
        readingResult = reading(uncertaintyFor(s.instrument, s.calibrated, s.power, s.scan))
        readingAt = round(end + leg)
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
  const shortfall = Math.max(0, legDraw * 2 + scanDraw - (wakeBattery - RESERVE_FLOOR))
  return {
    uplink: leg, downlink: leg, heaterDraw: s.startBattery - wakeBattery, wakeBattery,
    commands, reading: readingResult, readingAt, safeMode,
    finalBattery: battery, finalTelemetryAt, returned: !stopped, legDraw, scanDraw, shortfall,
  }
}

export interface ForecastWarning { level: 'warn' | 'danger'; text: string }

export function forecastWarnings(s: PlanSnapshot, r: PassResult): ForecastWarning[] {
  const w: ForecastWarning[] = []
  const block = powerBlock(s.power)
  if (block) w.push({ level: 'danger', text: block })
  if (r.safeMode) {
    const kind = r.commands.find(c => c.status === 'partial')!.kind
    w.push({ level: 'danger', text: `Reserve risk: the rover runs ${r.shortfall}% short of battery, hits the ${RESERVE_FLOOR}% reserve during ${COMMAND_LABEL[kind]} and stops in safe mode. Ares Shelf needs the rover back at base.` })
  }
  if (r.finalTelemetryAt >= DUST_DEADLINE) w.push({ level: 'danger', text: `Dust front: final telemetry at T+${fmt(r.finalTelemetryAt)} arrives after the T+${DUST_DEADLINE} deadline for Ares Shelf.` })
  if (!r.reading) w.push({ level: 'warn', text: 'No ice reading: the scan does not finish.' })
  else if (!r.reading.strong) w.push({ level: 'warn', text: `Weak evidence expected: low end ${r.reading.low}% is below ${STRONG_LOW_END}%.` })
  if (!s.calibrated) w.push({ level: 'warn', text: `Instrument uncalibrated: the ice reading is ±${UNCALIBRATED_PENALTY} looser.` })
  return w
}

// ---- Debrief: which choices caused the outcome ---------------------------
export interface Cause {
  topic: 'clock' | 'battery' | 'evidence'
  /** True when this part of the pass went well enough for an Ares Shelf landing. */
  ok: boolean
  headline: string
  /** The choices and inputs behind the headline, with their numbers. */
  parts: string[]
}

export function passCauses(s: PlanSnapshot, r: PassResult): Cause[] {
  const route = byId(ROUTES, s.route)
  const scan = byId(SCANS, s.scan)
  const inst = byId(INSTRUMENTS, s.instrument)
  const handoff = fastRelay(s.power) ? 0 : s.handoffMin
  const late = r.finalTelemetryAt >= DUST_DEADLINE
  const gap = fmt(round(Math.abs(DUST_DEADLINE - r.finalTelemetryAt)))
  const stoppedAt = r.commands.find(c => c.status === 'partial')
  const margin = r.finalBattery - RESERVE_FLOOR
  const rd = r.reading
  const filter = researchFilter(s.power)
  const raw = inst.baseUncertainty + (s.calibrated ? -CALIBRATED_CUT : UNCALIBRATED_PENALTY) - (filter ? FILTER_CUT : 0) - scan.uncertaintyCut
  return [
    {
      topic: 'clock', ok: !late,
      headline: `Final telemetry at T+${fmt(r.finalTelemetryAt)}, ${gap} min ${late ? 'after' : 'ahead of'} the dust front (T+${DUST_DEADLINE}).`,
      parts: [
        `Signal delay: ${fmt(r.uplink)} min each way = light time ${fmt(s.lightMin)} min + ${handoff ? `relay hand-off ${handoff} min${s.relayPatched ? ' (patched relay)' : ''}` : 'no hand-off (direct link)'}`,
        `${route.name}: ${route.legMin} min each way`,
        `${scan.name}: ${scan.minutes} min`,
      ],
    },
    {
      topic: 'battery', ok: r.returned,
      headline: stoppedAt
        ? `Rover stopped at the ${RESERVE_FLOOR}% reserve during ${COMMAND_LABEL[stoppedAt.kind]}: the plan needed ${r.shortfall}% more battery.`
        : `Rover back at base with ${r.finalBattery}%, ${margin}% above the ${RESERVE_FLOOR}% reserve.`,
      parts: [
        `Starting charge: ${s.startBattery}%`,
        `Night heaters: ${r.heaterDraw}% for a ${fmtTemp(s.nightLowC)} night`,
        `${route.name}: ${r.legDraw}% each way${s.balanced ? ' (balanced pack)' : ''}`,
        `${scan.name} with ${inst.code}: ${r.scanDraw}%`,
      ],
    },
    {
      topic: 'evidence', ok: !!rd?.strong,
      headline: rd
        ? `Ice reading ${rd.estimate}% ±${rd.uncertainty}: low end ${rd.low}% ${rd.strong ? 'meets' : 'is below'} the ${STRONG_LOW_END}% threshold.`
        : 'No ice reading: the scan did not finish.',
      parts: [
        `${inst.code} starts at ±${inst.baseUncertainty}`,
        s.calibrated ? `Calibration: ±${CALIBRATED_CUT} tighter` : `No calibration: ±${UNCALIBRATED_PENALTY} looser`,
        scan.uncertaintyCut ? `${scan.name}: ±${scan.uncertaintyCut} tighter` : `${scan.name}: no gain`,
        filter ? `Research filter: ±${FILTER_CUT} tighter` : 'Research filter: off',
        ...(raw < MIN_UNCERTAINTY ? [`Never better than ±${MIN_UNCERTAINTY}`] : []),
      ],
    },
  ]
}

// ---- Clock / event timeline -------------------------------------------
export type TimelineEvent =
  | { t: number; type: 'uplink'; text: string }
  | { t: number; type: 'exec-start' | 'exec-end'; index: number; text: string }
  | { t: number; type: 'telemetry'; index: number; text: string }
  | { t: number; type: 'safe-mode'; text: string }

export function timeline(r: PassResult): TimelineEvent[] {
  const ev: TimelineEvent[] = [{ t: r.uplink, type: 'uplink', text: `Commands reach Mars after ${fmt(r.uplink)} min. Rover wakes at ${r.wakeBattery}%${r.heaterDraw ? `: night heaters used ${r.heaterDraw}%` : ''}.` }]
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
