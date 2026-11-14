// What the mission's own rules say the rover pass would do, for screens that show it before
// the plan is transmitted. Nothing is recomputed here: the mission builds its plan snapshot and
// simulatePass() plays it, exactly as the rover planner and the executed pass do. So when the
// rules change what a plan needs or how a signal leg is timed, these follow without an edit.
import { INSTRUMENTS, type InstrumentId } from '../core/data'
import { Mission } from '../core/mission'
import { simulatePass, type PassResult } from '../core/rover'

/**
 * The pass this design would produce with the given instrument, or null while the plan still
 * lacks something the rules need. The instrument does not have to be activated yet: a copy of
 * the mission is asked for its snapshot as if it were.
 */
export function forecastFor(m: Mission, inst: InstrumentId): PassResult | null {
  const probe: Mission = Object.assign(Object.create(Mission.prototype), m, { instrument: inst })
  const plan = probe.snapshot()
  return plan ? simulatePass(plan) : null
}

/** One-way signal delay in minutes as the plan stands, or null if the rules cannot say yet. */
export function linkMinutes(m: Mission): number | null {
  if (m.pass) return m.pass.uplink
  // the delay does not depend on the instrument, so any one will do for the question
  return forecastFor(m, m.instrument ?? m.instrumentDraft ?? INSTRUMENTS[0].id)?.uplink ?? null
}
