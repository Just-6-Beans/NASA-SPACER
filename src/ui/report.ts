// Landing site selection and the mission debrief (built from actual mission events).
//
// The debrief answers three questions in order: what happened, which choices caused it, and what
// to change next time. The full flight record is still there, one tap down.
import { INSTRUMENTS, PREP_HOURS, ROUTES, SCANS, SITES, SUITS, byId, type SiteId } from '../core/data'
import { PREP_COST, TASK_INFO, type Mission } from '../core/mission'
import { fmt, fmtTemp } from '../core/rover'
import type { TaskId } from '../core/tasks'
import { lightTimeSource, opsDate, seasonNote, weatherSource } from '../data/opsDates'
import { sound } from '../audio'
import { asset } from '../game/game'
import { $, $$, el, esc, lower1 } from './dom'
import { suggestions } from './forecast'
import { ICONS } from './icons'
import { sequenceTab, type PanelCtx } from './panels'
import { phaseRail } from './phase'

export function sitesScreen(m: Mission, onBack: () => void, onDecided: () => void, onStation: () => void): HTMLElement {
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
    const h = m.prepLeft
    // The habitat needs the medical check. Say so before the landing is final, while it can still be done.
    const medical = m.completed.has('medical') ? '' : `<div class="feedback warn medwarn"><span>The crew has no medical clearance. You can land, but the habitat could not be commissioned and the mission would stay incomplete. ${h > 0 ? `You still have ${h} crew-hour${h === 1 ? '' : 's'} for the check.` : 'No crew-hours are left for the check.'}</span>${h > 0 ? '<button class="btn small" id="tomed">Go to Hab Systems first</button>' : ''}</div>`
    inner.innerHTML = `${phaseRail('decide')}
      <div class="row" style="justify-content:space-between;align-items:flex-end;margin-top:10px"><div><div class="sim">Simulated sites · decision at T+${fmt(m.clock)}</div><h1>Choose the landing site</h1></div>
      <div class="row"><div class="ledger" style="margin:0"><span>Credits left</span><b>${m.funds} cr</b><span>Ice evidence</span><b>${rd ? `${rd.estimate}% ±${rd.uncertainty} · low end ${rd.low}% · ${rd.strong ? 'strong' : 'weak'}` : 'none received'}</b></div><button class="btn small" id="back">← Rover</button></div></div>
      <div class="site-cards" role="radiogroup" aria-label="Landing sites">${SITES.map(x => {
        const v = m.assess(x.id)
        const tag = v.status === 'clear' ? 'CLEAR · NO COST' : v.status === 'needs-water' ? `NEEDS WATER · ${v.cost} cr` : v.status === 'closed' ? 'WINDOW CLOSED' : v.status === 'held' ? 'HELD' : `${v.canLand ? 'OPEN' : 'TOO COSTLY'} · ${v.cost} cr`
        return `<button class="site ${x.id === sel ? 'sel' : ''} ${v.canLand ? '' : 'shut'}" role="radio" aria-checked="${x.id === sel}" data-pick="${x.id}"><div class="sitehead"><span class="slash1"></span>${x.name}</div>
          <div style="position:relative"><img src="${asset(`site-${x.id}.svg`)}" alt="${x.name} illustration" /><span class="tagv ${v.canLand ? v.status : v.status === 'needs-package' || v.status === 'needs-water' ? 'closed' : v.status}">${tag}</span></div>
          <div class="siteneeds">${esc(x.needs)}</div></button>`
      }).join('')}</div>
      <div class="attrs">
        <div>${ICONS.snow}<b>Ice evidence</b><span>${esc(site.evidence)}</span></div>
        <div>${ICONS.mountain}<b>Terrain</b><span>${esc(site.terrain)}</span></div>
        <div>${ICONS.sun}<b>Surface power</b><span>${esc(site.power)}</span></div>
        <div>${ICONS.warn}<b>Risk</b><span>${esc(site.risk)}</span></div>
      </div>
      <div class="verdictline ${a.canLand ? a.status : a.status === 'held' ? 'held' : 'closed'}"><b>${site.name}:</b> ${esc(a.reason)}</div>
      ${medical}
      ${err ? `<div class="feedback bad">${esc(err)}</div>` : ''}
      <div class="site-actions"><button class="btn" id="defer">Defer landing · stay in orbit</button><button class="btn primary" id="confirm" ${a.canLand ? '' : 'disabled'}>${a.canLand ? (a.cost ? `Land at ${site.name} · ${a.cost} cr` : `Land at ${site.name}`) : esc(a.action)}</button></div>`
    $('#back', inner).addEventListener('click', onBack)
    $('#tomed', inner)?.addEventListener('click', onStation)
    $$('[data-pick]', inner).forEach(b => b.addEventListener('click', () => { sel = b.dataset.pick as SiteId; err = ''; sound.play('ui'); render() }))
    $('#confirm', inner).addEventListener('click', () => decide(sel))
    $('#defer', inner).addEventListener('click', () => decide('defer'))
  }
  render()
  return s
}

