// Mission report, built from what actually happened: the drives, every spot and its tests, the
// base that was built, and the choices that decided the outcome.
import { INSTRUMENTS, MISSION_BUDGET, SUITS, byId } from '../core/data'
import { aboard, cargoKg, designCost, launchCauses } from '../core/loadout'
import { TASK_INFO, type Mission } from '../core/mission'
import { mmrtgNowW } from '../core/rovers'
import { DRIVE_FILMS, MISSION_SOLS, RADIATION, ROUGHNESS_SOURCE, SOL_HOURS, TESTS, VIDEOS, WEATHER_SOURCE, photoPlaces, region } from '../core/survey'
import type { TaskId } from '../core/tasks'
import { ROCKET_DATA, rocket, rocketSources } from '../data/launchVehicles'
import { formatDate } from '../data/opsDates'
import { $, el, esc } from './dom'
import { sequenceTab, type PanelCtx } from './panels'
import { barsHtml, starsHtml } from './roverView'

export function reportScreen(m: Mission, ctx: PanelCtx, onReplay: () => void, onTitle: () => void): HTMLElement {
  const s = el('<section class="report" aria-label="Mission report"><div class="report-inner"></div></section>')
  const inner = $('.report-inner', s)
  const render = () => {
    const ship = m.ship
    const suit = byId(SUITS, m.profile.suit)
    const inst = m.instrument ? byId(INSTRUMENTS, m.instrument) : null
    const l = m.loadout, cost = l ? designCost(ship, l) : null
    const launch = m.profile.launch ? launchCauses(ship, m.profile.launch) : null
    const lv = rocket(ship.rocket)
    const B = m.base
    const rv = m.rover
    const good = B?.approved && B.level === 'good'
    const routine: TaskId[] = ['battery', 'cargo', 'water', 'medical']
    const verdict = !B ? 'No base decision' : !B.approved ? 'No base built · crew remains in orbit' : `Base built at ${B.name}${m.completed.has('habitat') ? ' · habitat commissioned' : ''}`
    const causes = m.causes()
    const reports = rv ? m.reports() : []
    const video = rv ? VIDEOS.find(x => x.rover === rv.id) : null
    const film = rv ? DRIVE_FILMS.find(x => x.rover === rv.id) : null
    inner.innerHTML = `<div class="sim">Mission report · real NASA data, our game model on top</div><h1>${esc(m.profile.callSign)} · ${ship.name}</h1>
      <div class="verdict-big ${good ? 'good' : 'mid'}">${esc(verdict)}${B?.approved ? ` · ${B.score}/100 ${starsHtml(B.stars)}` : ''}</div>
      ${B?.approved ? `<p style="margin:-6px 0 14px">${esc(B.reason)}</p>` : ''}
      <div class="rgrid">
        <div class="rbox" style="grid-column:1/-1"><h3>What decided the outcome</h3><ul>${causes.map(c => `<li style="color:${c.good ? 'var(--mint)' : 'var(--warn)'}">${c.good ? '＋' : '−'} ${esc(c.text)}</li>`).join('') || '<li>The rover never left the station\'s control room.</li>'}</ul></div>
        ${launch ? `<div class="rbox" style="grid-column:1/-1"><h3>What decided the launch</h3>
          <div class="causes"><div class="cause ${launch.ok ? 'ok' : 'bad'}"><b>${launch.ok ? '✓' : '✗'} ${esc(launch.headline)}</b><ul>${launch.parts.map(x => `<li>${esc(x)}</li>`).join('')}${l && cost ? `<li>Budget: ${MISSION_BUDGET} cr, of which the launch took ${cost.launch} cr and the station cargo ${cost.cargo} cr, leaving ${cost.left} cr for the rover instrument and the rest.</li>` : ''}</ul></div></div>
          <p class="dataline" style="margin:10px 0 0"><span class="tag model">Our model</span>The ascent, the cargo masses and the ratings. The launch systems are real; their thrust and weight at lift-off are NASA figures where NASA gives them.</p></div>` : ''}
        <div class="rbox"><h3>Crew & spacecraft</h3><div class="kv"><span>Call sign</span><b>${esc(m.profile.callSign)}</b><span>Suit</span><b style="color:${suit.light}">${suit.name}</b><span>Launch system</span><b>${ship.name}</b><span>Station cargo</span><b>${l ? (cargoKg(l) ? `${cargoKg(l).toLocaleString('en-US')} kg: ${aboard(l).map(x => `${x.item.name.toLowerCase()} ${x.step.kg.toLocaleString('en-US')} kg`).join(', ')}` : 'none') : 'not recorded'}</b><span>Instrument</span><b>${inst ? `${inst.name} (${inst.code})` : 'none'}</b></div></div>
        <div class="rbox"><h3>Preparation</h3><ul>${(['relay', 'calibration', ...routine] as TaskId[]).map(t => `<li>${m.completed.has(t) ? '✓' : '○'} ${TASK_INFO[t].name}${m.completed.has(t) ? ` — <span style="color:#b9ae95">${TASK_INFO[t].reward}</span>` : ' — not done'}</li>`).join('')}</ul></div>
        <div class="rbox"><h3>Rover & crater</h3><div class="kv"><span>Rover</span><b>${rv ? esc(rv.name) : '—'}</b><span>Crater</span><b>${m.region ? esc(region(m.region).name) : '—'}</b>${rv ? `<span>MMRTG now</span><b>${mmrtgNowW(rv)} W</b><span>Battery</span><b>${esc(rv.batteryText)}</b><span>Charge left</span><b>${m.batteryWh} Wh</b><span>Driven</span><b>${m.drives.reduce((a, d) => a + d.distM, 0)} m, ${m.drives.reduce((a, d) => a + d.climbM, 0)} m of climb</b><span>Mars days used</span><b>${Math.round((m.hoursUsed / SOL_HOURS) * 10) / 10} of ${m.missionSols}</b><span>Recharges</span><b>${m.recharges}</b><span>Photo spots found</span><b>${m.photos.length} of ${photoPlaces(rv).length} (+${m.photoBonus} score)</b>` : ''}</div></div>
        <div class="rbox"><h3>Spots visited</h3>${reports.length ? `<ul>${reports.map(r => `<li><b>${r.spot.label}</b>${B?.approved && B.id === r.spot.id ? ' 🏗' : ''}: ${esc(r.verdict.title)} · ${r.score}/100<br/><span style="color:#b9ae95">${r.ground.source === 'rover' ? `Real ${esc(rv!.name)} stop, sol ${r.ground.sol}` : 'Orbit data (MOLA)'} · tests: ${m.testsFor(r.spot).map(t => TESTS[t].name.toLowerCase()).join(', ') || 'none'}</span></li>`).join('')}</ul>` : '<p style="margin:0">No rover was chosen.</p>'}</div>
        <div class="rbox" style="grid-column:1/-1"><h3>Base site measurements (tap a bar for its source)</h3>${B?.bars.length ? barsHtml(B.bars) : '<p style="margin:0">No base was built.</p>'}</div>
        <div class="rbox" style="grid-column:1/-1"><h3>Data sources</h3><ul class="srcs">
          ${rv ? `<li><b>${esc(rv.name)} stops and photos:</b> ${esc(rv.area.provider)}, saved ${esc(rv.area.retrieved)}. ${esc(rv.area.credit)}</li>
          <li><b>Map picture:</b> ${esc(rv.satellite.provider)}, saved ${esc(rv.satellite.retrieved)}. <a href="${esc(rv.satellite.page)}" target="_blank" rel="noopener">NASA's map ↗</a></li>
          <li><b>Map heights:</b> ${esc(rv.area.mola.provider)}. ${esc(rv.area.mola.note)}</li>
          <li><b>Rover pictures:</b> real selfie “${esc(rv.selfie.title)}”, ${esc(rv.selfie.credit)}; parts picture “${esc(rv.partsPicture.title)}” (an artist's concept, not a photo), ${esc(rv.partsPicture.credit)}.</li>` : ''}
          <li><b>Launch system, ${esc(lv.name)}:</b> ${rocketSources(lv).length} NASA pages and reports, quoted in the game's snapshot, retrieved ${esc(formatDate(ROCKET_DATA.retrieved))}.</li>
          <li><b>Weather:</b> ${esc(WEATHER_SOURCE.provider)}, ${esc(WEATHER_SOURCE.location)}, saved ${esc(WEATHER_SOURCE.retrieved)}. ${esc(WEATHER_SOURCE.note)}</li>
          <li><b>Radiation:</b> ${esc(RADIATION.provider)}. ${esc(RADIATION.note)}</li>
          <li><b>Terrain roughness:</b> ${esc(ROUGHNESS_SOURCE.provider)}, saved ${esc(ROUGHNESS_SOURCE.retrieved)}.</li>
          ${film ? `<li><b>Drive film:</b> “${esc(film.title)}”, ${esc(film.credit)}. ${esc(film.note)} <a href="${esc(film.page)}" target="_blank" rel="noopener">NASA page ↗</a></li>` : ''}
          ${video ? `<li><b>Video:</b> “${esc(video.title)}”, ${esc(video.credit)}. <a href="${esc(video.page)}" target="_blank" rel="noopener">NASA page ↗</a></li>` : ''}
          ${rv ? rv.sources.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)} ↗</a></li>`).join('') : ''}
          <li>Our model, not NASA data: the battery each test and photo uses, the 30 W base load, how long a recharge takes, the ${MISSION_SOLS}-day limit, the photo bonus, the bar scores, the rock-sample bar, the 10° base limit and the stars. The fuzz and labels over the drive film are added by the game.</li></ul></div>
        <div class="rbox" style="grid-column:1/-1"><h3>Habitat commissioning</h3><div id="hab"></div></div>
        <div class="rbox" style="grid-column:1/-1"><h3>Mission log</h3><div class="logl">${m.log.map(e => `<div><span style="color:#5fd8f0">${esc(e.at)}</span> ${esc(e.text)}</div>`).join('')}</div></div>
      </div>
      <div class="actions" style="margin-top:18px"><button class="btn primary" id="replay">Replay with this crew</button><button class="btn" id="title">Return to title</button></div>`
    const hab = $('#hab', inner)
    const habGate = m.taskAvailable('habitat')
    if (m.completed.has('habitat')) hab.innerHTML = '<span class="donebadge">COMMISSIONED</span> Anchor foundation → seal pressure shell → energize life support. Crew quarters are pressurized.'
    else if (!B?.approved) hab.innerHTML = '<p style="margin:0;color:#b9ae95">Not offered: habitat commissioning needs a base.</p>'
    else if (habGate) hab.innerHTML = `<p style="margin:0;color:#ffb347">Not available: ${esc(habGate)}</p>`
    else sequenceTab(hab, render, { ...ctx, done: (t, d) => { ctx.done(t, d); render() } }, 'habitat')
    $('#replay', inner).addEventListener('click', onReplay)
    $('#title', inner).addEventListener('click', onTitle)
  }
  render()
  return s
}
