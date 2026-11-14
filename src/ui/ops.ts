// Mission Ops table: the mission brief, a live read-out of how the current design is shaping
// the mission, and where every number in the game comes from. It only displays what the rules
// in src/core return; it adds no rule of its own.
import { CARGO_REWARD, DUST_DEADLINE, INSTRUMENTS, KIT_COST, POWER_TOTAL, RESERVE_FLOOR, ROUTES, SCANS, SITES, STRONG_LOW_END, byId, type InstrumentId } from '../core/data'
import { Mission } from '../core/mission'
import { fastRelay, researchFilter, signalLeg, unassigned } from '../core/power'
import { COMMAND_LABEL, fmt, reading, simulatePass, uncertaintyFor, type PassResult } from '../core/rover'
import { $, esc } from './dom'
import type { PanelCtx, Tab } from './panels'
import { NEED } from './stationHud'

export function opsTabs(ctx: PanelCtx): Tab[] {
  return [
    { id: 'brief', label: 'Mission brief', render: (b, r) => briefTab(b, r, ctx) },
    { id: 'status', label: 'Mission status', render: b => statusTab(b, ctx) },
    { id: 'sources', label: 'Data sources', render: b => sourcesTab(b) },
  ]
}

// ------------------------------------------------------------------ Brief
function briefTab(body: HTMLElement, _rerender: () => void, ctx: PanelCtx) {
  const ship = ctx.m.ship
  body.innerHTML = `<div class="sim">Simulated scenario · every number below is a game rule, not NASA data</div>
    <div class="brief-goal"><h3>Your mission</h3>
      <p>You are docked 408 km above Earth, commanding a rover on Mars. Find out whether there is enough water ice at <b>Ares Shelf</b> to build a habitat, then decide where the crew lands.</p></div>
    <div class="brief-cols">
      <div class="brief-box"><h3>You decide</h3><ol>
        <li><b>Payload.</b> Which instrument the rover carries.</li>
        <li><b>Power.</b> How the station's ${POWER_TOTAL} units are split.</li>
        <li><b>Rover plan.</b> The route and the scan. It is sent once.</li>
        <li><b>Landing site.</b> Where to commit, or whether to wait.</li></ol></div>
      <div class="brief-box"><h3>Your limits with ${esc(ship.name)}</h3><div class="kv">
        <span>Supply budget</span><b>${ship.budget} cr</b>
        <span>Payload mass</span><b>${ship.payloadKg} kg</b>
        <span>Rover battery</span><b>${ship.battery}%, stops at ${RESERVE_FLOOR}%</b>
        <span>Station power</span><b>${POWER_TOTAL} units</b>
        <span>Signal delay</span><b>${ship.relayMin} min each way</b>
        <span>Time</span><b>dust at T+${DUST_DEADLINE}</b></div></div>
    </div>
    <div class="brief-box"><h3>What counts as success</h3>
      <p>An <b>approved landing</b> with the <b>habitat commissioned</b>. Ares Shelf is open only until the dust front at T+${DUST_DEADLINE}, and the rover's last telemetry must arrive before then. Inside that window it needs ice evidence with a low end of at least ${STRONG_LOW_END}%, or imported water you can still afford. Meridian Plain stays open but always needs imported water and a power kit. The habitat also needs a crew medical clearance from Hab Systems.</p>
      <p>Deferring the landing keeps the crew safe in orbit. It is a valid call, but the mission is not complete.</p></div>
    <div class="actions"><button class="btn primary" id="begin">Begin mission</button><button class="btn" id="tostatus">See mission status</button></div>`
  $('#begin', body).addEventListener('click', () => ctx.close())
  $('#tostatus', body).addEventListener('click', () => (document.querySelector('.tab[data-id=status]') as HTMLElement | null)?.click())
}

// ------------------------------------------------------------------ Status
/** The rover pass the current design would produce. Before the payload is activated, the
 *  mission is asked for its plan as if the selected instrument were already locked in, so this
 *  uses the same snapshot and the same simulatePass() as the planner and the executed pass. */
function forecast(m: Mission, inst: InstrumentId): PassResult {
  const probe: Mission = Object.assign(Object.create(Mission.prototype), m, { instrument: inst })
  return simulatePass(probe.snapshot()!)
}

type Tone = 'good' | 'warn' | 'bad' | 'info'
const why = (tone: Tone, where: string, cause: string, effect: string) =>
  `<div class="why ${tone}"><span class="where">${esc(where)}</span><div><b>${cause}</b><span>${effect}</span></div></div>`
