// Mission report, built from what actually happened: the drives, every spot and its tests, the
// base that was built, and the choices that decided the outcome.
import { INSTRUMENTS, SUITS, byId } from '../core/data'
import { deliveryRocket } from '../core/delivery'
import { TASK_INFO, type Mission } from '../core/mission'
import { CAUSES, FIXES, RESCUE_LIMIT_SOLS, WEAR_LIMIT, WORN_SPEED } from '../core/rescue'
import { mmrtgNowW } from '../core/rovers'
import { cacheRating, rock } from '../core/samples'
import { DRIVE_FILMS, RADIATION, ROUGHNESS_SOURCE, SOL_HOURS, TESTS, WEATHER_SOURCE, photoPlaces, region } from '../core/survey'
import type { TaskId } from '../core/tasks'
import { lightTimeSource } from '../data/opsDates'
import { ROVER_ROCKET_FACTS, ROVER_TASK_DATA, SAMPLE_FACTS, sampleFacts, taskCard, taskSources } from '../data/roverTasks'
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
    const B = m.base
    const rv = m.rover
    const d = m.ops
    const good = B?.approved && B.level === 'good'
    const routine: TaskId[] = ['battery', 'cargo', 'water', 'medical', 'greenhouse']
    const gh = m.greenhouse, gs = gh.score(), gt = gh.testResult, gr = gh.runResult, sb = m.scoreboard
    const verdict = !B ? 'No base decision' : !B.approved ? 'No base built · crew remains in orbit' : `Base built at ${B.name}${m.completed.has('habitat') ? ' · habitat commissioned' : ''}`
    const causes = m.causes()
    const reports = rv ? m.reports() : []
    const film = rv ? DRIVE_FILMS.find(x => x.rover === rv.id) : null
    const del = m.delivery, rocket = del ? deliveryRocket(del.rocket) : null
    const res = m.rescue, tubes = m.samples
    const link = (x: { provider: string; url: string }) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.provider)}</a>`
    inner.innerHTML = `<div class="sim">Mission report · real NASA data, our game model on top</div><h1>${esc(m.profile.callSign)} · ${ship.name}</h1>
      <div class="verdict-big ${good ? 'good' : 'mid'}">${esc(verdict)}${B?.approved ? ` · ${B.score}/100 ${starsHtml(B.stars)}` : ''}</div>
      ${B?.approved ? `<p style="margin:-6px 0 14px">${esc(B.reason)}</p>` : ''}
      <div class="rgrid">
        <div class="rbox" style="grid-column:1/-1"><h3>What decided the outcome</h3><ul>${causes.map(c => `<li style="color:${c.good ? 'var(--mint)' : 'var(--warn)'}">${c.good ? '＋' : '−'} ${esc(c.text)}</li>`).join('') || '<li>The rover never left the station\'s control room.</li>'}</ul></div>
        <div class="rbox"><h3>Crew & spacecraft</h3><div class="kv"><span>Call sign</span><b>${esc(m.profile.callSign)}</b><span>Suit</span><b style="color:${suit.light}">${suit.name}</b><span>Ship</span><b>${ship.name} · ${ship.role}</b><span>Instrument</span><b>${inst ? `${inst.name} (${inst.code})` : 'none'}</b></div></div>
        <div class="rbox"><h3>Preparation</h3><ul>${(['relay', 'calibration', ...routine] as TaskId[]).map(t => `<li>${m.completed.has(t) ? '✓' : '○'} ${TASK_INFO[t].name}${m.completed.has(t) ? ` — <span style="color:#b9ae95">${TASK_INFO[t].reward}</span>` : ' — not done'}</li>`).join('')}</ul></div>
        <div class="rbox"><h3>Rover & crater</h3><div class="kv"><span>Rover</span><b>${rv ? esc(rv.name) : '—'}</b><span>Crater</span><b>${m.region ? esc(region(m.region).name) : '—'}</b>${rv ? `<span>MMRTG now</span><b>${mmrtgNowW(rv)} W</b><span>Battery</span><b>${esc(rv.batteryText)}</b><span>Charge left</span><b>${m.batteryWh} Wh</b><span>Driven</span><b>${m.drives.reduce((a, x) => a + x.distM, 0)} m, ${m.drives.reduce((a, x) => a + x.climbM, 0)} m of climb</b><span>Mars days used</span><b>${Math.round((m.hoursUsed / SOL_HOURS) * 10) / 10} of ${m.missionSols}</b><span>Recharges</span><b>${m.recharges}</b><span>Photo spots saved</span><b>${m.photos.length} of ${photoPlaces(rv).length} (+${m.photoBonus} score)</b>` : ''}</div></div>
        <div class="rbox"><h3>Rover's rocket</h3>${del && rocket ? `<div class="kv"><span>Rocket</span><b>${esc(rocket.name)}</b><span>Cost</span><b>−${rocket.price} cr</b><span>Chance of success</span><b>${rocket.successPct}% (our model)</b><span>Outcome</span><b style="color:${del.ok ? 'var(--mint)' : 'var(--warn)'}">${del.ok ? 'Reached Mars' : `Failed: a backup flew, ${del.solsLost} Mars days lost`}</b></div>` : '<p style="margin:0;color:#b9ae95">No rocket was chosen: the rover never left Earth.</p>'}</div>
        <div class="rbox"><h3>Stuck rover rescue</h3>${res ? `<div class="kv"><span>Where</span><b>Spot ${esc(res.spot)}</b><span>Cause</span><b>${esc(CAUSES[res.cause].name)}</b><span>Your reading</span><b style="color:${res.diagnosis === res.cause ? 'var(--mint)' : 'var(--warn)'}">${res.diagnosis ? esc(CAUSES[res.diagnosis].name) : 'none'}</b><span>Fixes tried</span><b>${res.tries.map(x => `${x.freed ? '✓' : '✕'} ${esc(FIXES[x.fix].name)}`).join(', ') || 'none'}</b><span>Mars days held</span><b>${res.solsUsed} of ${RESCUE_LIMIT_SOLS}</b><span>Wheel wear</span><b style="color:${m.wheelsWorn ? 'var(--warn)' : 'var(--mint)'}">${m.wheelWear}% (limit ${WEAR_LIMIT}%)</b><span>Top speed</span><b>${m.wheelsWorn ? `${Math.round(WORN_SPEED * 100)}% for the rest of the mission` : '100%'}</b></div>` : '<p style="margin:0;color:#b9ae95">No wheel trouble on this mission.</p>'}</div>
        <div class="rbox" style="grid-column:1/-1"><h3>Sample tubes${tubes ? ` · ${tubes.value}/100` : ''}</h3>${tubes ? `<div class="kv"><span>Sealed</span><b>${tubes.picks.map(id => `${esc(sampleFacts(id).name)} (+${rock(id).value})`).join(', ')}</b><span>Left behind</span><b>${m.rocks.filter(id => !tubes.picks.includes(id)).map(id => `${esc(sampleFacts(id).name)} (${rock(id).value})`).join(', ')}</b><span>Verdict</span><b>${esc(cacheRating(tubes.value).word)}</b><span>Scans</span><b>${tubes.clear ? 'Read clearly: the instrument was calibrated' : 'Faint: the instrument was not calibrated'}</b></div>
          <p style="margin:8px 0 0;color:#b9ae95">The five rocks are modelled on samples Perseverance really sealed (NASA's catalog). Their values are our model.</p>` : '<p style="margin:0;color:#b9ae95">No tubes were filled: the rover never cored at the sample site, so the Rock samples check scored 0.</p>'}</div>
        <div class="rbox" style="grid-column:1/-1"><h3>Station greenhouse (optional) · ${gs.total}/100</h3>${gh.attempted
          ? `<div class="kv"><span>Grow Light (G1)</span><b>${gt ? `${gt.won ? 'Test passed' : 'Test failed'} · lowest plant health ${Math.round(gt.minHealth)}%` : 'Test not finished'}</b><span>What to Grow (G2)</span><b>${gr ? `${gr.won ? 'Crew fed' : 'Failed'} · ${Math.round(gr.kcalHarvested).toLocaleString('en-US')} kcal harvested · fed for ${gr.fedDays} of 30 days` : 'Not played'}</b><span>Water left</span><b>${gr ? `${Math.round(gr.waterL)} of ${Math.round(gr.tankL)} L` : '—'}</b><span>Pump failure</span><b>${!gr ? '—' : gr.pump ? `Yes: side ${gr.pump} was saved` : 'None in this run'}</b></div>
            <ul>${gs.parts.map(p => `<li>${esc(p.label)}: <b>${p.points}</b> of ${p.max} — <span style="color:#b9ae95">${esc(p.why)}</span></li>`).join('')}</ul>`
          : '<p style="margin:0;color:#b9ae95">Not started. The greenhouse is optional and is scored on its own line.</p>'}
          <p style="margin:8px 0 0"><b>Mission total: ${sb.total}</b> = base ${sb.base} + greenhouse ${sb.greenhouse} · ${sb.tasks} task${sb.tasks === 1 ? '' : 's'} completed. The greenhouse missions follow NASA plant research; every greenhouse number is our game model.</p></div>
        <div class="rbox"><h3>Supplies</h3><div class="kv"><span>Budget</span><b>${ship.budget} cr</b><span>Instrument</span><b>${inst ? `−${inst.cost} cr` : '0'}</b><span>Rover's rocket</span><b>${rocket ? `−${rocket.price} cr` : '0'}</b><span>Cargo reward</span><b>${m.completed.has('cargo') ? '+5 cr' : '0'}</b><span>Remaining</span><b>${m.funds} cr</b></div></div>
        <div class="rbox" style="grid-column:1/-1"><h3>Spots visited</h3>${reports.length ? `<ul>${reports.map(r => `<li><b>${r.spot.label}</b>${B?.approved && B.id === r.spot.id ? ' (base)' : ''}: ${esc(r.verdict.title)} · ${r.score}/100<br/><span style="color:#b9ae95">${r.ground.source === 'rover' ? `Real ${esc(rv!.name)} stop, sol ${r.ground.sol}` : 'Orbit data (MOLA)'} · tests: ${m.testsFor(r.spot).map(t => TESTS[t].name.toLowerCase()).join(', ') || 'none'}</span></li>`).join('')}</ul>` : '<p style="margin:0">No rover was chosen.</p>'}</div>
        <div class="rbox" style="grid-column:1/-1"><h3>Base site measurements (tap a bar for its source)</h3>${B?.bars.length ? barsHtml(B.bars) : '<p style="margin:0">No base was built.</p>'}</div>
        <div class="rbox" style="grid-column:1/-1"><h3>Data sources</h3><ul class="xsrcs">
          ${rv ? `<li><b>${esc(rv.name)} stops and photos:</b> ${esc(rv.area.provider)}, saved ${esc(rv.area.retrieved)}. ${esc(rv.area.credit)}</li>
          <li><b>Map picture:</b> ${esc(rv.satellite.provider)}, saved ${esc(rv.satellite.retrieved)}. <a href="${esc(rv.satellite.page)}" target="_blank" rel="noopener">NASA's map</a></li>
          <li><b>Map heights:</b> ${esc(rv.area.mola.provider)}. ${esc(rv.area.mola.note)}</li>
          <li><b>Rover pictures:</b> real selfie “${esc(rv.selfie.title)}”, ${esc(rv.selfie.credit)}; parts picture “${esc(rv.partsPicture.title)}” (an artist's concept, not a photo), ${esc(rv.partsPicture.credit)}.</li>` : ''}
          <li><b>Weather:</b> ${esc(WEATHER_SOURCE.provider)}, ${esc(WEATHER_SOURCE.location)}, saved ${esc(WEATHER_SOURCE.retrieved)}. ${esc(WEATHER_SOURCE.note)}</li>
          <li><b>Radiation:</b> ${esc(RADIATION.provider)}. ${esc(RADIATION.note)}</li>
          <li><b>Terrain roughness:</b> ${esc(ROUGHNESS_SOURCE.provider)}, saved ${esc(ROUGHNESS_SOURCE.retrieved)}.</li>
          <li><b>Signal delay:</b> ${m.signalMin} min one way. Light time ${d.lightMin} min: ${esc(lightTimeSource(d))}. The relay hand-off is our model.</li>
          <li><b>Rover's rocket:</b> which rocket flew each rover, what NASA paid, and the spacecraft's launch mass. ${taskSources(ROVER_ROCKET_FACTS.flatMap(r => [...r.brief, ...(r.cost ? [r.cost] : [])])).slice(0, 4).map(link).join(' · ')}. What a Falcon 9 can send to Mars is SpaceX's figure, not NASA's.</li>
          <li><b>Rock samples:</b> five samples from NASA's catalog of what Perseverance has sealed, saved ${esc(ROVER_TASK_DATA.retrieved)}. ${link(SAMPLE_FACTS[0].catalog[0].source)}</li>
          <li><b>Stuck rovers and worn wheels:</b> ${(['rock-delay', 'wheel-wear', 'sand-trap'] as const).map(id => link(taskCard(id).backing[0].source)).join(' · ')}</li>
          ${film ? `<li><b>Drive film:</b> “${esc(film.title)}”, ${esc(film.credit)}. ${esc(film.note)} <a href="${esc(film.page)}" target="_blank" rel="noopener">NASA page</a></li>` : ''}
          ${rv ? rv.sources.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a></li>`).join('') : ''}
          <li>Our model, not NASA data: the battery each test uses, the 30 W base load, how long a recharge takes, the ${m.missionSols}-day limit, the photo bonus, the bar scores, the 10° base limit and the stars; the rocket's price in credits, its chance of success and the Mars days a failed launch costs; how often the rover gets stuck, its telemetry, the fixes and wheel wear; the scan read-outs and the science value of each rock. The fuzz and labels over the drive film are added by the game.</li></ul></div>
        <div class="rbox" style="grid-column:1/-1"><h3>Habitat commissioning</h3><div id="hab"></div></div>
        <div class="rbox" style="grid-column:1/-1"><h3>Mission log</h3><div class="logl">${m.log.map(e => `<div><span style="color:#5fd8f0">${esc(e.at)}</span> ${esc(e.text)}</div>`).join('')}</div></div>
      </div>
      <div class="actions" style="margin-top:18px"><button class="btn primary" id="replay">Replay with this crew</button><button class="btn" id="title">Return to title</button></div>`
    const hab = $('#hab', inner)
    const habGate = m.taskAvailable('habitat')
    if (m.completed.has('habitat')) hab.innerHTML = '<span class="donebadge">COMMISSIONED</span> Anchor foundation → seal pressure shell → energize life support. Crew quarters are pressurized.'
    else if (!B?.approved) hab.innerHTML = '<p style="margin:0;color:#b9ae95">Not offered: habitat commissioning needs a base.</p>'
    else if (habGate) hab.innerHTML = `<p style="margin:0;color:#ffb347">Not available: ${esc(habGate)}</p>`
    else sequenceTab(hab, render, { ...ctx, done: (t, x) => { ctx.done(t, x); render() } }, 'habitat')
    $('#replay', inner).addEventListener('click', onReplay)
    $('#title', inner).addEventListener('click', onTitle)
  }
  render()
  return s
}