export interface ReportNav {
  /** Fly again with the same crew and the last design kept, to change one thing. */
  refly: () => void
  /** Start over from the spacecraft choice. */
  newMission: () => void
  title: () => void
}

export function reportScreen(m: Mission, ctx: PanelCtx, nav: ReportNav): HTMLElement {
  const s = el('<section class="report" aria-label="Mission debrief"><div class="report-inner"></div></section>')
  const inner = $('.report-inner', s)
  const render = () => {
    const ship = m.ship
    const suit = byId(SUITS, m.profile.suit)
    const inst = m.instrument ? byId(INSTRUMENTS, m.instrument) : null
    const p = m.pass, plan = m.plan
    const d = plan ? opsDate(plan.date) : null
    const L = m.landing
    const site = L && L.site !== 'defer' ? byId(SITES, L.site) : null
    const hasMedical = m.completed.has('medical'), habDone = m.completed.has('habitat')
    const canMedical = !!L?.approved && !hasMedical && !m.prepBlock('medical')
    const prepTasks: TaskId[] = ['medical', 'calibration', 'battery', 'water', 'cargo']

    // What happened, at one of three honest levels: complete, landed without the habitat, deferred.
    const out: { cls: 'good' | 'mid' | 'part'; title: string; why: string } =
      !L ? { cls: 'mid', title: 'No landing decision', why: 'The mission ended before a landing was decided.' }
        : L.site === 'defer' ? { cls: 'part', title: 'Landing deferred', why: 'The crew stays safe in orbit. A valid call, but the mission is not complete.' }
          : habDone ? { cls: 'good', title: 'Mission complete', why: `The crew landed at ${site!.name} and the habitat is commissioned.` }
            : hasMedical ? { cls: 'mid', title: 'Landed. One step left', why: `Landing approved at ${site!.name}. Commission the habitat below to complete the mission.` }
              : canMedical ? { cls: 'mid', title: 'Landed. Two steps left', why: `Landing approved at ${site!.name}, but the crew has no medical clearance. You kept a crew-hour: run the check below, then commission the habitat.` }
                : { cls: 'part', title: 'Landed, mission incomplete', why: `The crew landed at ${site!.name}, but the habitat cannot be commissioned: the crew medical check was not done and no crew-hours are left.` }

    // Which choices caused it: the rules' three causes of the pass, then preparation and the landing.
    const cause = (ok: boolean, head: string, parts: string[]) => `<div class="cause ${ok ? 'ok' : 'bad'}"><b>${ok ? '✓' : '✗'} ${esc(head)}</b><ul>${parts.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`
    const relayLine = m.completed.has('relay') ? 'Relay: fully repaired, for a crew-hour' : m.relayPatched ? 'Relay: patched, for free' : 'Relay: not fixed'
    const prepCause = cause(hasMedical,
      hasMedical ? `Crew-hours: ${m.prepSpent} of ${PREP_HOURS} used, and the crew is cleared for the habitat.` : `Crew-hours: ${m.prepSpent} of ${PREP_HOURS} used, none of them on the crew medical check.`,
      [relayLine, ...prepTasks.map(t => `${m.completed.has(t) ? 'Done' : 'Skipped'}: ${TASK_INFO[t].name}${m.completed.has(t) ? '' : ` (${lower1(TASK_INFO[t].reward)})`}`)])
    const landCause = L ? cause(L.approved, L.site === 'defer' ? 'No landing: the crew stayed in orbit.' : `${site!.name}${L.spent ? `: ${L.spent} cr spent, ${m.funds} cr left.` : ': no extra cost.'}`, [L.reason]) : ''
    const causes = `${m.causes.map(c => cause(c.ok, c.headline, c.parts)).join('')}${prepCause}${landCause}`

    // What to change next time, found by flying the alternatives through the same calculation.
    const sugg = plan && p ? suggestions(plan, p) : []
    const tips = [
      ...sugg.map(x => `<li><b>${esc(x.change)}</b>${x.cost ? ` <em>${x.cost}</em>` : ''}<span>${esc(x.effect)}${x.clears ? '. That clears Ares Shelf.' : '.'}</span></li>`),
      ...(L?.approved && !hasMedical && !canMedical ? ['<li><b>Keep a crew-hour for the crew medical check</b> <em>1 crew-hour</em><span>The habitat can then be commissioned, which completes the mission.</span></li>'] : []),
      ...(L?.site === 'defer' ? ['<li><b>Compare the three sites again</b><span>Eos Hollow has no deadline if the rover comes home with battery to spare, and Meridian Plain is open whenever the credits are there.</span></li>'] : []),
    ]
    const next = tips.length ? `<h3 class="rh">Try next</h3><ul class="tips">${tips.join('')}</ul>`
      : '<h3 class="rh">Try next</h3><p class="tipnone">The pass did everything Ares Shelf asks. For a different mission, try another spacecraft, the other instrument, or a date that makes this plan hard.</p>'

    const stepBox = !L?.approved ? '' : `<div class="rbox stepbox ${habDone ? 'donebox' : ''}" id="hab"></div>`
    inner.innerHTML = `${phaseRail('debrief')}
      <div class="sim" style="margin-top:12px">Mission debrief · simulated scenario · ${esc(m.profile.callSign)} · ${ship.name}</div>
      <h1>${out.title}</h1>
      <div class="verdict-big ${out.cls}">${esc(out.why)}</div>
      ${stepBox}
      <h3 class="rh">Which choices caused it</h3>
      <div class="causes">${causes}</div>
      ${next}
      <div class="actions report-actions"><button class="btn primary" id="refly">Fly again · change one thing</button><button class="btn" id="fresh">New mission · choose a spacecraft</button><button class="btn ghost" id="title">Return to title</button></div>
      <details class="more record"><summary>Full flight record</summary>
      <div class="rgrid">
        <div class="rbox"><h3>Crew & spacecraft</h3><div class="kv"><span>Call sign</span><b>${esc(m.profile.callSign)}</b><span>Suit</span><b style="color:${suit.light}">${suit.name}</b><span>Ship</span><b>${ship.name} · ${ship.role}</b><span>Instrument</span><b>${inst ? `${inst.name} (${inst.code})` : 'none'}</b></div></div>
        <div class="rbox"><h3>Preparation</h3><ul>${(['relay', ...prepTasks] as TaskId[]).map(t => `<li>${m.completed.has(t) ? '✓' : '○'} ${TASK_INFO[t].name}${m.completed.has(t) ? ` — <span style="color:#b9ae95">${PREP_COST[t]} crew-hour</span>` : t === 'relay' && m.relayPatched ? ' — patched instead' : ' — not done'}</li>`).join('')}</ul></div>
        <div class="rbox"><h3>Transmission</h3>${plan && p && d ? `<div class="kv"><span>Operations date</span><b>${d.label}</b><span>Power at send</span><b>${plan.power.life}/${plan.power.comms}/${plan.power.research}</b><span>Route · scan</span><b>${byId(ROUTES, plan.route).name} · ${byId(SCANS, plan.scan).name}</b><span>Signal delay</span><b>${fmt(p.uplink)} min each way</b><span>Drive began</span><b>T+${fmt(p.commands[0].start)}</b><span>Last signal</span><b>T+${fmt(p.finalTelemetryAt)}</b></div>` : 'No plan transmitted.'}</div>
        <div class="rbox"><h3>Evidence & rover</h3>${p ? `<div class="kv"><span>Ice reading</span><b>${p.reading ? `${p.reading.estimate}% ±${p.reading.uncertainty} (low ${p.reading.low}%) · ${p.reading.strong ? 'strong' : 'weak'}` : 'none (scan incomplete)'}</b><span>Received at</span><b>${p.readingAt !== null ? `T+${fmt(p.readingAt)}` : '—'}</b><span>Outcome</span><b>${p.returned ? 'Returned to base' : `Reserve stop · safe mode at T+${fmt(p.safeMode!.at)}`}</b><span>Final battery</span><b>${p.finalBattery}%</b></div>` : '—'}</div>
        <div class="rbox"><h3>Credits</h3><div class="kv"><span>Budget</span><b>${ship.budget} cr</b><span>Instrument</span><b>${inst ? `−${inst.cost} cr` : '0'}</b><span>Cargo reward</span><b>${m.completed.has('cargo') ? '+5 cr' : '0'}</b><span>Landing spend</span><b>${L ? `−${L.spent} cr` : '0'}</b><span>Left</span><b>${m.funds} cr</b></div></div>
        <div class="rbox" style="grid-column:1/-1"><h3>Mission log</h3><div class="logl">${m.log.map(e => `<div><span style="color:#5fd8f0">${esc(e.at)}</span> ${esc(e.text)}</div>`).join('')}</div></div>
      </div></details>
      ${plan && d ? `<p class="dataline" style="margin:14px 0 0"><span class="tag real">NASA data</span>Light time ${fmt(plan.lightMin)} min: ${esc(lightTimeSource(d))}. Night low ${fmtTemp(plan.nightLowC)}: ${esc(weatherSource(d))}. ${esc(seasonNote(d))} <span class="tag model">Our model</span>The relay hand-off, heater draw, drive and scan times, battery use, ice reading, sites and crew-hours.</p>` : ''}`

    // The last steps of the mission happen here, on Mars: the medical check if an hour was kept for it, then the habitat.
    const hab = inner.querySelector<HTMLElement>('#hab')
    if (hab) {
      const again = { ...ctx, done: (t: TaskId, detail: string) => { ctx.done(t, detail); render() } }
      if (habDone) hab.innerHTML = '<h3>Habitat</h3><span class="donebadge">COMMISSIONED</span> Foundation anchored, shell sealed, life support energized. Crew quarters are pressurized.'
      else if (hasMedical) { hab.innerHTML = '<h3>Last step: commission the habitat</h3><div id="seq"></div>'; sequenceTab($('#seq', hab), render, again, 'habitat') }
      else if (canMedical) { hab.innerHTML = '<h3>Next step: the crew medical check, with the crew-hour you kept</h3><div id="seq"></div>'; sequenceTab($('#seq', hab), render, again, 'medical') }
      else hab.innerHTML = '<h3>Habitat</h3><p style="margin:0;color:#ffb347">Not commissioned: the crew has no medical clearance, and no crew-hours are left for the check.</p>'
    }
    $('#refly', inner).addEventListener('click', nav.refly)
    $('#fresh', inner).addEventListener('click', nav.newMission)
    $('#title', inner).addEventListener('click', nav.title)
  }
  render()
  return s
}
