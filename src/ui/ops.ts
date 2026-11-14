// Mission Ops table: the mission brief, a live read-out of how the current design is shaping
// the mission, and where every number in the game comes from. It only displays what the rules
// in src/core and the data in src/data return; it adds no rule of its own.
import { CARGO_REWARD, DUST_DEADLINE, HEATER_FREE_C, INSTRUMENTS, KIT_COST, POWER_TOTAL, PREP_HOURS, RESERVE_FLOOR, byId } from '../core/data'
import type { Mission } from '../core/mission'
import { fastRelay, researchFilter, unassigned } from '../core/power'
import { fmt, fmtTemp, heaterDraw } from '../core/rover'
import { OPS_DATES, SOURCES, formatDate, opsDate, type OpsDate } from '../data/opsDates'
import { $, esc } from './dom'
import { BRIEF_DATA_LINE, briefCore, briefRules } from './brief'
import { forecastPlan, lightHtml, lights, linkMinutes } from './forecast'
import type { PanelCtx, Tab } from './panels'
import { NEED } from './stationHud'

export function opsTabs(ctx: PanelCtx): Tab[] {
  return [
    { id: 'status', label: 'Mission status', render: b => statusTab(b, ctx) },
    { id: 'brief', label: 'Mission brief', render: b => briefTab(b, ctx) },
    { id: 'sources', label: 'Data sources', render: b => sourcesTab(b, ctx) },
  ]
}

/** The operations date the pass was sent with, or the one chosen so far. */
const dateOf = (m: Mission): OpsDate | null => (m.plan ? opsDate(m.plan.date) : m.ops)
const heat = (d: OpsDate) => heaterDraw(d.weather.minAirTemp)

// ------------------------------------------------------------------ Brief
function briefTab(body: HTMLElement, ctx: PanelCtx) {
  const m = ctx.m, ship = m.ship
  const d = dateOf(m), link = linkMinutes(m)
  const light = OPS_DATES.map(o => o.lightMin), cold = OPS_DATES.map(o => o.weather.minAirTemp)
  const most = Math.max(...OPS_DATES.map(heat))
  body.innerHTML = `${briefCore()}
    <details class="more"><summary>Your limits with ${esc(ship.name)}</summary><div class="kv">
      <span>Budget</span><b>${ship.budget} cr</b>
      <span>Payload mass</span><b>${ship.payloadKg} kg</b>
      <span>Rover battery</span><b>${ship.battery}%, stops at ${RESERVE_FLOOR}%</b>
      <span>Station power</span><b>${POWER_TOTAL} units</b>
      <span>Crew-hours</span><b>${PREP_HOURS}, one per preparation task</b>
      <span>Signal delay</span><b>${d && link !== null ? `${fmt(link)} min each way on ${d.label}` : `${fmt(Math.min(...light))} to ${fmt(Math.max(...light))} min by date, + ${m.handoffMin} min at the relay`}</b>
      <span>Night cold</span><b>${d ? `${fmtTemp(d.weather.minAirTemp)}: heaters use ${heat(d)}% of the battery` : `${fmtTemp(Math.min(...cold))} to ${fmtTemp(Math.max(...cold))} by date: heaters use up to ${most}%`}</b>
      <span>Deadline</span><b>dust front at T+${DUST_DEADLINE}</b></div></details>
    <details class="more"><summary>The full rules for success</summary>${briefRules()}</details>
    <p class="dataline">${BRIEF_DATA_LINE}</p>`
}

// ------------------------------------------------------------------ Status
type Tone = 'good' | 'warn' | 'bad' | 'info'
const bar = (label: string, value: string, pct: number, tone: Tone) =>
  `<div class="rbar ${tone}"><div class="rbar-top"><span>${label}</span><b>${value}</b></div><div class="rbar-track"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div></div>`
const note = (tone: Tone, where: string, text: string) => `<div class="why ${tone}"><span class="where">${esc(where)}</span><div><span>${text}</span></div></div>`

