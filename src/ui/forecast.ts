// What the mission's own rules say the rover pass would do, for screens that show it before
// the plan is transmitted. Nothing is recomputed here: the mission builds its plan snapshot and
// simulatePass() plays it, exactly as the rover planner and the executed pass do. So when the
// rules change what a plan needs or how a signal leg is timed, these follow without an edit.
//
// The same goes for the plain-language read-outs below (the three lights, the one-line verdict,
// the "what would change it" suggestions): each one only asks the rules what a plan does.
import { DUST_DEADLINE, INSTRUMENTS, PATCH_HANDOFF, ROUTES, SCANS, STRONG_LOW_END, type InstrumentId } from '../core/data'
import { Mission } from '../core/mission'
import { fastRelay, researchFilter, type Power } from '../core/power'
import { COMMAND_LABEL, fmt, passCauses, simulatePass, type PassResult, type PlanSnapshot } from '../core/rover'
import { OPS_DATES } from '../data/opsDates'
import { esc } from './dom'

export interface Forecast { plan: PlanSnapshot; pass: PassResult }

/**
 * The plan and pass this design would produce with the given instrument, or null while the
 * plan still lacks something the rules need. The instrument does not have to be activated yet:
 * a copy of the mission is asked for its snapshot as if it were. `whatIf` changes other fields
 * on that copy, for example the operations date, to compare options without touching the mission.
 */
export function forecastPlan(m: Mission, inst: InstrumentId, whatIf: Partial<Mission> = {}): Forecast | null {
  const probe: Mission = Object.assign(Object.create(Mission.prototype), m, { instrument: inst }, whatIf)
  const plan = probe.snapshot()
  return plan ? { plan, pass: simulatePass(plan) } : null
}

export const forecastFor = (m: Mission, inst: InstrumentId): PassResult | null => forecastPlan(m, inst)?.pass ?? null

/** One-way signal delay in minutes as the plan stands, or null if the rules cannot say yet. */
export function linkMinutes(m: Mission): number | null {
  if (m.pass) return m.pass.uplink
  // the delay does not depend on the instrument, so any one will do for the question
  return forecastFor(m, m.instrument ?? m.instrumentDraft ?? INSTRUMENTS[0].id)?.uplink ?? null
}

// ---- The power split as the two things it can buy ------------------------------------------
/** Ten units cover life support and one of these, not both. */
export const POWER_PRESETS: Record<'direct' | 'filter', Power> = {
  direct: { life: 3, comms: 5, research: 2 },
  filter: { life: 3, comms: 4, research: 3 },
}
export const samePower = (a: Power, b: Power) => a.life === b.life && a.comms === b.comms && a.research === b.research

// ---- Three lights: clock, battery, evidence -------------------------------------------------
export type LightId = 'clock' | 'battery' | 'evidence'
export interface Light { id: LightId; name: string; ok: boolean; short: string; headline: string; parts: string[] }

const round1 = (n: number) => fmt(Math.round(n * 10) / 10)

/** What each light says in a few words, for a plan that has not flown or one that has. */
function shortLines(r: PassResult): Record<LightId, string> {
  const gap = round1(Math.abs(DUST_DEADLINE - r.finalTelemetryAt))
  const stopped = r.commands.find(c => c.status === 'partial')
  return {
    clock: r.finalTelemetryAt < DUST_DEADLINE ? `T+${fmt(r.finalTelemetryAt)} · ${gap} min to spare` : `T+${fmt(r.finalTelemetryAt)} · ${gap} min late`,
    battery: stopped ? `stops ${r.shortfall}% short on ${COMMAND_LABEL[stopped.kind]}` : `home with ${r.finalBattery}%`,
    evidence: r.reading ? `±${r.reading.uncertainty} · ${r.reading.strong ? 'strong' : 'weak'}` : 'no reading',
  }
}

/** The rules' three causes of a pass, each with a short line for a small space. */
export function lights(plan: PlanSnapshot, pass: PassResult): Light[] {
  const short = shortLines(pass)
  const names: Record<LightId, string> = { clock: 'Clock', battery: 'Battery', evidence: 'Evidence' }
  return passCauses(plan, pass).map(c => ({ id: c.topic, name: names[c.topic], ok: c.ok, short: short[c.topic], headline: c.headline, parts: c.parts }))
}

/** One light: its verdict in a line, with the choices behind it one tap away. `key` keeps it open across redraws. */
export const lightHtml = (l: Light, key = '') => `<details class="light ${l.ok ? 'ok' : 'no'}"${key ? ` data-k="${key}${l.id}"` : ''}><summary><i>${l.ok ? '✓' : '✗'}</i><b>${l.name}</b><span>${esc(l.short)}</span></summary>
  <p>${esc(l.headline)}</p><ul>${l.parts.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`

