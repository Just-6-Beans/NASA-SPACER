// Mission Ops table: the mission brief, a live read-out of how the current design is shaping
// the mission, and where every number in the game comes from. It only displays what the rules
// in src/core and the data in src/data return; it adds no rule of its own.
import { CARGO_REWARD, DUST_DEADLINE, HEATER_FREE_C, INSTRUMENTS, KIT_COST, POWER_TOTAL, RESERVE_FLOOR, SITES, STRONG_LOW_END, byId } from '../core/data'
import type { Mission } from '../core/mission'
import { fastRelay, researchFilter, unassigned } from '../core/power'
import { fmt, fmtTemp, heaterDraw, passCauses, type Cause } from '../core/rover'
import { OPS_DATES, SOURCES, formatDate, lightTimeSource, opsDate, seasonNote, weatherSource, type OpsDate } from '../data/opsDates'
import { sound } from '../audio'
import { $, $$, esc } from './dom'
import { forecastPlan, linkMinutes } from './forecast'
import type { PanelCtx, Tab } from './panels'
import { NEED } from './stationHud'

export function opsTabs(ctx: PanelCtx): Tab[] {
  return [
    { id: 'brief', label: 'Mission brief', render: b => briefTab(b, ctx) },
    { id: 'status', label: 'Mission status', render: (b, r) => statusTab(b, r, ctx) },
    { id: 'sources', label: 'Data sources', render: b => sourcesTab(b, ctx) },
  ]
}

const REAL = '<span class="tag real">NASA data</span>'
const MODEL = '<span class="tag model">Our model</span>'
/** The operations date the pass was sent with, or the one chosen so far. */
const dateOf = (m: Mission): OpsDate | null => (m.plan ? opsDate(m.plan.date) : m.ops)
const heat = (d: OpsDate) => heaterDraw(d.weather.minAirTemp)
const pts = (n: number) => `${n} pt${n === 1 ? '' : 's'}`

// ------------------------------------------------------------------ Brief
function briefTab(body: HTMLElement, ctx: PanelCtx) {
  const m = ctx.m, ship = m.ship
  const d = dateOf(m), link = linkMinutes(m)
  const light = OPS_DATES.map(o => o.lightMin), cold = OPS_DATES.map(o => o.weather.minAirTemp)
  const most = Math.max(...OPS_DATES.map(heat))
  body.innerHTML = `<div class="sim">Simulated scenario · the signal delay and the night cold are NASA data</div>
    <div class="brief-goal"><h3>Your mission</h3>
      <p>You are docked 408 km above Earth, commanding a rover on Mars. Find out whether there is enough water ice at <b>Ares Shelf</b> to build a habitat, then decide where the crew lands.</p></div>
    <div class="brief-cols">
      <div class="brief-box"><h3>You decide</h3><ol>
        <li><b>Payload.</b> Which instrument the rover carries.</li>
        <li><b>Power.</b> How the station's ${POWER_TOTAL} units are split.</li>
        <li><b>Rover plan.</b> The operations date, the route and the scan. It is sent once.</li>
        <li><b>Landing site.</b> Where to commit, or whether to wait.</li></ol></div>
      <div class="brief-box"><h3>Your limits with ${esc(ship.name)}</h3><div class="kv">
        <span>Supply budget</span><b>${ship.budget} cr</b>
        <span>Payload mass</span><b>${ship.payloadKg} kg</b>
        <span>Rover battery</span><b>${ship.battery}%, stops at ${RESERVE_FLOOR}%</b>
        <span>Station power</span><b>${POWER_TOTAL} units</b>
        <span>Signal delay</span><b>${d && link !== null ? `${fmt(link)} min each way on ${d.label}` : `${fmt(Math.min(...light))} to ${fmt(Math.max(...light))} min, by date, + ${ship.handoffMin} min relay`}</b>
        <span>Night cold</span><b>${d ? `${fmtTemp(d.weather.minAirTemp)}: heaters use ${pts(heat(d))}` : `${fmtTemp(Math.min(...cold))} to ${fmtTemp(Math.max(...cold))}, by date: heaters use up to ${pts(most)}`}</b>
        <span>Time</span><b>dust at T+${DUST_DEADLINE}</b></div></div>
    </div>
    <div class="brief-box"><h3>What counts as success</h3>
      <p>An <b>approved landing</b> with the <b>habitat commissioned</b>. Ares Shelf is open only until the dust front at T+${DUST_DEADLINE}: the rover's last telemetry must arrive before then, and the rover has to be back at base. It then needs ice evidence with a low end of at least ${STRONG_LOW_END}%, or imported water you can still afford. Meridian Plain stays open but always needs imported water and a power kit. The habitat also needs a crew medical clearance from Hab Systems.</p>
      <p>Deferring the landing keeps the crew safe in orbit. It is a valid call, but the mission is not complete.</p></div>
    <div class="prov">
      <div>${REAL}<b>Signal delay.</b> The Earth to Mars light time on the operations date. ${esc(SOURCES.lightTime.name)}.</div>
      <div>${REAL}<b>Night cold.</b> The night low for that Mars season at Gale Crater. ${esc(SOURCES.weather.name)}.</div>
      <div>${MODEL}Everything else: the relay hand-off, the heater draw, drive and scan times, battery points, the ice reading, the dust front, budgets and landing sites.</div>
    </div>
    <div class="actions"><button class="btn primary" id="begin">Begin mission</button><button class="btn" id="tostatus">See mission status</button></div>`
  $('#begin', body).addEventListener('click', () => ctx.close())
  $('#tostatus', body).addEventListener('click', () => (document.querySelector('.tab[data-id=status]') as HTMLElement | null)?.click())
}