function statusTab(body: HTMLElement, ctx: PanelCtx) {
  const m = ctx.m, ship = m.ship
  const p = m.plan?.power ?? m.power // once transmitted, the pass flies the power it was sent with
  const instId = m.instrument ?? m.instrumentDraft
  const inst = instId ? byId(INSTRUMENTS, instId) : null
  const sent = !!m.pass
  const fc = m.plan && m.pass ? { plan: m.plan, pass: m.pass } : instId ? forecastPlan(m, instId) : null
  const total = ship.budget + (m.completed.has('cargo') ? CARGO_REWARD : 0)
  const free = unassigned(p)
  const package_ = m.waterCost + KIT_COST
  const L = m.landing

  const head = L ? (L.site === 'defer' ? 'Landing deferred. The crew remains in orbit.' : `Landing approved. ${m.completed.has('habitat') ? 'Habitat commissioned.' : 'Habitat not commissioned yet.'}`)
    : sent ? `The pass is flying the plan you sent, at T+${fmt(m.clock)}.`
      : fc ? 'A forecast of the plan as it stands. Nothing is locked until you transmit.'
        : inst ? 'Pick an operations date in the rover planner to see a forecast.'
          : 'Choose a rover instrument at Payload to see a forecast.'

  const three = fc ? `<div class="lights">${lights(fc.plan, fc.pass).map(l => lightHtml(l)).join('')}</div>`
    : `<div class="lights">${['Clock', 'Battery', 'Evidence'].map(n => `<div class="light none"><div class="lsum"><i>–</i><b>${n}</b><span>no plan yet</span></div></div>`).join('')}</div>`

  const bars = [
    bar('Credits', `${m.funds} of ${total} cr`, (m.funds / total) * 100, m.funds >= package_ ? 'good' : m.funds >= m.waterCost ? 'warn' : 'bad'),
    bar('Crew-hours', `${m.prepLeft} of ${PREP_HOURS} left`, (m.prepLeft / PREP_HOURS) * 100, m.prepLeft > 0 ? 'good' : 'warn'),
    bar('Station power', `${POWER_TOTAL - free} of ${POWER_TOTAL} routed`, ((POWER_TOTAL - free) / POWER_TOTAL) * 100, p.life >= NEED.life && p.comms >= NEED.comms ? 'good' : 'bad'),
    bar('Payload mass', `${inst?.massKg ?? 0} of ${ship.payloadKg} kg`, ((inst?.massKg ?? 0) / ship.payloadKg) * 100, 'info'),
  ].join('')

  // Only what needs a decision or is going wrong. What is fine stays quiet.
  const rows: string[] = []
  if (p.life < NEED.life) rows.push(note('bad', 'Power Grid', `Life support is at ${p.life}. Below ${NEED.life}, transmission is blocked.`))
  if (p.comms < NEED.comms) rows.push(note('bad', 'Power Grid', `Communications is at ${p.comms}. Below ${NEED.comms}, the plan cannot reach Mars.`))
  else if (!sent && !fastRelay(p) && !researchFilter(p)) rows.push(note('warn', 'Power Grid', `Neither the direct link nor the research filter is on.${free ? ` ${free} unit${free === 1 ? ' is' : 's are'} not routed.` : ''}`))
  if (!inst) rows.push(note('bad', 'Payload', 'No instrument chosen. Without one the rover cannot read ice at all.'))
  else if (!m.payloadActive) rows.push(note('warn', 'Payload', `${esc(inst.name)} is selected but not activated.`))
  if (m.relayFault) rows.push(note('bad', 'Rover Comms', 'Relay fault. Patch it for free or repair it for a crew-hour.'))
  else if (m.relayPatched && !fastRelay(p)) rows.push(note('warn', 'Rover Comms', `The relay is patched: every signal waits ${m.handoffMin} min there. A full repair costs a crew-hour.`))
  if (m.payloadActive && !m.calibrated && !sent) rows.push(note('warn', 'Calibration', 'The instrument is uncalibrated: the ice reading is ±9 looser. Calibrating takes a crew-hour.'))
  if (!m.completed.has('medical')) rows.push(note(m.prepLeft > 0 ? 'warn' : 'bad', 'Hab Systems', m.prepLeft > 0 ? 'Crew medical not done. Without it the habitat cannot be commissioned, even after a good landing. It takes a crew-hour.' : 'Crew medical not done, and no crew-hours are left. This crew can land but cannot commission the habitat.'))
  if (m.funds < package_) rows.push(note(m.funds >= m.waterCost ? 'warn' : 'bad', 'Credits', `${m.funds} cr left. Imported water (${m.waterCost} cr) is ${m.funds >= m.waterCost ? 'affordable' : 'out of reach'}; the Meridian package (${package_} cr) is out of reach.`))

  body.innerHTML = `<div class="feedback ${L?.approved ? 'ok' : ''}" style="margin-top:0">${esc(head)}</div>
    <h3 class="why-head">Three things decide the rover pass <small>${sent ? 'as sent' : 'forecast · tap one for the choices behind it'}</small></h3>
    ${three}
    <h3 class="why-head">What you have left</h3>
    <div class="rbars">${bars}</div>
    ${rows.length ? `<h3 class="why-head">Needs your attention</h3><div class="whys">${rows.join('')}</div>` : ''}
    ${sent ? '' : '<div class="actions"><button class="btn" id="tobrief">Read the brief again</button></div>'}`
  $('#tobrief', body)?.addEventListener('click', () => (document.querySelector('.tab[data-id=brief]') as HTMLElement | null)?.click())
}