/** One sentence: does this plan clear Ares Shelf, and if not, what stops it. */
export function verdict(plan: PlanSnapshot, pass: PassResult): { ok: boolean; text: string } {
  const [clock, battery, evidence] = lights(plan, pass)
  const stopped = pass.commands.find(c => c.status === 'partial')
  const problems: string[] = []
  if (!battery.ok) problems.push(`The rover runs ${pass.shortfall}% short of battery and stops during ${stopped ? COMMAND_LABEL[stopped.kind] : 'the pass'}, so Ares Shelf would be held.`)
  if (!clock.ok) problems.push(`The last signal arrives ${round1(pass.finalTelemetryAt - DUST_DEADLINE)} min after the dust front, so Ares Shelf would be closed.`)
  if (!evidence.ok) problems.push(pass.reading ? `The ice reading would be weak: low end ${pass.reading.low}%, and it needs ${STRONG_LOW_END}%.` : 'The scan does not finish, so there is no ice reading.')
  return problems.length
    ? { ok: false, text: problems.join(' ') }
    : { ok: true, text: `This plan clears Ares Shelf: on time, rover home with ${pass.finalBattery}%, strong evidence.` }
}

// ---- What would change the outcome ----------------------------------------------------------
export interface Suggestion { change: string; effect: string; clears: boolean; cost: string }

type Alt = { label: string; patch: Partial<PlanSnapshot>; key: string; hours: number }

function alternatives(plan: PlanSnapshot): Alt[] {
  const a: Alt[] = []
  for (const d of OPS_DATES) if (d.id !== plan.date) a.push({ label: `fly on ${d.label}`, patch: { date: d.id, lightMin: d.lightMin, nightLowC: d.weather.minAirTemp }, key: 'date', hours: 0 })
  for (const r of ROUTES) if (r.id !== plan.route) a.push({ label: `take the ${r.name.toLowerCase()}`, patch: { route: r.id }, key: 'route', hours: 0 })
  for (const s of SCANS) if (s.id !== plan.scan) a.push({ label: `run the ${s.name.toLowerCase()}`, patch: { scan: s.id }, key: 'scan', hours: 0 })
  if (!fastRelay(plan.power)) a.push({ label: 'route power for a direct link', patch: { power: POWER_PRESETS.direct }, key: 'power', hours: 0 })
  if (!researchFilter(plan.power)) a.push({ label: 'route power for the research filter', patch: { power: POWER_PRESETS.filter }, key: 'power', hours: 0 })
  if (!plan.calibrated) a.push({ label: 'calibrate the instrument', patch: { calibrated: true }, key: 'cal', hours: 1 })
  if (!plan.balanced) a.push({ label: 'balance the rover battery', patch: { balanced: true }, key: 'bal', hours: 1 })
  if (plan.relayPatched && !fastRelay(plan.power)) a.push({ label: 'repair the relay fully', patch: { relayPatched: false, handoffMin: plan.handoffMin - PATCH_HANDOFF }, key: 'relay', hours: 1 })
  return a
}

/**
 * Up to `limit` changes to the plan that would have made more of the three lights green,
 * found by flying each alternative through the same pass calculation. One change at a time
 * first; pairs only when no single change helps. Empty when the plan already cleared the shelf.
 */
export function suggestions(plan: PlanSnapshot, pass: PassResult, limit = 3): Suggestion[] {
  const base = lights(plan, pass)
  const baseOk = base.filter(l => l.ok).length
  if (baseOk === base.length) return []
  const alts = alternatives(plan)
  const tryOut = (changes: Alt[]): (Suggestion & { score: number }) | null => {
    const next = Object.assign({}, plan, ...changes.map(c => c.patch)) as PlanSnapshot
    const r = simulatePass(next)
    const now = lights(next, r)
    const ok = now.filter(l => l.ok).length
    if (ok <= baseOk) return null
    const say = (l: Light) => `${l.name.toLowerCase()} ${l.short}`
    const gains = now.filter((l, i) => l.ok && !base[i].ok).map(say)
    const losses = now.filter((l, i) => !l.ok && base[i].ok).map(say)
    const hours = changes.reduce((n, c) => n + c.hours, 0)
    const label = changes.map(c => c.label).join(' and ')
    return {
      change: label[0].toUpperCase() + label.slice(1),
      effect: `${gains.join(', ')}${losses.length ? `, but ${losses.join(', ')}` : ''}`,
      clears: ok === now.length,
      cost: hours ? `${hours} crew-hour${hours === 1 ? '' : 's'}` : '',
      score: ok * 10 - hours - changes.length,
    }
  }
  let found = alts.map(a => tryOut([a])).filter(x => x !== null)
  if (!found.length) {
    found = alts.flatMap((a, i) => alts.slice(i + 1).filter(b => b.key !== a.key).map(b => tryOut([a, b]))).filter(x => x !== null)
  }
  return found.sort((a, b) => b.score - a.score).slice(0, limit).map(({ score: _score, ...s }) => s)
}
