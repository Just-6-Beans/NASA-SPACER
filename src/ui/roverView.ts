// Rover operations: the three-step planner (date, route, scan), its forecast, transmission,
// the delayed clock, and telemetry.
//
// The side panel is a scrolling body over a pinned footer. The footer always holds the one
// sentence that matters (does this plan work, and if not, why) and the next action, so neither
// can scroll out of sight.
import '../rover.css'
import { BALANCE_SAVING, DUST_DEADLINE, HEATER_FREE_C, PATCH_HANDOFF, RESERVE_FLOOR, ROUTES, SCANS, STRONG_LOW_END, byId, type RouteId, type ScanId } from '../core/data'
import type { Mission } from '../core/mission'
import { fastRelay, powerBlock, researchFilter } from '../core/power'
import {
  COMMAND_LABEL, commandStatus, fmt, fmtTemp, heaterDraw, roverPosition, type CommandKind, type PassResult, type PlanSnapshot, type TimelineEvent,
} from '../core/rover'
import { OPS_DATES, lightTimeSource, seasonNote, weatherSource, type OpsDate } from '../data/opsDates'
import { sound } from '../audio'
import type { MarsScene } from '../game/game'
import { $, $$, el, esc, toast } from './dom'
import { forecastPlan, lightHtml, lights, verdict, type Forecast } from './forecast'
import { ICONS } from './icons'
import { phaseOf, phaseRail } from './phase'

export interface RoverCtx {
  m: Mission
  mars: () => MarsScene
  /** The pass flown before this one, if the player is flying again. */
  last: Forecast | null
  transmit: () => Promise<string | null>
  back: () => void
  sites: () => void
  report: () => void
  /** Opens a station panel over the planner, so a what-if does not need a walk across the deck. */
  openPanel: (id: string, tab?: string) => void
  refresh: () => void
}

const STATUS_TEXT = { queued: 'Queued', executing: 'On Mars now', downlink: 'Signal on its way', received: 'Received', cancelled: 'Cancelled', awaiting: 'No signal' }
/** Real milliseconds per half minute of rover clock while the clock runs. */
const TICK_MS = 190

