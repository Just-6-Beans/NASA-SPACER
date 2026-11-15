// The mission score: every task adds points, and the end report lists what was done and what was
// missed. Plain TypeScript, no DOM and no Phaser.
//
// OUR MODEL throughout: what each task is worth is a game rule, not a NASA figure. A task done well
// is worth more than one scraped through, and a task that never came up in this run (an alert, the
// stuck rover) is not counted against the player.
import { powerBlock } from './power'
import type { Mission } from './mission'
import { ALERT_POINTS, SCHEDULE_POINTS, WATER_POINTS, schedulePoints, waterPoints } from './stationTasks'

export type ScoreState = 'done' | 'failed' | 'missed'
export interface ScoreLine {
  id: string
  name: string
  /** Where it is done, in the words the station uses. */
  where: string
  points: number
  max: number
  state: ScoreState
  /** What happened, in a few words. */
  note: string
}
export interface MissionScore {
  total: number
  /** The most this run could have scored. */
  max: number
  lines: ScoreLine[]
  done: ScoreLine[]
  /** Tasks never done, and tasks that ended badly. */
  missed: ScoreLine[]
}

/** Points for things that are simply done or not done. */
export const FLAT_POINTS = { launch: 40, payload: 20, relay: 40, power: 20, calibration: 40, battery: 30, cargo: 30, medical: 30, earth: 10, habitat: 50 }
export const ROCKET_POINTS = 40
export const DRIVE_POINTS = 40
export const RESCUE_POINTS = 60
export const SAMPLE_POINTS = 100
export const BASE_POINTS = 100
export const GREENHOUSE_POINTS = 100
export const HEALTH_POINTS = 50

