// Mission Ops: brief, current expedition status, operations dates and data provenance.
import { POWER_TOTAL } from '../core/data'
import { powerBlock } from '../core/power'
import { MISSION_SOLS, SOL_HOURS, WEATHER_SOURCE, RADIATION, ROUGHNESS_SOURCE } from '../core/survey'
import { OPS_DATES, SOURCES, lightTimeSource, weatherSource, seasonNote } from '../data/opsDates'
import { $, $$, esc } from './dom'
import type { PanelCtx, Tab } from './panels'

export function opsTabs(ctx: PanelCtx): Tab[] {
  return [
    { id: 'brief', label: 'Mission brief', render: b => briefTab(b, ctx) },
    { id: 'status', label: 'Mission status', render: (b, r) => statusTab(b, r, ctx) },
    { id: 'sources', label: 'Data sources', render: b => sourcesTab(b, ctx) },
  ]
}
function briefTab(body: HTMLElement, ctx: PanelCtx) {
  const m = ctx.m
  body.innerHTML = `<div class="sim">NASA data with labelled game rules</div>
    <div class="brief-goal"><h3>Your mission</h3><p>Prepare the station, choose Perseverance in Jezero Crater or Curiosity in Gale Crater, drive across real orbital imagery, test possible base sites, and decide where the crew should land.</p></div>
    <div class="brief-cols"><div class="brief-box"><h3>You decide</h3><ol>
      <li>Choose and activate an instrument at Payload.</li><li>Repair the relay at Rover Comms and route power at Power Grid.</li>
      <li>Choose an operations date in Mission status, then your rover at Rover Comms.</li>
      <li>Place drive points on the map, photograph real NASA photo spots, test the ground and recharge when needed.</li>
      <li>Build a base at a surveyed spot, or keep the crew in orbit. Review why your choices shaped the result.</li></ol></div>
      <div class="brief-box"><h3>Your limits with ${esc(m.ship.name)}</h3><div class="kv"><span>Supply budget</span><b>${m.ship.budget} cr</b><span>Payload mass</span><b>${m.ship.payloadKg} kg</b><span>Station power</span><b>${POWER_TOTAL} units</b><span>Expedition</span><b>${MISSION_SOLS} Mars days</b><span>Battery reserve</span><b>40% safe-mode line</b><span>Signal leg</span><b>${m.signalMin} min each way</b></div></div></div>
    <div class="brief-box"><h3>What counts as success</h3><p>Survey a suitable base site and commission the habitat. Calibration improves sample analysis, research reduces drilling energy, balancing reduces driving power, and water purification improves the base score. Habitat commissioning also requires the medical check.</p><p>The battery, time and scoring rules are our model. The map imagery, measured rover stops, photos and source-labelled environmental data come from NASA.</p></div>
    <div class="actions"><button class="btn primary" id="begin">Begin mission</button><button class="btn" id="tostatus">See mission status</button></div>`
  $('#begin', body).addEventListener('click', () => ctx.close())
  $('#tostatus', body).addEventListener('click', () => document.querySelector<HTMLButtonElement>('.tab[data-id=status]')?.click())
}
function statusTab(body: HTMLElement, rerender: () => void, ctx: PanelCtx) {
  const m = ctx.m, d = m.ops, block = powerBlock(m.power)
  body.innerHTML = `<p class="lead">Your current expedition, from the mission's own rules.</p><div class="kv">
    <span>Instrument</span><b>${esc(m.instrumentInfo?.name ?? 'Not activated')}</b><span>Supply credits</span><b>${m.credits}</b>
    <span>Station power</span><b>${m.power.life}/${m.power.comms}/${m.power.research}</b><span>Relay</span><b>${m.relayFault ? 'Fault: repair at Rover Comms' : 'Nominal'}</b>
    <span>Rover</span><b>${esc(m.rover?.name ?? 'Choose at Rover Comms')}</b><span>Mission time</span><b>${Math.round(m.hoursUsed / SOL_HOURS * 10) / 10} of ${MISSION_SOLS} sols</b>
    <span>Battery</span><b>${m.rover ? `${m.batteryWh} Wh` : 'Set by rover and spacecraft'}</b><span>Surveyed spots</span><b>${m.spots.length}</b>
    <span>Base</span><b>${esc(m.base?.name ?? 'Not decided')}</b><span>Signal leg</span><b>${m.signalMin} min one-way</b></div>
    <div class="feedback ${block ? 'warn' : 'ok'}">${esc(block ?? 'Power ready for deployment.')}</div>
    <h3>Operations date</h3><p>The real Earth–Mars light time changes with the date. The spacecraft relay adds ${m.ship.handoffMin} minutes unless Communications has at least 5 units. The date locks after the first deployment.</p>
    <div class="dates3">${OPS_DATES.map(o => `<div class="datec ${m.opsDate === o.id ? 'chosen' : ''}"><div class="datec-h"><b>${esc(o.label)}</b><small>${esc(o.note)}</small></div><div class="kv"><span>Light time</span><b>${o.lightMin} min</b><span>Historical Gale night low</span><b>${o.weather.minAirTemp} °C</b></div><small>${esc(seasonNote(o))} Weather here is context; the expedition's weather test shows its own source.</small>${m.opsDate === o.id ? '<span class="donebadge">CHOSEN</span>' : `<button class="btn small" data-date="${o.id}" ${m.drives.length || m.base ? 'disabled' : ''}>Use this date</button>`}</div>`).join('')}</div>
    <p class="dataline">NASA data: ${esc(lightTimeSource(d))}. Historical weather context: ${esc(weatherSource(d))}. Relay hand-off is our model.</p>`
  $$('button[data-date]', body).forEach(b => b.addEventListener('click', () => {
    const err = m.selectOpsDate(b.dataset.date!)
    if (err) return
    rerender(); ctx.refresh()
  }))
}
function sourcesTab(body: HTMLElement, ctx: PanelCtx) {
  const m = ctx.m
  const entries = [
    ['Earth–Mars light time', `${SOURCES.lightTime.provider}; ${lightTimeSource(m.ops)}. ${SOURCES.lightTime.limits}`],
    ['Historical seasonal weather context', `${SOURCES.weather.provider}; ${weatherSource(m.ops)}. ${seasonNote(m.ops)}`],
    ['Expedition weather', `${WEATHER_SOURCE.provider}; ${WEATHER_SOURCE.location}; retrieved ${WEATHER_SOURCE.retrieved}. ${WEATHER_SOURCE.note}`],
    ['Radiation', `${RADIATION.provider}. ${RADIATION.note}`],
    ['Regional roughness', `${ROUGHNESS_SOURCE.provider}; retrieved ${ROUGHNESS_SOURCE.retrieved}.`],
  ]
  if (m.rover) entries.push(['Rover map and stops', `${m.rover.area.provider}. ${m.rover.area.credit} Map imagery: ${m.rover.satellite.provider}.`])
  body.innerHTML = `<p class="lead">Real measurements keep their place, date and source. All snapshots are bundled; the game never calls NASA while you play.</p><div class="srcs">${entries.map(([name,note]) => `<div class="src real"><div><b>${esc(name)}</b><span>${esc(note)}</span></div><em>NASA data</em></div>`).join('')}<div class="src model"><div><b>Game rules</b><span>Budgets, station power, test energy, recharge time, the ten-sol limit, base scoring and rewards are our model. The full mission report lists the selected rover's sources and model limits.</span></div><em>Our model</em></div></div>`
}
