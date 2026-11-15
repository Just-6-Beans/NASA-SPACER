// Mission Ops table: a short brief, where the mission stands, and where the numbers come from.
// It only displays what the rules in src/core and the data in src/data return; it adds no rule
// of its own. Kept short on purpose: the detail of each source opens on a tap.
import { POWER_TOTAL } from '../core/data'
import type { Mission } from '../core/mission'
import { unassigned, powerPct } from '../core/power'
import { missionScore } from '../core/score'
import { ROVERS } from '../core/rovers'
import { RADIATION, ROUGHNESS_SOURCE, WEATHER_SOURCE, spendPct } from '../core/survey'
import { SOURCES, formatDate } from '../data/opsDates'
import { ROVER_TASK_DATA } from '../data/roverTasks'
import { EARTH_PHOTOS, STATION_CARDS, STATION_TASK_DATA } from '../data/stationTasks'
import { $, esc } from './dom'
import type { PanelCtx, Tab } from './panels'
import { NEED, objectiveFor } from './stationHud'

export function opsTabs(ctx: PanelCtx): Tab[] {
  return [
    { id: 'brief', label: 'Mission brief', render: b => briefTab(b, ctx) },
    { id: 'status', label: 'Status', render: b => statusTab(b, ctx) },
    { id: 'sources', label: 'Data sources', render: b => sourcesTab(b, ctx) },
  ]
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const f1 = (n: number) => (Math.round(n * 10) / 10).toString()

// ------------------------------------------------------------------ Brief
function briefTab(body: HTMLElement, ctx: PanelCtx) {
  const m = ctx.m, ship = m.ship, d = m.ops
  body.innerHTML = `<div class="brief-goal"><h3>Your mission</h3>
      <p>Get the station ready, send a real NASA rover to Mars, and choose <b>where the crew's base goes</b>.</p></div>
    <div class="brief-box"><h3>What to do</h3><ol>
      <li><b>Ready the station.</b> Plan the crew's day, choose the rover's instrument, share out the power and run the water loop.</li>
      <li><b>Answer the alerts.</b> One or two emergencies will interrupt you.</li>
      <li><b>Send the rover.</b> Choose it and its rocket at Rover Comms. Drive it, test the ground and fill three sample tubes.</li>
      <li><b>Build the base</b> on the best spot the rover visited.</li></ol></div>
    <div class="brief-box" style="margin-top:12px"><h3>Your limits</h3><div class="kv">
      <span>Budget left</span><b>${m.credits} cr</b>
      <span>Station power</span><b>100% to share between three systems</b>
      <span>Time on Mars</span><b>${m.missionSols} Mars days</b>
      <span>Signal delay</span><b>${fmt(m.signalMin)} min each way on ${d.label} (NASA data)</b>
      <span>Rover battery</span><b>arrives at ${ship.battery}%</b></div></div>
    <p class="st-note">Every task adds to your mission score. The Tasks button lists them all.</p>
    <div class="actions"><button class="btn primary" id="begin">Begin mission</button></div>`
  $('#begin', body).addEventListener('click', () => ctx.close())
}

// ------------------------------------------------------------------ Status
type Tone = 'good' | 'warn' | 'bad' | 'info'
const bar = (label: string, value: string, pct: number, tone: Tone) =>
  `<div class="rbar ${tone}"><div class="rbar-top"><span>${label}</span><b>${value}</b></div><div class="rbar-track"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div></div>`

function statusTab(body: HTMLElement, ctx: PanelCtx) {
  const m = ctx.m, ship = m.ship, p = m.power
  const rv = m.rover
  const need = { ...NEED, life: m.lifeNeed }
  const total = ship.budget - m.launchSpent
  const free = unassigned(p)
  const pct = rv ? spendPct(rv, m.batteryWh) : ship.battery
  const score = missionScore(m)
  const steps: [boolean, string][] = [
    [!!m.schedule, "Crew's day planned"], [m.payloadActive, 'Instrument chosen'], [m.payloadActive && !m.relayFault, 'Mars link up'],
    [p.life >= need.life && p.comms >= need.comms, 'Power shared out'], [!!m.waterLoop, 'Water loop run'], [!!m.delivery, 'Rover on Mars'], [!!m.base, 'Base decided'],
  ]
  body.innerHTML = `<div class="feedback ${m.relayFault || m.alertActive ? 'bad' : 'ok'}"><b>Next:</b> ${esc(objectiveFor(m, true).text)}</div>
    <div class="rbars">
      ${bar('Mission score so far', `${score.total} points`, (score.total / Math.max(1, score.max)) * 100, 'good')}
      ${bar('Budget', `${m.funds} of ${total} cr left`, (m.funds / Math.max(1, total)) * 100, 'info')}
      ${bar('Station power', `${powerPct(POWER_TOTAL - free)} shared out`, ((POWER_TOTAL - free) / POWER_TOTAL) * 100, p.life >= need.life && p.comms >= need.comms ? 'good' : 'bad')}
      ${bar('Crew health', `${m.crewHealth}%`, m.crewHealth, m.crewHealth >= 100 ? 'good' : m.crewHealth >= 60 ? 'warn' : 'bad')}
      ${rv ? bar('Rover battery', `${pct}%${m.charging ? ', charging' : ''}`, pct, m.stranded ? 'bad' : pct <= 15 ? 'warn' : 'good') : bar('Rover battery', `arrives at ${ship.battery}%`, ship.battery, 'info')}
      ${bar('Mars days', rv ? `${f1(m.solsLeft)} of ${m.missionSols} left` : `${m.missionSols} to use`, (m.solsLeft / m.missionSols) * 100, m.timeUp ? 'bad' : m.solsLeft <= 2 ? 'warn' : 'good')}
    </div>
    <h3 class="why-head">Where the mission stands</h3>
    <div class="ops-steps">${steps.map(([done, text]) => `<span class="${done ? 'done' : ''}">${done ? '✓' : '○'} ${esc(text)}</span>`).join('')}</div>
    ${m.dustActive ? `<div class="feedback warn">Dust storm over the rover for about ${m.dustSolsLeft} more Mars days: it drives slower and every metre costs more battery.</div>` : ''}`
}

// ------------------------------------------------------------------ Data sources
type Kind = 'real' | 'model'
interface Row { kind: Kind; what: string; note: string; origin: string }
const KIND_LABEL: Record<Kind, string> = { real: 'NASA data', model: 'Our model' }

/** One row for each kind of number the player meets: real measurements first, then our model. */
function sourceRows(m: Mission): Row[] {
  const d = m.ops
  // Before the rover is chosen, the rows describe the first rover's data; both are saved the same way.
  const rv = m.rover ?? ROVERS.perseverance
  const card = (id: string) => STATION_CARDS.find(c => c.id === id)!.backing[0].source
  return [
    { kind: 'real', what: 'Where the rover is, its photos and the map', note: `Every place the rover really parked inside its 3 km map, the tilt it measured there, its raw photos and the picture of the ground from orbit. A spot more than 75 m from a real stop uses the slope from orbit instead.`, origin: `${rv.area.provider} · saved ${formatDate(rv.area.retrieved)}` },
    { kind: 'real', what: 'Map heights and terrain roughness', note: `The climb that makes a drive cost more battery, and how bumpy each crater is. ${rv.area.mola.note}`, origin: `${rv.area.mola.provider}; ${ROUGHNESS_SOURCE.provider}` },
    { kind: 'real', what: 'Weather and radiation', note: `Sunrise, sunset and air temperature at Gale Crater, and ${RADIATION.mGyPerSol} mGy of radiation each Mars day. ${WEATHER_SOURCE.note}`, origin: `${WEATHER_SOURCE.provider}; ${RADIATION.provider}` },
    { kind: 'real', what: 'Signal delay', note: `${fmt(d.lightMin)} minutes for light to cross from Earth to Mars on ${d.label}. ${SOURCES.lightTime.limits}`, origin: `${SOURCES.lightTime.provider} · retrieved ${formatDate(SOURCES.lightTime.retrieved)}` },
    { kind: 'real', what: "The rover's power, its rocket and the rock samples", note: 'The power source and battery of each rover, which rocket launched it and what NASA paid, and five samples Perseverance really sealed. What a Falcon 9 can send to Mars is SpaceX\'s figure, not NASA\'s.', origin: `NASA and JPL pages and press kits · retrieved ${formatDate(ROVER_TASK_DATA.retrieved)}` },
    { kind: 'real', what: 'The real events behind the alerts and tasks', note: 'Apollo 13\'s air filter and power-down (1970), the fire on Mir (1997), the space station\'s water recovery (93 to 94%, then 98%), two hours of crew exercise a day, the stuck rovers and the dust storm of 2018. Each task shows its own card.', origin: `${card('apollo13-filter').provider}; ${card('iss-water').provider}; ${card('mir-fire').provider} · retrieved ${formatDate(STATION_TASK_DATA.retrieved)}` },
    { kind: 'real', what: 'Photographs of Earth in the Cupola', note: `${EARTH_PHOTOS.length} photographs taken by crews on the International Space Station, each with NASA's own caption and date.`, origin: `NASA Image and Video Library · retrieved ${formatDate(STATION_TASK_DATA.retrieved)}` },
    { kind: 'model', what: 'The station tasks and alerts', note: 'Every rule of the crew day, the water loop, the three alerts and the relay signal: the timers, the parts, the power each system draws, the crew performance figure and crew health.', origin: 'Game rules, inspired by the real events above' },
    { kind: 'model', what: 'Station power, budgets and prices', note: 'The station\'s power is shared out in steps of 10% with fixed thresholds. Budgets, instrument prices and rocket prices in credits are game rules: one credit for each $10 million of a NASA cost figure where there is one.', origin: 'Game rules' },
    { kind: 'model', what: 'The rover on Mars', note: `What each test and each metre costs the battery, recharge times, the ${m.missionSols}-day limit, rocket success rates, getting stuck, wheel wear, the dust storm's effect, the value of each rock and the site score.`, origin: 'Built on the real measurements above' },
    { kind: 'model', what: 'The mission score', note: 'What each task is worth is a game rule. A task done well is worth more than one scraped through.', origin: 'Game rules' },
  ]
}

function sourcesTab(body: HTMLElement, ctx: PanelCtx) {
  const rows = sourceRows(ctx.m)
  body.innerHTML = `<p class="lead">Tap a line to see what it covers. Real measurements are shown in the game with their source, place and date.</p>
    <div class="srcs">${rows.map(r => `<details class="src ${r.kind}"><summary><b>${esc(r.what)}</b><em>${KIND_LABEL[r.kind]}</em></summary>
      <span>${esc(r.note)}</span><small>${esc(r.origin)}</small></details>`).join('')}</div>
    <p class="st-note">The game reads saved snapshots and does not call NASA while you play.</p>`
}