export function missionScore(m: Mission): MissionScore {
  const lines: ScoreLine[] = []
  const add = (id: string, name: string, where: string, max: number, points: number, state: ScoreState, note: string) =>
    lines.push({ id, name, where, max, points: Math.max(0, Math.min(max, Math.round(points))), state, note })
  /** A task that is either done for its full points or not done. */
  const flat = (id: keyof typeof FLAT_POINTS, name: string, where: string, done: boolean, yes: string, no: string) =>
    add(id, name, where, FLAT_POINTS[id], done ? FLAT_POINTS[id] : 0, done ? 'done' : 'missed', done ? yes : no)

  // ---- the launch
  const launch = m.profile.launch
  if (launch) add('launch', 'Crew launch', 'Launch field', FLAT_POINTS.launch, launch.attempts === 1 ? FLAT_POINTS.launch : 25, 'done',
    launch.attempts === 1 ? `Reached the station at the first try${launch.assisted ? ', flown by the guidance' : ''}` : `Reached the station after ${launch.attempts} lift-offs`)

  // ---- the station: what the rover waits for
  if (m.schedule) add('schedule', 'Crew schedule', 'Crew Quarters', SCHEDULE_POINTS, schedulePoints(m.schedule), m.failed.has('schedule') ? 'failed' : 'done',
    `Crew performance ${m.crewPerformance}%${m.failed.has('schedule') ? ', under the 75% target' : ''}`)
  else add('schedule', 'Crew schedule', 'Crew Quarters', SCHEDULE_POINTS, 0, 'missed', 'The crew never got a plan for its day')
  flat('payload', 'Rover instrument', 'Payload', m.payloadActive, m.instrumentInfo ? `${m.instrumentInfo.name} chosen and activated` : 'Chosen and activated', 'No instrument was activated')
  flat('relay', 'Relay repair', 'Rover Comms', m.completed.has('relay'), 'The Mars link was restored', m.payloadActive ? 'The relay was left broken' : 'The relay never came up')
  const pb = powerBlock(m.power, m.lifeNeed)
  flat('power', 'Station power', 'Power Grid', !pb, 'Life support and communications have the power they need', 'Life support or communications is short of power')
  if (m.waterLoop) add('water', 'Water recycling loop', 'Hab Systems', WATER_POINTS, waterPoints(m.waterLoop.fresh, m.brineOn), m.failed.has('water') ? 'failed' : 'done',
    m.failed.has('water') ? `${m.waterPct}% recovered, but a clogged filter left the water unsafe` : `${m.waterPct}% of the water recovered${m.brineOn ? ', brine processor running' : ''}`)
  else add('water', 'Water recycling loop', 'Hab Systems', WATER_POINTS, 0, 'missed', 'The loop was never run')

  // ---- the alerts that went off in this run
  const alertName = { scrubber: 'CO₂ scrubber adapter', rationing: 'Power rationing', cabin: 'Cabin alarm' } as const
  for (const id of m.alertPlan) {
    const r = m.alertResults[id]
    if (r) add(id, alertName[id], 'Station alert', ALERT_POINTS, r.points, r.won ? 'done' : 'failed', r.detail)
  }

  // ---- the station: optional work
  flat('calibration', 'Instrument calibration', 'Calibration', m.completed.has('calibration'), 'Rock scans read clearly', 'Not calibrated: rock scans stayed faint')
  flat('battery', 'Battery balancing', 'Power Grid', m.completed.has('battery'), 'Every drive drew 30 W less', 'The battery pack was left uneven')
  flat('cargo', 'Cargo check', 'Payload', m.completed.has('cargo'), '+5 credits recovered', 'The pallet was never checked')
  flat('medical', 'Crew medical check', 'Hab Systems', m.completed.has('medical'), 'Crew cleared for the habitat', 'No medical check: the habitat cannot be opened')
  const gh = m.greenhouse
  add('greenhouse', 'Station greenhouse', 'Greenhouse', GREENHOUSE_POINTS, gh.attempted ? gh.score().total : 0, gh.attempted ? 'done' : 'missed',
    gh.attempted ? (gh.complete ? 'Both greenhouse missions played' : 'Started, not finished') : 'The greenhouse was never started')
  flat('earth', 'Earth observation', 'Cupola', m.completed.has('earth'), `${m.earthSeen.length} photograph${m.earthSeen.length === 1 ? '' : 's'} of Earth viewed`, 'The Cupola screen was never used')

  // ---- the rover
  const del = m.delivery
  add('rocket', "Rover's rocket", 'Rover Comms', ROCKET_POINTS, !del ? 0 : del.ok ? ROCKET_POINTS : ROCKET_POINTS / 2, del ? 'done' : 'missed',
    !del ? 'The rover never left Earth' : del.ok ? 'The rover reached Mars at the first launch' : `The launch failed: a backup flew, ${del.solsLost} Mars days lost`)
  const tested = m.spots.filter(s => s.tests.includes('photo')).length
  add('drive', 'Rover navigation', 'Rover Comms', DRIVE_POINTS, (tested ? 20 : 0) + Math.min(20, m.photos.length * 4), m.drives.length ? 'done' : 'missed',
    m.drives.length ? `${m.drives.length} drive${m.drives.length === 1 ? '' : 's'}, ${tested} spot${tested === 1 ? '' : 's'} photographed, ${m.photos.length} real photo place${m.photos.length === 1 ? '' : 's'} found` : 'The rover never drove')
  const res = m.rescue
  if (res) add('rescue', 'Stuck rover rescue', 'Rover Comms', RESCUE_POINTS, res.result === 'clean' ? RESCUE_POINTS : res.result === 'freed' ? 35 : res.result === 'held' ? 10 : 0,
    res.result === 'clean' || res.result === 'freed' ? 'done' : res.result === 'held' ? 'failed' : 'missed',
    res.result === 'clean' ? 'Freed at the first try' : res.result === 'freed' ? `Freed after ${res.tries.length} tries` : res.result === 'held' ? `No fix worked: held for ${res.solsUsed} Mars days` : 'The rover was left stuck')
  const tubes = m.samples
  add('samples', 'Sample selection', 'Rover Comms', SAMPLE_POINTS, tubes?.value ?? 0, tubes ? 'done' : 'missed',
    tubes ? `${tubes.picks.length} of 3 tubes sealed, science value ${tubes.value} of 100` : 'No sample tube was filled')
  const base = m.base
  add('base', 'Base site', 'Rover Comms', BASE_POINTS, base?.approved ? base.score : 0, base?.approved ? 'done' : 'missed',
    base?.approved ? `${base.reason} (${base.score} of 100)` : base ? 'No base built: the crew stayed in orbit' : 'No base was chosen')
  flat('habitat', 'Habitat commissioning', 'Mission report', m.completed.has('habitat'), 'Crew quarters on Mars are pressurised', base?.approved ? 'The habitat was not commissioned' : 'Needs a base')

  // ---- the crew
  add('health', 'Crew health', 'Whole mission', HEALTH_POINTS, m.crewHealth / 2, m.crewHealth >= 100 ? 'done' : 'failed',
    m.crewHealth >= 100 ? 'Nobody was hurt' : `Crew health ended at ${m.crewHealth}%: an alert was not dealt with in time`)

  const total = lines.reduce((n, l) => n + l.points, 0), max = lines.reduce((n, l) => n + l.max, 0)
  return { total, max, lines, done: lines.filter(l => l.state === 'done'), missed: lines.filter(l => l.state !== 'done') }
}
