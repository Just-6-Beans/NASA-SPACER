// Mission report. First the plain result: the mission score, the tasks completed and the tasks
// missed, each with its points. The detail behind it (why it went this way, the rover, the
// greenhouse, the data sources, the log) is folded away underneath.
import { INSTRUMENTS, SUITS, byId } from '../core/data'
import { deliveryRocket } from '../core/delivery'
import type { Mission } from '../core/mission'
import { CAUSES, FIXES, RESCUE_LIMIT_SOLS, WEAR_LIMIT } from '../core/rescue'
import { ROCK_IDS, TUBE_COUNT, cacheRating, rock } from '../core/samples'
import { missionScore, type ScoreLine } from '../core/score'
import { RADIATION, ROUGHNESS_SOURCE, SOL_HOURS, TESTS, WEATHER_SOURCE, photoPlaces, region } from '../core/survey'
import { lightTimeSource } from '../data/opsDates'
import { ROVER_TASK_DATA, sampleFacts } from '../data/roverTasks'
import { STATION_CARDS, stationTaskDataLine } from '../data/stationTasks'
import { $, el, esc } from './dom'
import { sequenceTab, type PanelCtx } from './panels'
import { barsHtml, starsHtml } from './roverView'

/** The real event a task is modelled on, shown beside its name. */
const LIKE: Record<string, string> = {
  scrubber: 'Apollo 13, 1970', rationing: 'Apollo 13, 1970', cabin: 'the fire on Mir, 1997', water: "the space station's water recovery",
  schedule: 'a space station crew day', rescue: "Curiosity's stuck rock, 2026", samples: "Perseverance's sample tubes",
}
const line = (l: ScoreLine) => `<li class="${l.state}"><span class="mark">${l.state === 'done' ? '✓' : '✕'}</span>
  <div><b>${esc(l.name)}</b>${LIKE[l.id] ? `<i>like ${esc(LIKE[l.id])}</i>` : ''}<small>${esc(l.note)}</small></div>
  <em>${l.state === 'done' ? `+${l.points}` : l.points ? `+${l.points} of ${l.max}` : `0 of ${l.max}`}</em></li>`

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
    const score = missionScore(m)
    const outcome = !B ? 'No base was chosen.' : !B.approved ? 'No base was built: the crew stayed in orbit.' : `Base built at ${B.name}: ${B.reason}${m.completed.has('habitat') ? ' The habitat is commissioned.' : ''}`
    const good = !!B?.approved && B.level === 'good'
    // What would have added the most: the biggest points left behind.
    const left = [...score.missed].sort((a, b) => (b.max - b.points) - (a.max - a.points)).slice(0, 3).filter(l => l.max > l.points)
    const causes = m.causes().length ? m.causes() : m.stationCauses()
    const reports = rv ? m.reports() : []
    const del = m.delivery, rocket = del ? deliveryRocket(del.rocket) : null
    const res = m.rescue, tubes = m.samples
    const gh = m.greenhouse, gs = gh.score(), gt = gh.testResult, gr = gh.runResult
    const habGate = m.taskAvailable('habitat')
    const habOpen = !!B?.approved && !m.completed.has('habitat') && !habGate
    inner.innerHTML = `<div class="sim">Mission report</div><h1>${esc(m.profile.callSign)} · ${ship.name}</h1>
      <div class="score-hero ${good ? 'good' : ''}"><small>Mission Score</small><b>${score.total}</b><span>out of ${score.max} possible in this run</span></div>
      <p class="score-out">${esc(outcome)}${B?.approved ? ` ${starsHtml(B.stars)}` : ''}</p>
      ${habOpen ? '<div class="rbox" style="margin-bottom:12px"><h3>One task left: commission the habitat (+50)</h3><div id="hab"></div></div>' : ''}
      <div class="rgrid score-cols">
        <div class="rbox"><h3>Tasks you completed · ${score.done.length}</h3><ul class="score-list">${score.done.map(line).join('') || '<li class="none">Nothing yet.</li>'}</ul></div>
        <div class="rbox"><h3>Tasks you missed · ${score.missed.length}</h3><ul class="score-list">${score.missed.map(line).join('') || '<li class="none">Nothing missed. A clean run.</li>'}</ul>
          ${left.length ? `<p class="score-tip"><b>Next time:</b> ${left.map(l => `${esc(l.name.toLowerCase())} (up to +${l.max - l.points})`).join(', ')} would add the most.</p>` : ''}</div>
      </div>
      <details class="rbox more"><summary>Why it went this way</summary><ul>${causes.map(c => `<li style="color:${c.good ? 'var(--mint)' : 'var(--warn)'}">${c.good ? '＋' : '−'} ${esc(c.text)}</li>`).join('') || '<li>The rover never left the station\'s control room.</li>'}</ul></details>
      <details class="rbox more"><summary>Rover and base</summary>
        <div class="kv"><span>Crew</span><b>${esc(m.profile.callSign)} · <span style="color:${suit.light}">${suit.name}</span> suit · ${ship.name}</b><span>Instrument</span><b>${inst ? `${inst.name} (${inst.code})` : 'none'}</b>
          <span>Rover</span><b>${rv ? `${esc(rv.name)}, ${esc(region(m.region!).name)}` : 'none chosen'}</b>
          ${rocket && del ? `<span>Rocket</span><b>${esc(rocket.name)}, ${rocket.price} cr: ${del.ok ? 'reached Mars' : `failed, a backup flew, ${del.solsLost} Mars days lost`}</b>` : ''}
          ${rv ? `<span>Driven</span><b>${m.drives.reduce((a, x) => a + x.distM, 0)} m in ${m.drives.length} drive${m.drives.length === 1 ? '' : 's'}, ${m.recharges} recharge${m.recharges === 1 ? '' : 's'}</b><span>Mars days used</span><b>${Math.round((m.hoursUsed / SOL_HOURS) * 10) / 10} of ${m.missionSols}</b><span>Photo spots</span><b>${m.photos.length} of ${photoPlaces(rv).length} (+${m.photoBonus} on the base score)</b>` : ''}
          ${m.dust ? `<span>Dust storm</span><b>${Math.round(((m.dust.untilHours - m.dust.fromHours) / SOL_HOURS) * 10) / 10} Mars days of slower, costlier driving</b>` : ''}
          ${res ? `<span>Stuck rover</span><b>${esc(CAUSES[res.cause].name)} at spot ${esc(res.spot)}: ${res.tries.map(x => `${x.freed ? '✓' : '✕'} ${esc(FIXES[x.fix].name)}`).join(', ') || 'no fix tried'} · ${res.solsUsed} of ${RESCUE_LIMIT_SOLS} days · wheels ${m.wheelWear}% worn (limit ${WEAR_LIMIT}%)</b>` : ''}
          ${tubes ? `<span>Tubes sealed</span><b>${tubes.picks.map(id => `${esc(sampleFacts(id).name)} (+${rock(id).value})`).join(', ')} · ${tubes.picks.length} of ${TUBE_COUNT} · ${esc(cacheRating(tubes.value).word)}</b><span>Left behind</span><b>${ROCK_IDS.filter(id => !tubes.picks.includes(id)).map(id => `${esc(sampleFacts(id).name)} (${rock(id).value})`).join(', ') || 'nothing'}</b>` : ''}
          <span>Budget</span><b>${m.funds} cr left of ${ship.budget} cr after the launch</b></div>
        ${reports.length ? `<h3 style="margin-top:12px">Spots visited</h3><ul>${reports.map(r => `<li><b>${r.spot.label}</b>${B?.approved && B.id === r.spot.id ? ' (base)' : ''}: ${esc(r.verdict.title)} · ${r.score}/100 <span style="color:#b9ae95">· ${r.ground.source === 'rover' ? `real ${esc(rv!.name)} stop, sol ${r.ground.sol}` : 'orbit data (MOLA)'} · tests: ${m.testsFor(r.spot).map(t => TESTS[t].name.toLowerCase()).join(', ') || 'none'}</span></li>`).join('')}</ul>` : ''}
        ${B?.bars.length ? `<h3 style="margin-top:12px">Base site measurements (tap a bar for its source)</h3>${barsHtml(B.bars)}` : ''}</details>
      <details class="rbox more"><summary>Greenhouse · ${gs.total} of 100</summary>${gh.attempted
        ? `<div class="kv"><span>Grow Light (G1)</span><b>${gt ? `${gt.won ? 'Test passed' : 'Test failed'} · lowest plant health ${Math.round(gt.minHealth)}%` : 'Test not finished'}</b><span>What to Grow (G2)</span><b>${gr ? `${gr.won ? 'Crew fed' : 'Failed'} · ${Math.round(gr.kcalHarvested).toLocaleString('en-US')} kcal harvested · fed for ${gr.fedDays} of 30 days` : 'Not played'}</b><span>Pump failure</span><b>${!gr ? '—' : gr.pump ? `Yes: side ${gr.pump} was saved` : 'None in this run'}</b></div>
          <ul>${gs.parts.map(p => `<li>${esc(p.label)}: <b>${p.points}</b> of ${p.max} — <span style="color:#b9ae95">${esc(p.why)}</span></li>`).join('')}</ul>`
        : '<p style="margin:0;color:#b9ae95">Not started. The greenhouse is optional.</p>'}</details>
      <details class="rbox more"><summary>Data sources</summary><ul class="xsrcs">
        ${rv ? `<li><b>${esc(rv.name)} stops, photos and map:</b> ${esc(rv.area.provider)}, saved ${esc(rv.area.retrieved)}. ${esc(rv.area.credit)}</li>` : ''}
        <li><b>Weather:</b> ${esc(WEATHER_SOURCE.provider)}, ${esc(WEATHER_SOURCE.location)}. <b>Radiation:</b> ${esc(RADIATION.provider)}. <b>Roughness:</b> ${esc(ROUGHNESS_SOURCE.provider)}.</li>
        <li><b>Signal delay:</b> ${m.signalMin} min one way. Light time ${d.lightMin} min: ${esc(lightTimeSource(d))}. The relay hand-off is our model.</li>
        <li><b>Rocket, rock samples and stuck rovers:</b> NASA and JPL pages, saved ${esc(ROVER_TASK_DATA.retrieved)}.</li>
        <li><b>The real events behind the station tasks:</b> ${STATION_CARDS.map(c => `<a href="${esc(c.backing[0].source.url)}" target="_blank" rel="noopener">${esc(c.title)}</a>`).join(' · ')}. ${esc(stationTaskDataLine())}.</li>
        ${rv ? rv.sources.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a></li>`).join('') : ''}
        <li>Our model, not NASA data: every rule of the station tasks and alerts, what each task is worth, battery costs, recharge times, the ${m.missionSols}-day limit, rocket success rates, getting stuck, the dust storm's effect, the value of each rock and the site score.</li></ul></details>
      <details class="rbox more"><summary>Mission log</summary><div class="logl">${m.log.map(e => `<div><span style="color:#5fd8f0">${esc(e.at)}</span> ${esc(e.text)}</div>`).join('')}</div></details>
      <div class="actions" style="margin-top:18px"><button class="btn primary" id="replay">Play again with this crew</button><button class="btn" id="title">Return to title</button></div>`
    const hab = inner.querySelector<HTMLElement>('#hab')
    if (hab) sequenceTab(hab, render, { ...ctx, done: (t, x) => { ctx.done(t, x); render() } }, 'habitat')
    $('#replay', inner).addEventListener('click', onReplay)
    $('#title', inner).addEventListener('click', onTitle)
  }
  render()
  return s
}
