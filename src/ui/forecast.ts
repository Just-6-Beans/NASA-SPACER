// What the mission's own rules say the rover pass would do, for screens that show it before
// the plan is transmitted. Nothing is recomputed here: the mission builds its plan snapshot and
// simulatePass() plays it, exactly as the rover planner and the executed pass do. So when the
// rules change what a plan needs or how a signal leg is timed, these follow without an edit.
import { INSTRUMENTS, type InstrumentId } from '../core/data'
import { Mission } from '../core/mission'
import { simulatePass, type PassResult, type PlanSnapshot } from '../core/rover'

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
