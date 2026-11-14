// Landing site selection and the mission report (built from actual mission events).
import { EXTRAS, INSTRUMENTS, MISSION_BUDGET, ROUTES, SCANS, SITES, SUITS, byId, type SiteId } from '../core/data'
import { cargoKg, designCost, launchCauses } from '../core/loadout'
import { TASK_INFO, type Mission } from '../core/mission'
import { fmt, fmtTemp } from '../core/rover'
import type { TaskId } from '../core/tasks'
import { lightTimeSource, opsDate, seasonNote, weatherSource } from '../data/opsDates'
import { sound } from '../audio'
import { asset } from '../game/game'
import { $, $$, el, esc } from './dom'
import { ICONS } from './icons'
import { sequenceTab, type PanelCtx } from './panels'

export function sitesScreen(m: Mission, onBack: () => void, onDecided: () => void): HTMLElement {
  const s = el('<section class="sites" aria-label="Landing sites"><div class="sites-inner"></div></section>')
  const inner = $('.sites-inner', s)
  let err = ''
  let sel: SiteId = SITES.find(x => m.assess(x.id).canLand)?.id ?? 'shelf'
  const decide = (id: SiteId | 'defer') => {
    const e = m.decideLanding(id)
    if (e) { err = e; sound.play('fail'); render(); return }
    sound.play(m.landing!.approved ? 'success' : 'ui')
    onDecided()
  }
  const render = () => {
    const rd = m.receivedReading
    const site = byId(SITES, sel)
    const a = m.assess(sel)
    inner.innerHTML = `<div class="row" style="justify-content:space-between;align-items:flex-end"><div><div class="sim">Simulated sites · decision at T+${fmt(m.clock)}</div><h1>Select a habitat site</h1></div>
      <div class="row"><div class="ledger" style="margin:0"><span>Available funds</span><b>${m.funds} cr</b><span>Ice evidence</span><b>${rd ? `${rd.estimate}% ±${rd.uncertainty} (low ${rd.low}%)` : 'none received'}</b></div><button class="btn small" id="back">← Rover</button></div></div>
      <div class="site-cards" role="radiogroup" aria-label="Landing sites">${SITES.map(x => {
        const v = m.assess(x.id)
        const tag = { clear: 'CLEAR', 'needs-water': `NEEDS WATER · ${v.cost} cr`, closed: 'WINDOW CLOSED', held: 'HELD', 'needs-package': `PACKAGE · ${v.cost} cr` }[v.status]
        return `<button class="site ${x.id === sel ? 'sel' : ''}" role="radio" aria-checked="${x.id === sel}" data-pick="${x.id}"><div class="sitehead"><span class="slash1"></span>${x.name}</div>
          <div style="position:relative"><img src="${asset(`site-${x.id}.svg`)}" alt="${x.name} illustration" /><span class="tagv ${v.status}">${tag}</span></div></button>`
      }).join('')}</div>
      <div class="attrs">
        <div>${ICONS.snow}<b>Ice evidence</b><span>${esc(site.evidence)}</span></div>
        <div>${ICONS.mountain}<b>Terrain</b><span>${esc(site.terrain)}</span></div>
        <div>${ICONS.sun}<b>Surface power</b><span>${esc(site.power)}</span></div>
        <div>${ICONS.warn}<b>Risk</b><span>${esc(site.risk)}</span></div>
      </div>
      <div class="verdictline ${a.status}"><b>${site.name}:</b> ${esc(a.reason)}</div>
      ${err ? `<div class="feedback bad">${esc(err)}</div>` : ''}
      <div class="site-actions"><button class="btn" id="defer">Defer landing · stay in orbit</button><button class="btn primary" id="confirm" ${a.canLand ? '' : 'disabled'}>${a.canLand ? (a.cost ? `Confirm site · ${a.cost} cr` : 'Confirm site') : esc(a.action)}</button></div>`
    $('#back', inner).addEventListener('click', onBack)
    $$('[data-pick]', inner).forEach(b => b.addEventListener('click', () => { sel = b.dataset.pick as SiteId; err = ''; sound.play('ui'); render() }))
    $('#confirm', inner).addEventListener('click', () => decide(sel))
    $('#defer', inner).addEventListener('click', () => decide('defer'))
  }
  render()
  return s
}