// ------------------------------------------------------------------ Data sources
type Kind = 'real' | 'model' | 'simulated'
interface Row { kind: Kind; what: string; note: string; origin: string; limit?: string }
const KIND_LABEL: Record<Kind, string> = { real: 'NASA data', model: 'Our model', simulated: 'Simulated' }

/** One row per kind of number the player meets: real measurements first, then what our model
 *  builds on them, then what is simply simulated. */
function sourceRows(m: Mission): Row[] {
  const d = dateOf(m)
  const dates = OPS_DATES.map(o => o.label).join(', ')
  return [
    { kind: 'real', what: 'Signal delay: Earth to Mars light time',
      note: d ? `${fmt(d.lightMin)} minutes one way on your operations date.` : `Read for the operations date you pick: ${dates}.`,
      origin: `${SOURCES.lightTime.provider} · Earth to Mars · ${d ? d.label : 'your operations date'} · retrieved ${formatDate(SOURCES.lightTime.retrieved)}`, limit: SOURCES.lightTime.limits },
    { kind: 'real', what: 'Night cold on Mars',
      note: d ? `${fmtTemp(d.weather.minAirTemp)} night low, sol ${d.weather.sol} (${formatDate(d.weather.earthDate)}).` : 'The night low of one Curiosity sol for each operations date.',
      origin: `${SOURCES.weather.provider} · ${SOURCES.weather.location} · ${d ? `sol ${d.weather.sol}, ${formatDate(d.weather.earthDate)}` : 'one sol per date'} · retrieved ${formatDate(SOURCES.weather.retrieved)}`, limit: SOURCES.weather.limits },
    { kind: 'model', what: 'Season stand-in', note: 'Curiosity has no weather for 2029, so each date borrows the sol from the same Mars season in an earlier Mars year.', origin: 'Built on Curiosity REMS' },
    { kind: 'model', what: 'Heater draw', note: `One percent of the rover battery for each degree the night low is below ${fmtTemp(HEATER_FREE_C)}, taken before the pass starts.`, origin: 'Built on Curiosity REMS' },
    { kind: 'model', what: 'Relay hand-off', note: 'Two or three minutes added to each signal by the station relay, two more if the relay is only patched, and none on a direct link.', origin: 'Added to JPL Horizons light time' },
    { kind: 'simulated', what: 'Ice estimate and its uncertainty', note: 'A fixed scenario value with rule-based uncertainty. It is not a measurement.', origin: '' },
    { kind: 'simulated', what: 'Dust front deadline', note: 'A fixed scenario time.', origin: '' },
    { kind: 'simulated', what: 'Terrain, routes and landing sites', note: 'Drawn terrain, invented place names, and our own rule for what each site needs.', origin: '' },
    { kind: 'simulated', what: 'Rover battery use and drive times', note: 'Game rules for each route, scan and instrument.', origin: '' },
    { kind: 'simulated', what: 'Budgets, costs, masses and crew-hours', note: 'Game rules for each spacecraft, instrument, supply and preparation task.', origin: '' },
    { kind: 'simulated', what: 'Station power units', note: 'Ten abstract units with fixed thresholds.', origin: '' },
    { kind: 'simulated', what: 'Station orbit', note: 'A 408 km, 92-minute orbit, played back 30 times faster in the windows.', origin: '' },
  ]
}

function sourcesTab(body: HTMLElement, ctx: PanelCtx) {
  const rows = sourceRows(ctx.m)
  const count = (k: Kind) => rows.filter(r => r.kind === k).length
  body.innerHTML = `<p class="lead">Where each number in this mission comes from. A real measurement is always shown with its source, its place and its date.</p>
    <div class="srcs">${rows.map(r => `<div class="src ${r.kind}"><div><b>${esc(r.what)}</b><span>${esc(r.note)}</span>
      ${r.origin ? `<small>${esc(r.origin)}</small>` : ''}${r.limit ? `<small class="limit">Limit: ${esc(r.limit)}</small>` : ''}</div>
      <em>${KIND_LABEL[r.kind]}</em></div>`).join('')}</div>
    <div class="feedback ok">${count('real')} of these ${rows.length} come from NASA measurements, and ${count('model')} are our model built on them. The rest are simulated. The game reads committed snapshots and never calls NASA while you play.</div>`
}