const bar = (label: string, value: string, pct: number, tone: Tone, mark?: number) =>
  `<div class="rbar ${tone}"><div class="rbar-top"><span>${label}</span><b>${value}</b></div><div class="rbar-track"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i>${mark === undefined ? '' : `<u style="left:${Math.max(0, Math.min(100, mark))}%"></u>`}</div></div>`

function statusTab(body: HTMLElement, ctx: PanelCtx) {
  const m = ctx.m, ship = m.ship
  const p = m.plan?.power ?? m.power // once transmitted, the pass flies the power it was sent with
  const instId = m.instrument ?? m.instrumentDraft
  const inst = instId ? byId(INSTRUMENTS, instId) : null
  const sent = !!m.pass
  const f = m.pass ?? (instId ? forecast(m, instId) : null)
  const plan = m.plan ?? { route: m.route, scan: m.scan, calibrated: m.calibrated }
  const leg = f ? f.uplink : signalLeg(ship.relayMin, p)
  const total = ship.budget + (m.completed.has('cargo') ? CARGO_REWARD : 0)
  const free = unassigned(p)
  const package_ = m.waterCost + KIT_COST

  const bars = [
    bar('Supply budget', `${m.funds} of ${total} cr`, (m.funds / total) * 100, m.funds >= package_ ? 'good' : m.funds >= m.waterCost ? 'warn' : 'bad'),
    bar('Payload mass', `${inst?.massKg ?? 0} of ${ship.payloadKg} kg`, ((inst?.massKg ?? 0) / ship.payloadKg) * 100, 'info'),
    bar('Station power', `${POWER_TOTAL - free} of ${POWER_TOTAL} routed`, ((POWER_TOTAL - free) / POWER_TOTAL) * 100, p.life >= NEED.life && p.comms >= NEED.comms ? 'good' : 'bad'),
    f ? bar('Rover battery', `${ship.battery}% → ${f.finalBattery}% (floor ${RESERVE_FLOOR}%)`, f.finalBattery, f.safeMode ? 'bad' : f.finalBattery < RESERVE_FLOOR + 10 ? 'warn' : 'good', RESERVE_FLOOR) : '',
    f ? bar('Time', `T+${fmt(f.finalTelemetryAt)} of T+${DUST_DEADLINE}`, (f.finalTelemetryAt / (DUST_DEADLINE * 1.25)) * 100, f.finalTelemetryAt < DUST_DEADLINE ? 'good' : 'bad', 80) : '',
  ].join('')

  const rows: string[] = []
  // power
  rows.push(why(p.life >= NEED.life ? 'good' : 'bad', 'Power Grid', `Life support ${p.life}`, p.life >= NEED.life ? 'Enough to transmit.' : `Below ${NEED.life}: transmission is blocked.`))
  rows.push(why(p.comms < NEED.comms ? 'bad' : fastRelay(p) ? 'good' : 'info', 'Power Grid', `Communications ${p.comms}`,
    p.comms < NEED.comms ? `Below ${NEED.comms}: the plan cannot reach Mars.` : `Each signal leg takes ${fmt(leg)} min.${fastRelay(p) ? ' Fast relay is on.' : ' One more unit would shorten every leg.'}`))
  rows.push(why(researchFilter(p) ? 'good' : 'info', 'Power Grid', `Research ${p.research}`, researchFilter(p) ? 'Noise filter on: a tighter ice reading.' : 'Noise filter off: a looser ice reading.'))
  if (free > 0 && !sent) rows.push(why('warn', 'Power Grid', `${free} unit${free === 1 ? '' : 's'} unassigned`, 'Power you have and are not using.'))
  // instrument and evidence
  if (!inst) rows.push(why('bad', 'Payload', 'No instrument chosen', 'Without one the rover cannot read ice at all.'))
  else {
    const rd = f?.reading ?? reading(uncertaintyFor(inst.id, plan.calibrated, p, plan.scan))
    rows.push(why(rd.strong ? 'good' : 'warn', 'Payload', `${inst.name} · ${inst.cost} cr · ${inst.massKg} kg${m.payloadActive ? '' : ' (not activated)'}`,
      `Reading ±${rd.uncertainty}: low end ${rd.low}% against the ${STRONG_LOW_END}% needed. ${rd.strong ? 'Strong evidence.' : 'Weak evidence.'}`))
    rows.push(why(plan.calibrated ? 'good' : 'warn', 'Calibration', plan.calibrated ? 'Instrument calibrated' : 'Instrument not calibrated', plan.calibrated ? 'Uncertainty reduced.' : 'Uncertainty is wider than it needs to be.'))
  }
  // route, time, battery
  if (f) {
    const route = byId(ROUTES, plan.route), scan = byId(SCANS, plan.scan)
    const margin = DUST_DEADLINE - f.finalTelemetryAt
    rows.push(why(margin > 0 ? 'good' : 'bad', 'Rover planner', `${route.name} · ${scan.name}`,
      margin > 0 ? `Final telemetry at T+${fmt(f.finalTelemetryAt)}, ${fmt(margin)} min before the dust front. Ares Shelf stays open.` : `Final telemetry at T+${fmt(f.finalTelemetryAt)}, after the T+${DUST_DEADLINE} dust front. Ares Shelf will be closed.`))
    const stop = f.commands.find(c => c.status === 'partial')
    rows.push(why(f.safeMode ? 'bad' : f.finalBattery < RESERVE_FLOOR + 10 ? 'warn' : 'good', 'Rover battery', `Rover starts at ${ship.battery}%`,
      f.safeMode ? `Reaches the ${RESERVE_FLOOR}% reserve during ${COMMAND_LABEL[stop!.kind]} and stops in safe mode.${f.reading ? '' : ' No ice reading.'}` : `Returns to base with ${f.finalBattery}%.`))
  }
  // money and crew
  rows.push(why(m.funds >= package_ ? 'good' : m.funds >= m.waterCost ? 'warn' : 'bad', 'Supplies', `${m.funds} cr available`,
    `Imported water ${m.waterCost} cr: ${m.funds >= m.waterCost ? 'affordable' : 'out of reach'}. Meridian package ${package_} cr: ${m.funds >= package_ ? 'affordable' : 'out of reach'}.`))
  rows.push(why(m.completed.has('medical') ? 'good' : 'warn', 'Hab Systems', m.completed.has('medical') ? 'Crew medical cleared' : 'Crew medical not done', m.completed.has('medical') ? 'The habitat can be commissioned after landing.' : 'The habitat cannot be commissioned, even after a good landing.'))

  const L = m.landing
  const head = L
    ? `<div class="feedback ${L.approved ? 'ok' : 'warn'}">${L.site === 'defer' ? 'Landing deferred. The crew remains in orbit.' : `Landing approved at ${esc(byId(SITES, L.site).name)}.`}</div>`
    : sent ? `<div class="feedback ok">Plan transmitted. These are the numbers the rover is flying, at T+${fmt(m.clock)}.</div>`
      : `<div class="feedback">${f ? 'A forecast of the plan as it stands. Nothing is locked until you transmit.' : 'Choose an instrument at the Payload terminal to see a forecast of the rover pass.'}</div>`
  body.innerHTML = `<div class="sim">Simulated ${sent ? 'pass' : 'forecast'} · same calculation as the rover planner</div>
    ${head}
    <div class="rbars">${bars}</div>
    <h3 class="why-head">How your choices are shaping the mission</h3>
    <div class="whys">${rows.join('')}</div>`
}