export function reportScreen(m: Mission, ctx: PanelCtx, onReplay: () => void, onTitle: () => void): HTMLElement {
  const s = el('<section class="report" aria-label="Mission report"><div class="report-inner"></div></section>')
  const inner = $('.report-inner', s)
  const render = () => {
    const ship = m.ship
    const suit = byId(SUITS, m.profile.suit)
    const inst = m.instrument ? byId(INSTRUMENTS, m.instrument) : null
    const l = m.loadout, cost = l ? designCost(ship, l) : null
    const launch = m.profile.launch ? launchCauses(ship, m.profile.launch) : null
    const p = m.pass, plan = m.plan
    const d = plan ? opsDate(plan.date) : null
    const L = m.landing
    const site = L && L.site !== 'defer' ? byId(SITES, L.site) : null
    const good = !!L?.approved
    const routine: TaskId[] = ['battery', 'cargo', 'water', 'medical']
    const habGate = m.taskAvailable('habitat')
    const verdict = !L ? 'No landing decision' : L.site === 'defer' ? 'Landing deferred · crew remains in orbit' : `Landing approved · ${site!.name}${m.completed.has('habitat') ? ' · habitat commissioned' : ''}`
    inner.innerHTML = `<div class="sim">Mission report · simulated scenario</div><h1>${esc(m.profile.callSign)} · ${ship.name}</h1>
      <div class="verdict-big ${good ? 'good' : 'mid'}">${esc(verdict)}</div>
      <div class="rgrid">
        <div class="rbox"><h3>Crew & spacecraft</h3><div class="kv"><span>Call sign</span><b>${esc(m.profile.callSign)}</b><span>Suit</span><b style="color:${suit.light}">${suit.name}</b><span>Launch system</span><b>${ship.name}</b><span>Cargo</span><b>${l ? `${cargoKg(l)} kg: ${[...l.instruments.map(id => byId(INSTRUMENTS, id).code), ...l.extras.map(id => byId(EXTRAS, id).name.toLowerCase())].join(', ')}` : 'not recorded'}</b><span>Instrument</span><b>${inst ? `${inst.name} (${inst.code})` : 'none'}</b></div></div>
        <div class="rbox"><h3>Preparation</h3><ul>${(['relay', 'calibration', ...routine] as TaskId[]).map(t => `<li>${m.completed.has(t) ? '✓' : '○'} ${TASK_INFO[t].name}${m.completed.has(t) ? ` — <span style="color:#b9ae95">${TASK_INFO[t].reward}</span>` : t === 'calibration' ? ' — skipped (+9 uncertainty)' : ' — not done'}</li>`).join('')}</ul></div>
        <div class="rbox"><h3>Transmission</h3>${plan && p && d ? `<div class="kv"><span>Operations date</span><b>${d.label}</b><span>Power at send</span><b>${plan.power.life}/${plan.power.comms}/${plan.power.research}</b><span>Route · scan</span><b>${byId(ROUTES, plan.route).name} · ${byId(SCANS, plan.scan).name}</b><span>Signal leg</span><b>${fmt(p.uplink)} min each way</b><span>Drive began</span><b>T+${fmt(p.commands[0].start)}</b><span>Final telemetry</span><b>T+${fmt(p.finalTelemetryAt)}</b></div>` : 'No plan transmitted.'}</div>
        <div class="rbox"><h3>Evidence & rover</h3>${p ? `<div class="kv"><span>Ice reading</span><b>${p.reading ? `${p.reading.estimate}% ±${p.reading.uncertainty} (low ${p.reading.low}%) · ${p.reading.strong ? 'strong' : 'weak'}` : 'none (scan incomplete)'}</b><span>Received at</span><b>${p.readingAt !== null ? `T+${fmt(p.readingAt)}` : '—'}</b><span>Outcome</span><b>${p.returned ? 'Returned to base' : `Reserve stop · safe mode at T+${fmt(p.safeMode!.at)}`}</b><span>Final battery</span><b>${p.finalBattery}%</b></div>` : '—'}</div>
        <div class="rbox"><h3>Budget</h3><div class="kv">${l && cost ? `<span>Mission budget</span><b>${MISSION_BUDGET} cr</b><span>Launch</span><b>−${cost.launch} cr</b><span>Instruments</span><b>−${cost.instruments} cr</b><span>Supplies</span><b>${cost.extras ? `−${cost.extras} cr` : '0'}</b>` : `<span>Budget</span><b>${ship.budget} cr</b><span>Instrument</span><b>${inst ? `−${inst.cost} cr` : '0'}</b>`}<span>Cargo reward</span><b>${m.completed.has('cargo') ? '+5 cr' : '0'}</b><span>Landing spend</span><b>${L ? `−${L.spent} cr` : '0'}</b><span>Remaining</span><b>${m.funds} cr</b></div></div>
        <div class="rbox"><h3>Landing rationale</h3><p style="margin:0">${L ? esc(L.reason) : 'No decision recorded.'}</p></div>
        ${launch ? `<div class="rbox" style="grid-column:1/-1"><h3>What decided the launch</h3>
          <div class="causes"><div class="cause ${launch.ok ? 'ok' : 'bad'}"><b>${launch.ok ? '✓' : '✗'} ${esc(launch.headline)}</b><ul>${launch.parts.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
          <p class="dataline" style="margin:10px 0 0"><span class="tag model">Our model</span>The ascent, the cargo masses and the ratings. The launch systems are real; their thrust and weight at lift-off are NASA figures where NASA gives them.</p></div>` : ''}
        ${plan && d ? `<div class="rbox" style="grid-column:1/-1"><h3>What decided the rover pass</h3>
          <div class="causes">${m.causes.map(c => `<div class="cause ${c.ok ? 'ok' : 'bad'}"><b>${c.ok ? '✓' : '✗'} ${esc(c.headline)}</b><ul>${c.parts.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>
          <p class="dataline" style="margin:10px 0 0"><span class="tag real">NASA data</span>Light time ${fmt(plan.lightMin)} min: ${esc(lightTimeSource(d))}. Night low ${fmtTemp(plan.nightLowC)}: ${esc(weatherSource(d))}. ${esc(seasonNote(d))}<br/><span class="tag model">Our model</span>The relay hand-off, heater draw, drive and scan times, battery points and ice reading.</p></div>` : ''}
        <div class="rbox" style="grid-column:1/-1"><h3>Habitat commissioning</h3><div id="hab"></div></div>
        <div class="rbox" style="grid-column:1/-1"><h3>Mission log</h3><div class="logl">${m.log.map(e => `<div><span style="color:#5fd8f0">${esc(e.at)}</span> ${esc(e.text)}</div>`).join('')}</div></div>
      </div>
      <div class="actions" style="margin-top:18px"><button class="btn primary" id="replay">Replay with this crew</button><button class="btn" id="title">Return to title</button></div>`
    const hab = $('#hab', inner)
    if (m.completed.has('habitat')) hab.innerHTML = '<span class="donebadge">COMMISSIONED</span> Anchor foundation → seal pressure shell → energize life support. Crew quarters are pressurized.'
    else if (!L?.approved) hab.innerHTML = '<p style="margin:0;color:#b9ae95">Not offered: habitat commissioning requires an approved landing.</p>'
    else if (habGate) hab.innerHTML = `<p style="margin:0;color:#ffb347">Not available: ${esc(habGate)}</p>`
    else sequenceTab(hab, render, { ...ctx, done: (t, d) => { ctx.done(t, d); render() } }, 'habitat')
    $('#replay', inner).addEventListener('click', onReplay)
    $('#title', inner).addEventListener('click', onTitle)
  }
  render()
  return s
}