export function roverScreen(ctx: RoverCtx) {
  const m = ctx.m
  const s = el(`<section class="screen rover" aria-label="Rover operations">
    <header class="rv-head"><div class="brand">SPACER<i>///</i></div><div class="phasewrap" id="rphases"></div><div class="batt" id="batt"></div></header>
    <div class="mapzone"><div class="maplabel"><b style="font-family:var(--display);font-size:18px;letter-spacing:.06em">ARES SURVEY SECTOR</b><div class="sim">Simulated terrain and ice</div></div>
      <div class="mapchip hidden" id="mapchip" role="status"></div>
      <div class="mapctl"><button class="btn small" id="zin" aria-label="Zoom in">＋</button><button class="btn small" id="zout" aria-label="Zoom out">−</button><button class="btn small" id="zfit">Fit</button></div></div>
    <aside class="side"><div class="side-scroll"></div><div class="side-foot"></div></aside>
  </section>`)
  const scroller = $('.side-scroll', s), foot = $('.side-foot', s)
  let timer: number | null = null
  let busy = false
  let msg: { text: string; kind: string } | null = null
  let shownPhase = ''

  const stop = () => { if (timer !== null) { clearInterval(timer); timer = null } }
  const start = () => { if (timer === null && m.pass && !m.passDone) timer = window.setInterval(() => advance(m.clock + 0.5), TICK_MS) }
  const announce = (evs: TimelineEvent[]) => {
    for (const e of evs) {
      if (e.type === 'telemetry') { sound.play('telemetry'); toast(e.text, 'ok') }
      if (e.type === 'safe-mode') { sound.play('alert'); toast(e.text, 'bad', 6000) }
    }
  }
  const advance = (t: number) => {
    const fired = m.advanceTo(t)
    announce(fired)
    if (m.passDone) { stop(); sound.play('success') }
    // A plain tick only moves the clock; the panel is rebuilt when something happens.
    if (fired.length || m.passDone) render()
    else tick()
  }

  const layoutMap = () => {
    const mz = $('.mapzone', s).getBoundingClientRect()
    ctx.mars().setView({ x: mz.left, y: mz.top, w: Math.max(50, mz.width), h: Math.max(50, mz.height) })
  }

  function syncMap() {
    const mars = ctx.mars()
    const plan = m.plan
    const route = byId(ROUTES, plan?.route ?? m.route), scan = byId(SCANS, plan?.scan ?? m.scan)
    const balanced = plan ? plan.balanced : m.completed.has('battery')
    mars.setRoute(route.id)
    mars.setCosts(`${route.legMin} min · ${route.legDraw - (balanced ? BALANCE_SAVING : 0)}% each way`, `${scan.name}: ${scan.minutes} min · ${m.instrumentInfo!.quickDraw + scan.extraDraw}%`)
    if (m.pass) {
      const p = roverPosition(m.pass, m.clock)
      mars.setRover(p.along, p.returning, p.scanning)
    } else mars.setRover(0, false, false)
  }

  /** Last battery level Earth has heard: the wake-up charge until a command's telemetry arrives. */
  const knownBattery = (p: PassResult) => [...p.commands].reverse().find(c => c.telemetryAt !== null && m.clock >= c.telemetryAt)?.batteryEnd ?? p.wakeBattery

  /** The dust front on the map: the deadline against the plan, then a countdown once the pass flies. */
  function mapChip() {
    const chip = $('#mapchip', s)
    const p = m.pass, f = p ?? m.forecast()
    chip.classList.toggle('hidden', !f)
    if (!f) return
    const late = f.finalTelemetryAt >= DUST_DEADLINE
    const left = DUST_DEADLINE - m.clock
    chip.className = `mapchip ${late ? 'no' : 'ok'}`
    chip.innerHTML = p && !m.passDone
      ? `<b>Dust front ${left > 0 ? `in ${fmt(Math.round(left * 10) / 10)} min` : 'has arrived'}</b><span>last signal due T+${fmt(p.finalTelemetryAt)}</span>`
      : `<b>Dust front T+${DUST_DEADLINE}</b><span>${p ? 'last signal came' : 'your last signal'} T+${fmt(f.finalTelemetryAt)}${late ? ' · too late' : ''}</span>`
  }

  function render() {
    syncMap()
    const p = m.pass
    // Before the plan is sent the header shows the charge the forecast starts from, so the two agree.
    const known = p ? knownBattery(p) : m.ship.battery
    const bt = $('#batt', s)
    bt.className = `batt ${known <= 30 ? 'low' : ''}`
    bt.innerHTML = `<span class="bcell"><i style="width:${known}%"></i></span>ROVER ${known}%`
    bt.title = p ? 'Last battery level received on Earth' : 'Rover charge in the cradle, before the night heaters'
    const ph = phaseOf(m)
    if (ph !== shownPhase) { $('#rphases', s).innerHTML = phaseRail(ph); shownPhase = ph }
    // A redraw keeps the player's place: scroll position, open disclosures, keyboard focus.
    const top = scroller.scrollTop
    const open = new Set($$('details[open][data-k]', s).map(d => d.dataset.k))
    const focus = s.contains(document.activeElement) ? (document.activeElement as HTMLElement).id : ''
    scroller.innerHTML = p ? passBody(p) : planBody()
    foot.innerHTML = p ? passFoot(p) : planFoot()
    $$('details[data-k]', s).forEach(d => { if (open.has(d.dataset.k)) d.setAttribute('open', '') })
    scroller.scrollTop = top
    if (focus) s.querySelector<HTMLElement>(`#${focus}`)?.focus()
    mapChip()
    bind()
    ctx.refresh()
  }

  /** The cheap per-tick update while the clock runs: the clock, its cursor, and what Mars is doing. */
  function tick() {
    const p = m.pass
    if (!p) return
    syncMap()
    mapChip()
    const set = (id: string, text: string) => { const e = s.querySelector<HTMLElement>(id); if (e) e.textContent = text }
    set('#pclock', `T+${fmt(m.clock)}`)
    set('#marsnow', marsNow(p))
    const cur = s.querySelector<HTMLElement>('.budget .now')
    if (cur) cur.style.left = `${(m.clock / clockSpan(p)) * 100}%`
  }

  // ---- Planner ------------------------------------------------------------
  function planBody() {
    const d = m.ops
    const snap = m.snapshot()
    const f = m.forecast()
    const saving = m.completed.has('battery') ? BALANCE_SAVING : 0
    const inst = m.instrumentInfo!
    const direct = fastRelay(m.power), filter = researchFilter(m.power)
    const route = byId(ROUTES, m.route), scan = byId(SCANS, m.scan)
    const otherRoute = ROUTES.find(r => r.id !== m.route)!, otherScan = SCANS.find(x => x.id !== m.scan)!
    const dt = (otherRoute.legMin - route.legMin) * 2, db = (otherRoute.legDraw - route.legDraw) * 2
    const st = otherScan.minutes - scan.minutes, sb = otherScan.extraDraw - scan.extraDraw, su = otherScan.uncertaintyCut - scan.uncertaintyCut
    const chips = [
      `<span class="chip2">${inst.code}</span>`,
      `<span class="chip2 ${m.calibrated ? 'ok' : 'warn'}">${m.calibrated ? 'Calibrated' : 'Uncalibrated · ±9 looser'}</span>`,
      `<span class="chip2 ${direct || filter ? 'ok' : 'warn'}">${direct ? 'Direct link' : filter ? 'Research filter' : `Power ${m.power.life}/${m.power.comms}/${m.power.research}`}</span>`,
      m.relayPatched && !direct ? `<span class="chip2 warn">Relay patched · +${PATCH_HANDOFF} min</span>` : '',
      saving ? '<span class="chip2 ok">Balanced pack</span>' : '',
    ].join('')
    return `<div class="row head"><h2>Rover planner</h2><button class="btn small" id="back">← Station</button></div>
      <p class="sub1">One pass, sent once: Drive → Scan → Return.</p>
      <div class="carried"><span class="carried-k">From the station</span>${chips}
        <button class="btn small" id="repower">Re-route power</button>${m.relayPatched && !direct ? '<button class="btn small" id="rerelay">Repair relay</button>' : ''}</div>
      <h3><span class="stepn">1</span>Operations date</h3>
      <div class="seg-ctl dates" role="group" aria-label="Operations date">${OPS_DATES.map(o => dateButton(o)).join('')}</div>
      <div class="hint">The marks show what each date would do to the route and scan below.</div>
      ${d ? dateHtml(d) : '<div class="feedback">Each date pairs a real signal delay with a real night temperature. The closer Mars is, the colder the night.</div>'}
      <h3><span class="stepn">2</span>Route</h3>
      <div class="seg-ctl">${ROUTES.map(r => `<button data-route="${r.id}" aria-pressed="${m.route === r.id}"><b>${r.name}</b><small>${r.legMin} min · ${r.legDraw - saving}% each way</small></button>`).join('')}</div>
      <div class="hint">${route.note} <b>${otherRoute.name}</b> would be ${Math.abs(dt)} min ${dt < 0 ? 'sooner' : 'later'} and use ${Math.abs(db)}% ${db > 0 ? 'more' : 'less'} battery over the round trip.</div>
      <h3><span class="stepn">3</span>Scan</h3>
      <div class="seg-ctl">${SCANS.map(x => `<button data-scan="${x.id}" aria-pressed="${m.scan === x.id}"><b>${x.name}</b><small>${x.minutes} min · ${inst.quickDraw + x.extraDraw}%${x.uncertaintyCut ? ` · ±${x.uncertaintyCut} tighter` : ''}</small></button>`).join('')}</div>
      <div class="hint"><b>${otherScan.name}</b> would be ${Math.abs(st)} min ${st < 0 ? 'sooner' : 'later'}, use ${Math.abs(sb)}% ${sb > 0 ? 'more' : 'less'} battery, and read ±${Math.abs(su)} ${su > 0 ? 'tighter' : 'looser'}.</div>
      <h3>Forecast <small>the same calculation the pass will run</small></h3>
      ${snap && f ? forecastHtml(snap, f) : '<div class="feedback">Pick an operations date to see where the battery and the clock go.</div>'}`
  }

  /** A date and what it would do to the plan as it stands: three marks, from the pass calculation. */
  function dateButton(o: OpsDate) {
    const fc = forecastPlan(m, m.instrument!, { opsDate: o.id })
    const ls = fc ? lights(fc.plan, fc.pass) : []
    const short = { clock: 'Clock', battery: 'Batt', evidence: 'Ice' }
    const marks = ls.map(l => `<i class="${l.ok ? 'ok' : 'no'}">${l.ok ? '✓' : '✗'}${short[l.id]}</i>`).join('')
    const say = ls.map(l => `${l.name} ${l.ok ? 'ok' : 'fails'}`).join(', ')
    return `<button data-date="${o.id}" aria-pressed="${m.opsDate === o.id}" title="${esc(o.note)}"><b>${o.label}</b><small>${fmt(o.lightMin)} min signal</small><small>${fmtTemp(o.weather.minAirTemp)} night</small><span class="marks" aria-label="With your route and scan: ${say}">${marks}</span></button>`
  }

  /** The two real measurements for a date, with source, place and date. What our model does with them is one tap away. */
  function dateHtml(d: OpsDate) {
    const direct = fastRelay(m.power)
    const heat = heaterDraw(d.weather.minAirTemp)
    return `<div class="prov">
      <div><span class="tag real">NASA data</span>Signal <b>${fmt(d.lightMin)} min</b> one way · ${esc(lightTimeSource(d))}</div>
      <div><span class="tag real">NASA data</span>Night low <b>${fmtTemp(d.weather.minAirTemp)}</b> · ${esc(weatherSource(d))}</div>
      <details data-k="model"><summary><span class="tag model">Our model</span>What the game does with these</summary>
        <p>${esc(seasonNote(d))}</p>
        <p>The heaters use <b>${heat}%</b> of the rover battery before the pass: 1% for each °C below ${fmtTemp(HEATER_FREE_C)}.</p>
        <p>${direct ? 'Your direct link adds nothing to the light time.' : `The relay adds <b>${m.handoffMin} min</b> to each signal. A direct link (Communications 5) would skip it.`} Nothing shortens the light time itself.</p></details>
    </div>`
  }

  /** Three lights, then where the battery and the clock go. */
  function forecastHtml(snap: PlanSnapshot, f: PassResult) {
    const ran = f.commands.filter(c => c.status !== 'cancelled')
    const late = f.finalTelemetryAt >= DUST_DEADLINE
    const spare = f.finalBattery - RESERVE_FLOOR
    const battery: Seg[] = [
      { cls: 'b-heat', v: f.heaterDraw, label: 'Heaters' },
      ...ran.map(c => ({ cls: c.status === 'partial' ? 'b-stop' : `b-${c.kind}`, v: c.batteryStart - c.batteryEnd, label: c.status === 'partial' ? `${COMMAND_LABEL[c.kind]} stops` : COMMAND_LABEL[c.kind] })),
      { cls: 'b-left', v: spare, label: 'Spare' },
      { cls: 'b-reserve', v: RESERVE_FLOOR, label: 'Reserve' },
    ]
    // Legends skip what the bar heading already says: the reserve.
    const batteryKey = battery.filter(x => x.cls !== 'b-reserve')
    const last = ctx.last
    return `<div class="lights">${lights(snap, f).map(l => lightHtml(l, 'fc-')).join('')}</div>
      ${last ? `<div class="lastrun"><b>Last flight</b> ${lights(last.plan, last.pass).map(l => `${l.name.toLowerCase()} ${esc(l.short)}`).join(' · ')}</div>` : ''}
      ${bar('Battery', `${snap.startBattery}% → ${f.finalBattery}% · reserve ${RESERVE_FLOOR}%`, !f.returned, battery, 100, '%', batteryKey)}
      ${clockBar(f, late)}`
  }

  const clockSpan = (f: PassResult) => Math.max(DUST_DEADLINE, f.finalTelemetryAt) * 1.03
  /** Where the clock goes: signal out, the three commands, signal back, against the dust front. */
  function clockBar(f: PassResult, late: boolean, now?: number) {
    const ran = f.commands.filter(c => c.status !== 'cancelled')
    const clock: Seg[] = [
      { cls: 'b-link', v: f.uplink, label: 'Signal out' },
      ...ran.map(c => ({ cls: c.status === 'partial' ? 'b-stop' : `b-${c.kind}`, v: c.end - c.start, label: c.status === 'partial' ? `${COMMAND_LABEL[c.kind]} stops` : COMMAND_LABEL[c.kind] })),
      { cls: 'b-link', v: f.downlink, label: 'Signal back' },
    ]
    const key = [{ cls: 'b-link', v: f.uplink, label: 'Signal, each way' }, ...clock.filter(x => x.cls !== 'b-link')]
    return bar('Clock', `last signal T+${fmt(f.finalTelemetryAt)} · dust front T+${DUST_DEADLINE}`, late, clock, clockSpan(f), 'min', key, DUST_DEADLINE, now)
  }

  function planFoot() {
    const snap = m.snapshot(), f = m.forecast()
    const block = m.transmitBlock()
    const v = snap && f ? verdict(snap, f) : null
    return `${v ? `<div class="verdict ${v.ok ? 'ok' : 'no'}" role="status">${esc(v.text)}</div>` : ''}
      ${block ? `<div class="verdict warn" role="status"><span>${esc(block)}</span>${powerBlock(m.power) ? '<button class="btn small" id="repower2">Re-route power</button>' : ''}</div>` : ''}
      ${msg ? `<div class="feedback ${msg.kind}">${esc(msg.text)}</div>` : ''}
      <button class="btn primary huge" id="tx" ${block || busy ? 'disabled' : ''}>${busy ? 'Checking with crew…' : 'Transmit plan'}</button>
      ${!block && v && !v.ok ? '<div class="footnote">You can send a risky plan. There is one pass per mission.</div>' : ''}`
  }

  // ---- Pass in progress -----------------------------------------------------
  /** What the rover should be doing at this moment. Earth cannot see it yet: it is the plan, played forward. */
  function marsNow(p: PassResult) {
    const t = m.clock
    if (t < p.uplink) return `Asleep. Your commands arrive at T+${fmt(p.uplink)}.`
    for (const c of p.commands) {
      if (c.status === 'cancelled') continue
      if (t < c.end) return { drive: 'Driving to the sample site', scan: 'Scanning for ice', return: 'Driving back to base' }[c.kind]
    }
    return p.returned ? 'Back at base' : `Stopped in safe mode at the ${RESERVE_FLOOR}% reserve`
  }
  /** The last thing a signal has actually told Earth. */
  function earthHeard(p: PassResult) {
    const heard = m.events.slice(0, m.processed).filter(e => e.type === 'telemetry' || e.type === 'safe-mode').at(-1)
    if (heard) return heard.text
    const first = Math.min(...p.commands.filter(c => c.telemetryAt !== null).map(c => c.telemetryAt!))
    return `Nothing yet. The first signal is due at T+${fmt(first)}.`
  }

  function passBody(p: PassResult) {
    const rd = m.receivedReading
    const d = m.ops!
    const scanCmd = p.commands[1]
    let evidence = ''
    if (rd) {
      const L = (v: number) => Math.max(0, Math.min(100, (v / 60) * 100))
      evidence = `<div class="evidence ${rd.strong ? 'strong' : 'weak'}"><div class="sim">Simulated ice estimate</div><div class="big">${rd.estimate}% ±${rd.uncertainty}</div>
        <div class="icebar"><div class="range" style="left:${L(rd.low)}%;width:${L(rd.high) - L(rd.low)}%"></div><div class="thr" style="left:${L(STRONG_LOW_END)}%"></div></div>
        <div style="font-size:13px">Low end <b>${rd.low}%</b>: ${rd.strong ? '<span style="color:#6ef2c6">strong evidence</span>' : '<span style="color:#ffb347">weak evidence</span>'} (a habitat needs a low end of ${STRONG_LOW_END}%)</div></div>`
    } else if (scanCmd.status === 'partial' && p.safeMode && m.clock >= p.safeMode.arriveAt) {
      evidence = '<div class="evidence weak">The scan stopped at the reserve. A partial scan gives <b>no ice reading</b>.</div>'
    } else if (scanCmd.status === 'cancelled' && p.safeMode && m.clock >= p.safeMode.arriveAt) {
      evidence = '<div class="evidence weak">Safe mode cancelled the scan. No ice reading.</div>'
    } else evidence = `<div class="evidence">Not yet${p.readingAt !== null ? `: the scan result is due at T+${fmt(p.readingAt)}` : ''}. A reading only counts once its signal reaches Earth.</div>`
    const fired = m.events.slice(0, m.processed)
    return `<div class="row head"><h2>Rover pass</h2><button class="btn small" id="back">← Station</button></div>
      <div class="passclock"><div class="bigclock mono" id="pclock">T+${fmt(m.clock)}</div><div class="sim">Minutes since you transmitted</div></div>
      <div class="delay2">
        <div class="dcell mars"><span>On Mars now <em>as planned</em></span><b id="marsnow">${esc(marsNow(p))}</b></div>
        <div class="dgap"><b>${fmt(p.uplink)} min</b>each way</div>
        <div class="dcell earth"><span>Earth has heard</span><b>${esc(earthHeard(p))}</b></div>
      </div>
      ${clockBar(p, p.finalTelemetryAt >= DUST_DEADLINE, m.clock)}
      <h3>Commands</h3><div class="qrows">${p.commands.map((c, i) => {
        const st = commandStatus(p, i, m.clock)
        return `<div class="qrow"><span class="num">${String(i + 1).padStart(2, '0')}</span>${CMD_ICON[c.kind]}<span class="lbl">${CMD_TEXT[c.kind]}<small>${c.status === 'cancelled' ? 'not run' : `T+${fmt(c.start)} → T+${fmt(c.end)}${c.telemetryAt !== null ? ` · heard T+${fmt(c.telemetryAt)}` : ''}`}</small></span><span class="st ${st}">${STATUS_TEXT[st]}</span></div>`
      }).join('')}</div>
      <h3>Evidence on Earth</h3>${evidence}
      <details class="more" data-k="log"><summary>Event log (${fired.length})</summary><div class="evlog">${fired.length ? fired.map(e => `<div><span class="tm">T+${fmt(e.t)}</span> ${esc(e.text)}</div>`).join('') : '<div>Plan transmitted at T+0. The signal is on its way.</div>'}</div></details>
      <p class="dataline"><span class="tag real">NASA data</span>Light time ${fmt(d.lightMin)} min: ${esc(lightTimeSource(d))}. Night low ${fmtTemp(d.weather.minAirTemp)}: ${esc(weatherSource(d))}.</p>`
  }

  function passFoot(p: PassResult) {
    if (m.landing) return '<div class="verdict ok" role="status">The landing is decided.</div><button class="btn primary huge" id="report">Open mission report</button>'
    if (m.passDone) return `<div class="verdict ${p.returned ? 'ok' : 'no'}" role="status">Last signal received at T+${fmt(p.finalTelemetryAt)}. ${p.returned ? `The rover is back at base with ${p.finalBattery}%.` : `The rover is in safe mode at the ${p.finalBattery}% reserve.`}</div>
      <button class="btn primary huge" id="sites">Choose the landing site</button>`
    const next = m.nextEventTime()
    return `<div class="verdict" role="status">${timer ? 'The clock is running.' : 'The clock is paused.'}${next !== null ? ` Next event at T+${fmt(next)}.` : ''}</div>
      <div class="actions"><button class="btn ${timer ? '' : 'mint'}" id="run">${timer ? 'Pause clock' : 'Run clock'}</button><button class="btn" id="next">Skip to next event</button></div>`
  }

  function bind() {
    $('#back', s)?.addEventListener('click', () => { stop(); ctx.back() })
    $$('[data-date]', s).forEach(b => b.addEventListener('click', () => {
      const err = m.setOpsDate(b.dataset.date!)
      msg = err ? { text: err, kind: 'bad' } : null
      sound.play(err ? 'fail' : 'ui')
      render()
    }))
    $$('[data-route]', s).forEach(b => b.addEventListener('click', () => { m.route = b.dataset.route as RouteId; sound.play('ui'); render() }))
    $$('[data-scan]', s).forEach(b => b.addEventListener('click', () => { m.scan = b.dataset.scan as ScanId; sound.play('ui'); render() }))
    for (const id of ['#repower', '#repower2']) $(id, s)?.addEventListener('click', () => { sound.play('ui'); ctx.openPanel('power') })
    $('#rerelay', s)?.addEventListener('click', () => { sound.play('ui'); ctx.openPanel('comms', 'relay') })
    $('#tx', s)?.addEventListener('click', async () => {
      busy = true; render()
      const err = await ctx.transmit()
      busy = false
      if (err) { sound.play('fail'); msg = { text: err, kind: 'bad' }; render(); return }
      msg = null
      sound.play('telemetry')
      toast(`Plan transmitted. It reaches Mars at T+${fmt(m.pass!.uplink)}.`, 'ok')
      scroller.scrollTop = 0
      start() // the pass plays itself; the player can pause or skip ahead
      render()
    })
    $('#next', s)?.addEventListener('click', () => { const t = m.nextEventTime(); if (t !== null) advance(t) })
    $('#run', s)?.addEventListener('click', () => { if (timer) stop(); else start(); render() })
    $('#sites', s)?.addEventListener('click', () => { stop(); ctx.sites() })
    $('#report', s)?.addEventListener('click', () => { stop(); ctx.report() })
  }

  $('#zin', s).addEventListener('click', () => ctx.mars().zoomAt(1.25))
  $('#zout', s).addEventListener('click', () => ctx.mars().zoomAt(0.8))
  $('#zfit', s).addEventListener('click', () => ctx.mars().fit())
  const onResize = () => { if (!s.isConnected) return window.removeEventListener('resize', onResize); layoutMap() }
  window.addEventListener('resize', onResize)
  return { el: s, render, layoutMap, stop, powerChanged: () => { if (!m.pass) render() } }
}