// ------------------------------------------------------------------ Data sources
/** One line per kind of number the player meets. `nasa` is filled in when a real measurement
 *  drives it: the data lane supplies the provider, place and date. */
export interface Source { what: string; note: string; nasa?: { provider: string; place: string; date: string } }
export const SOURCES: Source[] = [
  { what: 'Signal delay to Mars', note: 'Set by the spacecraft (7 or 8 minutes one-way) and shortened by communications power.' },
  { what: 'Ice estimate and its uncertainty', note: 'A fixed scenario value with rule-based uncertainty. It is not a measurement.' },
  { what: 'Dust front deadline', note: 'A fixed scenario time.' },
  { what: 'Terrain, routes and landing sites', note: 'Drawn terrain and invented place names.' },
  { what: 'Rover battery draw and drive times', note: 'Game rules for each route, scan and instrument.' },
  { what: 'Budgets, costs and masses', note: 'Game rules for each spacecraft, instrument and supply.' },
  { what: 'Station power units', note: 'Ten abstract units with fixed thresholds.' },
  { what: 'Station orbit', note: 'A 408 km, 92-minute orbit, played back 30 times faster in the windows.' },
]

function sourcesTab(body: HTMLElement) {
  const real = SOURCES.filter(s => s.nasa).length
  body.innerHTML = `<p class="lead">Where each number in this mission comes from. A real measurement is always shown with its source, its place and its date.</p>
    <div class="srcs">${SOURCES.map(s => `<div class="src ${s.nasa ? 'real' : ''}"><div><b>${esc(s.what)}</b><span>${esc(s.note)}</span></div>
      <em>${s.nasa ? `${esc(s.nasa.provider)} · ${esc(s.nasa.place)} · ${esc(s.nasa.date)}` : 'Simulated'}</em></div>`).join('')}</div>
    <div class="feedback ${real ? 'ok' : 'warn'}">${real ? `${real} of ${SOURCES.length} are driven by NASA measurements.` : 'This build does not use NASA measurements yet. Every value above is simulated.'}</div>`
}