// ------------------------------------------------------------------ Status
type Tone = 'good' | 'warn' | 'bad' | 'info'
const why = (tone: Tone, where: string, cause: string, effect: string) =>
  `<div class="why ${tone}"><span class="where">${esc(where)}</span><div><b>${cause}</b>${effect.startsWith('<') ? effect : `<span>${effect}</span>`}</div></div>`
const bar = (label: string, value: string, pct: number, tone: Tone, mark?: number) =>
  `<div class="rbar ${tone}"><div class="rbar-top"><span>${label}</span><b>${value}</b></div><div class="rbar-track"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i>${mark === undefined ? '' : `<u style="left:${Math.max(0, Math.min(100, mark))}%"></u>`}</div></div>`
const TOPIC: Record<Cause['topic'], string> = { clock: 'Clock', battery: 'Rover battery', evidence: 'Ice evidence' }
/** One row per cause from the rules: the outcome, then the choices and inputs behind it. */
const causeRow = (c: Cause) => why(c.ok ? 'good' : 'bad', TOPIC[c.topic], esc(c.headline), `<ul class="parts">${c.parts.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`)

/** What each operations date would do to the plan as it stands. The two NASA numbers are shown
 *  as they are; the outcome lines come from the same pass calculation as everything else. */
function dateCards(m: Mission, instId: Mission['instrument']): string {
  return `<div class="dates3">${OPS_DATES.map(o => {
    const f = instId ? forecastPlan(m, instId, { opsDate: o.id }) : null
    const c = f ? passCauses(f.plan, f.pass) : []
    const line = (label: string, cause: Cause | undefined, text: string) => `<span>${label}</span><b class="${cause ? (cause.ok ? 'ok' : 'no') : ''}">${text}</b>`
    const [clock, battery, evidence] = c
    return `<div class="datec ${m.opsDate === o.id ? 'chosen' : ''}">
      <div class="datec-h"><b>${o.label}</b><small>${esc(o.note)}</small></div>
      <div class="kv">
        <span>Light time</span><b>${fmt(o.lightMin)} min</b>
        <span>Night low</span><b>${fmtTemp(o.weather.minAirTemp)}</b>
        ${f ? `${line('Signal leg', undefined, `${fmt(f.pass.uplink)} min`)}
        ${line('Heaters', undefined, pts(f.pass.heaterDraw))}
        ${line('Telemetry', clock, `T+${fmt(f.pass.finalTelemetryAt)} ${clock.ok ? '✓' : '✗ after dust'}`)}
        ${line('Rover', battery, battery.ok ? `back with ${f.pass.finalBattery}% ✓` : `${pts(f.pass.shortfall)} short ✗`)}
        ${line('Evidence', evidence, f.pass.reading ? `±${f.pass.reading.uncertainty} ${evidence.ok ? 'strong ✓' : 'weak ✗'}` : 'no reading ✗')}` : `<span>Heaters</span><b>${pts(heat(o))}</b>`}
      </div>
      ${m.opsDate === o.id ? '<span class="donebadge">CHOSEN</span>' : `<button class="btn small" data-date="${o.id}">Use this date</button>`}
    </div>`
  }).join('')}</div>`
}