const CMD_ICON: Record<CommandKind, string> = { drive: ICONS.rover, scan: ICONS.scan, return: ICONS.home }
const CMD_TEXT: Record<CommandKind, string> = { drive: 'Drive to sample site', scan: 'Scan for ice', return: 'Return to relay base' }

interface Seg { cls: string; v: number; label: string }

/** One stacked budget bar with a text legend. `mark` draws a limit line at that value, `now` a cursor. */
function bar(title: string, summary: string, bad: boolean, segs: Seg[], span: number, unit: string, key: Seg[], mark?: number, now?: number) {
  const n = (v: number) => fmt(Math.round(v * 10) / 10)
  const u = unit === '%' ? '%' : ` ${unit}`
  const shown = segs.filter(x => x.v > 0)
  return `<div class="budget ${bad ? 'bad' : ''}">
    <div class="bhead"><span>${title}</span><b>${summary}</b></div>
    <div class="track" role="img" aria-label="${title}: ${shown.map(x => `${x.label} ${n(x.v)}${u}`).join(', ')}">${shown.map(x => `<span class="${x.cls}" style="width:${(x.v / span) * 100}%" title="${x.label}: ${n(x.v)}${u}"></span>`).join('')}${mark === undefined ? '' : `<i class="mark" style="left:${(mark / span) * 100}%"></i>`}${now === undefined ? '' : `<i class="now" style="left:${(now / span) * 100}%"></i>`}</div>
    <details class="bleg" data-k="leg-${title}"><summary>Break it down</summary><div class="legend">${key.filter(x => x.v > 0).map(x => `<span><i class="${x.cls}"></i>${x.label} ${n(x.v)}${u}</span>`).join('')}</div></details>
  </div>`
}