function statusTab(body: HTMLElement, rerender: () => void, ctx: PanelCtx) {
  const m = ctx.m, ship = m.ship
  const p = m.plan?.power ?? m.power // once transmitted, the pass flies the power it was sent with
  const instId = m.instrument ?? m.instrumentDraft
  const inst = instId ? byId(INSTRUMENTS, instId) : null
  const sent = !!m.pass
  const d = dateOf(m)
  const fc = m.plan && m.pass ? { plan: m.plan, pass: m.pass } : instId ? forecastPlan(m, instId) : null
  const f = fc?.pass ?? null
  const total = ship.budget + (m.completed.has('cargo') ? CARGO_REWARD : 0)
  const free = unassigned(p)
  const package_ = m.waterCost + KIT_COST

  const bars = [
    bar('Supply budget', `${m.funds} of ${total} cr`, (m.funds / total) * 100, m.funds >= package_ ? 'good' : m.funds >= m.waterCost ? 'warn' : 'bad'),
    bar('Payload mass', `${inst?.massKg ?? 0} of ${ship.payloadKg} kg`, ((inst?.massKg ?? 0) / ship.payloadKg) * 100, 'info'),
    bar('Station power', `${POWER_TOTAL - free} of ${POWER_TOTAL} routed`, ((POWER_TOTAL - free) / POWER_TOTAL) * 100, p.life >= NEED.life && p.comms >= NEED.comms ? 'good' : 'bad'),
    f ? bar('Rover battery', `${ship.battery}% → ${f.finalBattery}%`, f.finalBattery, f.safeMode ? 'bad' : f.finalBattery < RESERVE_FLOOR + 10 ? 'warn' : 'good', RESERVE_FLOOR) : '',
    f ? bar('Time', `T+${fmt(f.finalTelemetryAt)} of T+${DUST_DEADLINE}`, (f.finalTelemetryAt / (DUST_DEADLINE * 1.25)) * 100, f.finalTelemetryAt < DUST_DEADLINE ? 'good' : 'bad', 80) : '',
  ].join('')

  const rows: string[] = []
  // the transmit gate: what the station's power allows
  rows.push(why(p.life >= NEED.life ? 'good' : 'bad', 'Power Grid', `Life support ${p.life}`, p.life >= NEED.life ? 'Enough to transmit.' : `Below ${NEED.life}: transmission is blocked.`))
  rows.push(why(p.comms < NEED.comms ? 'bad' : fastRelay(p) ? 'good' : 'info', 'Power Grid', `Communications ${p.comms}`,
    p.comms < NEED.comms ? `Below ${NEED.comms}: the plan cannot reach Mars.` : fastRelay(p) ? 'Direct link: no relay hand-off on any signal leg.' : `Enough to transmit. The relay adds ${ship.handoffMin} min to every signal leg; one more unit would skip it.`))
  rows.push(why(researchFilter(p) ? 'good' : 'info', 'Power Grid', `Research ${p.research}`, researchFilter(p) ? 'Research filter on: a tighter ice reading.' : 'Research filter off: a looser ice reading.'))
  if (free > 0 && !sent) rows.push(why('warn', 'Power Grid', `${free} unit${free === 1 ? '' : 's'} unassigned`, 'Power you have and are not using.'))
  if (!inst) rows.push(why('bad', 'Payload', 'No instrument chosen', 'Without one the rover cannot read ice at all.'))
  else if (!m.payloadActive) rows.push(why('info', 'Payload', `${inst.name} selected, not activated`, `${inst.cost} cr and ${inst.massKg} kg. The choice locks when you activate the payload.`))
  if (inst && !d) rows.push(why('warn', 'Rover planner', 'No operations date yet', 'The date sets the signal delay and the night cold. Compare the three below.'))
  // the rover pass: the rules' own account of what decides it
  if (fc) rows.push(...passCauses(fc.plan, fc.pass).map(causeRow))
  // money and crew
  rows.push(why(m.funds >= package_ ? 'good' : m.funds >= m.waterCost ? 'warn' : 'bad', 'Supplies', `${m.funds} cr available`,
    `Imported water ${m.waterCost} cr: ${m.funds >= m.waterCost ? 'affordable' : 'out of reach'}. Meridian package ${package_} cr: ${m.funds >= package_ ? 'affordable' : 'out of reach'}.`))
  rows.push(why(m.completed.has('medical') ? 'good' : 'warn', 'Hab Systems', m.completed.has('medical') ? 'Crew medical cleared' : 'Crew medical not done', m.completed.has('medical') ? 'The habitat can be commissioned after landing.' : 'The habitat cannot be commissioned, even after a good landing.'))

  const L = m.landing
  const head = L
    ? `<div class="feedback ${L.approved ? 'ok' : 'warn'}">${L.site === 'defer' ? 'Landing deferred. The crew remains in orbit.' : `Landing approved at ${esc(byId(SITES, L.site).name)}.`}</div>`
    : sent ? `<div class="feedback ok">Plan transmitted. These are the numbers the rover is flying, at T+${fmt(m.clock)}.</div>`
      : `<div class="feedback">${f ? 'A forecast of the plan as it stands. Nothing is locked until you transmit.' : inst ? 'Pick an operations date to see a forecast of the rover pass.' : 'Choose an instrument at the Payload terminal to see a forecast of the rover pass.'}</div>`
  const prov = d ? `<div class="prov">
      <div>${REAL}Light time <b>${fmt(d.lightMin)} min</b> · ${esc(lightTimeSource(d))}</div>
      <div>${REAL}Night low <b>${fmtTemp(d.weather.minAirTemp)}</b> · ${esc(weatherSource(d))}</div>
      <div>${MODEL}${esc(seasonNote(d))} Heaters use <b>${pts(heat(d))}</b>: one for each degree below ${fmtTemp(HEATER_FREE_C)}.</div>
    </div>` : ''
  const compare = sent ? '' : `<h3 class="why-head">Operations dates compared <small>with your payload, power, route and scan as they stand</small></h3>
    ${dateCards(m, instId)}
    <p class="dataline">${REAL}Light time: ${esc(SOURCES.lightTime.name)}. Night low: ${esc(SOURCES.weather.name)}, Gale Crater. The outcome lines are our model.</p>`
  const choices = `<h3 class="why-head">How your choices are shaping the mission</h3>
    <div class="whys">${rows.join('')}</div>`
  body.innerHTML = `<div class="sim">${sent ? 'The pass as sent' : 'Forecast'} · same calculation as the rover planner</div>
    ${head}
    <div class="rbars">${bars}</div>
    ${prov}
    ${d ? choices + compare : compare + choices}`
  $$('button[data-date]', body).forEach(b => b.addEventListener('click', () => {
    const err = m.setOpsDate(b.dataset.date!)
    sound.play(err ? 'fail' : 'ui')
    ctx.refresh()
    rerender()
  }))
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
    { kind: 'model', what: 'Heater draw', note: `One battery point for each degree the night low is below ${fmtTemp(HEATER_FREE_C)}, taken before the pass starts.`, origin: 'Built on Curiosity REMS' },
    { kind: 'model', what: 'Relay hand-off', note: 'Two or three minutes added to each signal leg by the station relay, and skipped by a direct link.', origin: 'Added to JPL Horizons light time' },
    { kind: 'simulated', what: 'Ice estimate and its uncertainty', note: 'A fixed scenario value with rule-based uncertainty. It is not a measurement.', origin: '' },
    { kind: 'simulated', what: 'Dust front deadline', note: 'A fixed scenario time.', origin: '' },
    { kind: 'simulated', what: 'Terrain, routes and landing sites', note: 'Drawn terrain and invented place names.', origin: '' },
    { kind: 'simulated', what: 'Rover battery draw and drive times', note: 'Game rules for each route, scan and instrument.', origin: '' },
    { kind: 'simulated', what: 'Budgets, costs and masses', note: 'Game rules for each spacecraft, instrument and supply.', origin: '' },
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
