// Rover operations: the three-step planner (date, route, scan), its forecast, transmission,
// the delayed clock, and telemetry.
import '../rover.css'
import { BALANCE_SAVING, DUST_DEADLINE, HEATER_FREE_C, RESERVE_FLOOR, ROUTES, SCANS, STRONG_LOW_END, byId, type RouteId, type ScanId } from '../core/data'
import type { Mission } from '../core/mission'
import { fastRelay, signalLeg } from '../core/power'
import {
  COMMAND_LABEL, commandStatus, forecastWarnings, fmt, fmtTemp, heaterDraw, roverPosition, type CommandKind, type PassResult, type PlanSnapshot, type TimelineEvent,
} from '../core/rover'
import { OPS_DATES, lightTimeSource, seasonNote, weatherSource, type OpsDate } from '../data/opsDates'
import { sound } from '../audio'
import type { MarsScene } from '../game/game'
import { $, $$, el, esc, toast } from './dom'
import { ICONS } from './icons'

export interface RoverCtx {
  m: Mission
  mars: () => MarsScene
  transmit: () => Promise<string | null>
  back: () => void
  sites: () => void
  refresh: () => void
}

const STATUS_TEXT = { queued: 'Queued', executing: 'Executing on Mars', downlink: 'Downlink in transit', received: 'Received', cancelled: 'Cancelled (safe mode)', awaiting: 'No telemetry' }

export function roverScreen(ctx: RoverCtx) {
  const m = ctx.m
  const s = el(`<section class="screen rover" aria-label="Rover operations">
    <header class="rv-head"><div class="brand">SPACER<i>///</i></div><div class="sect">ROVER OPERATIONS</div><div class="batt" id="batt"></div></header>
    <div class="mapzone"><div class="maplabel"><b style="font-family:var(--display);font-size:18px;letter-spacing:.06em">ARES SURVEY SECTOR</b><div class="sim">Simulated terrain and ice</div><div class="dataline">Signal delay: JPL Horizons<br/>Night cold: Curiosity REMS, Gale Crater</div></div>
      <div class="mapctl"><button class="btn small" id="zin" aria-label="Zoom in">＋</button><button class="btn small" id="zout" aria-label="Zoom out">−</button><button class="btn small" id="zfit">Fit</button></div></div>
    <aside class="side" aria-live="polite"></aside>
  </section>`)
  const side = $('.side', s)
  let timer: number | null = null
  let busy = false
  let msg: { text: string; kind: string } | null = null

  const stop = () => { if (timer !== null) { clearInterval(timer); timer = null } }
  const announce = (evs: TimelineEvent[]) => {
    for (const e of evs) {
      if (e.type === 'telemetry') { sound.play('telemetry'); toast(e.text, 'ok') }
      if (e.type === 'safe-mode') { sound.play('alert'); toast(e.text, 'bad', 6000) }
    }
  }
  const advance = (t: number) => {
    announce(m.advanceTo(t))
    if (m.passDone) { stop(); sound.play('success') }
    render()
  }

  const layoutMap = () => {
    const mz = $('.mapzone', s).getBoundingClientRect()
    ctx.mars().setView({ x: mz.left, y: mz.top, w: Math.max(50, mz.width), h: Math.max(50, mz.height) })
  }

  function syncMap() {
    const mars = ctx.mars()
    mars.setRoute(m.plan?.route ?? m.route)
    if (m.pass) {
      const p = roverPosition(m.pass, m.clock)
      mars.setRover(p.along, p.returning, p.scanning)
    } else mars.setRover(0, false, false)
  }

  /** Last battery level Earth has heard: the wake-up charge until a command's telemetry arrives. */
  const knownBattery = (p: PassResult) => [...p.commands].reverse().find(c => c.telemetryAt !== null && m.clock >= c.telemetryAt)?.batteryEnd ?? p.wakeBattery

  function render() {
    syncMap()
    const p = m.pass
    const known = p ? knownBattery(p) : m.forecast()?.wakeBattery ?? m.startBattery
    const bt = $('#batt', s)
    bt.className = `batt ${known <= 30 ? 'low' : ''}`
    bt.innerHTML = `<span class="bcell"><i style="width:${known}%"></i></span>BATTERY ${known}%`
    bt.title = p ? 'Last battery level received on Earth' : m.ops ? 'Forecast charge after the night heaters' : 'Rover cradle charge'
    side.innerHTML = p ? opsHtml(p) : planHtml()
    bind()
    ctx.refresh()
  }

  // ---- Planner ------------------------------------------------------------
  function planHtml() {
    const d = m.ops
    const snap = m.snapshot()
    const f = m.forecast()
    const block = m.transmitBlock()
    const saving = m.completed.has('battery') ? BALANCE_SAVING : 0
    const inst = m.instrumentInfo!
    return `<div class="row" style="justify-content:space-between"><h2>Rover planner</h2><button class="btn small" id="back">← Station</button></div>
      <div class="sim" style="margin:4px 0 2px">One pass: Drive → Scan → Return</div>
      <h3><span class="stepn">1</span>Operations date</h3>
      <div class="seg-ctl dates" role="group" aria-label="Operations date">${OPS_DATES.map(o => `<button data-date="${o.id}" aria-pressed="${m.opsDate === o.id}" title="${esc(o.note)}"><b>${o.label}</b><small>${fmt(o.lightMin)} min signal</small><small>${fmtTemp(o.weather.minAirTemp)} night</small></button>`).join('')}</div>
      ${d ? dateHtml(d) : '<div class="feedback">Pick the day the pass runs. Each date pairs a real signal delay with a real night temperature: the closer Mars is, the colder the night.</div>'}
      <h3><span class="stepn">2</span>Route</h3>
      <div class="seg-ctl">${ROUTES.map(r => `<button data-route="${r.id}" aria-pressed="${m.route === r.id}"><b>${r.name}</b><small>${r.legMin} min · ${r.legDraw - saving} pts / leg</small></button>`).join('')}</div>
      <div class="hint">${byId(ROUTES, m.route).note}</div>
      <h3><span class="stepn">3</span>Scan</h3>
      <div class="seg-ctl">${SCANS.map(x => `<button data-scan="${x.id}" aria-pressed="${m.scan === x.id}"><b>${x.name}</b><small>${x.minutes} min · ${inst.quickDraw + x.extraDraw} pts${x.uncertaintyCut ? ` · −${x.uncertaintyCut} unc` : ''}</small></button>`).join('')}</div>
      <h3>Forecast (shared with execution)</h3>
      ${snap && f ? forecastHtml(snap, f) : '<div class="feedback">Choose an operations date to see where the battery and the clock go.</div>'}
      <button class="btn primary huge" id="tx" ${block || busy ? 'disabled' : ''}>${busy ? 'Checking with crew…' : 'Transmit sequence'}</button>
      ${block ? `<div class="feedback warn">${esc(block)}</div>` : '<div class="feedback">Risky plans can be sent. One pass per run.</div>'}
      ${msg ? `<div class="feedback ${msg.kind}">${esc(msg.text)}</div>` : ''}`
  }

  /** The two real measurements for a date, each followed by what our model does with it. */
  function dateHtml(d: OpsDate) {
    const direct = fastRelay(m.power)
    const leg = signalLeg(d.lightMin, m.ship.handoffMin, m.power)
    const heat = heaterDraw(d.weather.minAirTemp)
    return `<div class="prov">
      <div><span class="tag real">NASA data</span>Signal <b>${fmt(d.lightMin)} min</b> one way · ${esc(lightTimeSource(d))}</div>
      <div><span class="tag real">NASA data</span>Night low <b>${fmtTemp(d.weather.minAirTemp)}</b> · ${esc(weatherSource(d))}</div>
      <div><span class="tag model">Our model</span>${esc(seasonNote(d))} Heaters use <b>${heat} pt${heat === 1 ? '' : 's'}</b> (1 per °C below ${fmtTemp(HEATER_FREE_C)}). Signal leg <b>${fmt(leg)} min</b> ${direct ? '(direct link)' : `(+ ${m.ship.handoffMin} min relay hand-off, none at Communications 5)`}.</div>
    </div>`
  }

  /** Two budget bars (battery and clock) and the evidence the scan should return. */
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
    const clock: Seg[] = [
      { cls: 'b-link', v: f.uplink, label: 'Uplink' },
      ...ran.map(c => ({ cls: c.status === 'partial' ? 'b-stop' : `b-${c.kind}`, v: c.end - c.start, label: c.status === 'partial' ? `${COMMAND_LABEL[c.kind]} stops` : COMMAND_LABEL[c.kind] })),
      { cls: 'b-link', v: f.downlink, label: 'Downlink' },
    ]
    const span = Math.max(DUST_DEADLINE, f.finalTelemetryAt) * 1.03
    const rd = f.reading
    const warns = forecastWarnings(snap, f)
    // Legends skip what the bar heading already says: the reserve, and the second signal leg.
    const batteryKey = battery.filter(x => x.cls !== 'b-reserve')
    const clockKey = [{ cls: 'b-link', v: f.uplink, label: 'Signal 2 ×' }, ...clock.filter(x => x.cls !== 'b-link')]
    return `${bar('Battery', `${snap.startBattery}% → ${f.finalBattery}% · reserve ${RESERVE_FLOOR}%`, !f.returned, battery, 100, 'pts', batteryKey)}
      ${bar('Clock', `T+${fmt(f.finalTelemetryAt)} · dust front T+${DUST_DEADLINE}`, late, clock, span, 'min', clockKey, DUST_DEADLINE)}
      <div class="fc" style="margin-top:10px">
        <span>Ice reading</span><b>${rd ? `${rd.estimate}% ±${rd.uncertainty} (low ${rd.low}%) at T+${fmt(f.readingAt!)}` : 'none: the scan does not finish'}</b>
        <span>Evidence</span><b style="color:${rd?.strong ? '#6ef2c6' : '#ffb347'}">${rd ? `${rd.strong ? 'Strong' : 'Weak'} (needs low ≥ ${STRONG_LOW_END}%)` : '—'}</b>
        <span>Rover</span><b style="color:${f.returned ? '#6ef2c6' : '#ff8a7a'}">${f.returned ? 'Back at base' : 'Stranded in safe mode'}</b>
      </div>
      <div class="warns">${warns.map(w => `<div class="${w.level}">${esc(w.text)}</div>`).join('')}</div>`
  }

  // ---- Pass in progress -----------------------------------------------------
  function opsHtml(p: PassResult) {
    const rd = m.receivedReading
    const d = m.ops!
    const scanCmd = p.commands[1]
    let evidence = ''
    if (rd) {
      const L = (v: number) => Math.max(0, Math.min(100, (v / 60) * 100))
      evidence = `<div class="evidence ${rd.strong ? 'strong' : 'weak'}"><div class="sim">Simulated ice estimate</div><div class="big">${rd.estimate}% ±${rd.uncertainty}</div>
        <div class="icebar"><div class="range" style="left:${L(rd.low)}%;width:${L(rd.high) - L(rd.low)}%"></div><div class="thr" style="left:${L(STRONG_LOW_END)}%"></div></div>
        <div style="font-size:13px">Low end <b>${rd.low}%</b> — ${rd.strong ? '<span style="color:#6ef2c6">strong evidence</span>' : '<span style="color:#ffb347">weak evidence</span>'} (threshold ${STRONG_LOW_END}%)</div></div>`
    } else if (scanCmd.status === 'partial' && p.safeMode && m.clock >= p.safeMode.arriveAt) {
      evidence = '<div class="evidence weak">Scan stopped at the reserve floor. A partial scan produces <b>no ice reading</b>.</div>'
    } else if (scanCmd.status === 'cancelled' && p.safeMode && m.clock >= p.safeMode.arriveAt) {
      evidence = '<div class="evidence weak">Scan was cancelled by safe mode. No ice reading.</div>'
    } else evidence = `<div class="evidence">Awaiting scan downlink${p.readingAt !== null ? ` · ETA T+${fmt(p.readingAt)}` : ''}. Evidence is only usable once it reaches Earth.</div>`
    const fired = m.events.slice(0, m.processed)
    return `<div class="row" style="justify-content:space-between"><h2>Rover pass</h2><button class="btn small" id="back">← Station</button></div>
      <div class="row" style="justify-content:space-between;margin-top:8px"><div><div class="bigclock mono">T+${fmt(m.clock)}</div><div class="sim">Minutes since transmission</div></div>
        <div style="text-align:right;font-family:var(--mono);font-size:12px">Signal leg ${fmt(p.uplink)} min<br/>Last known battery <b>${knownBattery(p)}%</b></div></div>
      <div class="dataline" style="margin-top:6px">Light time ${fmt(d.lightMin)} min · ${esc(lightTimeSource(d))}<br/>Night low ${fmtTemp(d.weather.minAirTemp)} · ${esc(weatherSource(d))}</div>
      <div class="actions">${m.passDone ? '<button class="btn primary" id="sites">Review landing sites</button>' : `<button class="btn" id="next">Next event</button><button class="btn" id="p5">+5 min</button><button class="btn mint" id="run">${timer ? 'Pause clock' : 'Run clock'}</button>`}</div>
      ${m.passDone ? `<div class="feedback ${p.returned ? 'ok' : 'warn'}">Final telemetry received at T+${fmt(p.finalTelemetryAt)}. ${p.returned ? `Rover back at base with ${p.finalBattery}%.` : `Rover in safe mode at ${p.finalBattery}% reserve.`}</div>` : ''}
      <h3>Command sequence</h3><div class="qrows">${p.commands.map((c, i) => {
        const st = commandStatus(p, i, m.clock)
        return `<div class="qrow"><span class="num">${String(i + 1).padStart(2, '0')}</span>${CMD_ICON[c.kind]}<span class="lbl">${CMD_TEXT[c.kind]}<small>${c.status === 'cancelled' ? 'not executed' : `Mars T+${fmt(c.start)} → T+${fmt(c.end)}${c.telemetryAt !== null ? ` · telemetry T+${fmt(c.telemetryAt)}` : ''}`}</small></span><span class="st ${st}">${STATUS_TEXT[st]}</span></div>`
      }).join('')}</div>
      <h3>Evidence on Earth</h3>${evidence}
      <h3>Event log</h3><div class="evlog">${fired.length ? fired.map(e => `<div><span class="tm">T+${fmt(e.t)}</span> ${esc(e.text)}</div>`).join('') : '<div>Plan transmitted at T+0. Uplink in transit…</div>'}</div>`
  }

  function bind() {
    $('#back', side)?.addEventListener('click', () => { stop(); ctx.back() })
    $$('[data-date]', side).forEach(b => b.addEventListener('click', () => {
      const err = m.setOpsDate(b.dataset.date!)
      msg = err ? { text: err, kind: 'bad' } : null
      sound.play(err ? 'fail' : 'ui')
      render()
    }))
    $$('[data-route]', side).forEach(b => b.addEventListener('click', () => { m.route = b.dataset.route as RouteId; sound.play('ui'); render() }))
    $$('[data-scan]', side).forEach(b => b.addEventListener('click', () => { m.scan = b.dataset.scan as ScanId; sound.play('ui'); render() }))
    $('#tx', side)?.addEventListener('click', async () => {
      busy = true; render()
      const err = await ctx.transmit()
      busy = false
      if (err) { sound.play('fail'); msg = { text: err, kind: 'bad' }; render(); return }
      msg = null
      sound.play('telemetry')
      toast(`Plan transmitted. Drive begins on Mars at T+${fmt(m.pass!.uplink)}.`, 'ok')
      render()
    })
    $('#next', side)?.addEventListener('click', () => { const t = m.nextEventTime(); if (t !== null) advance(t) })
    $('#p5', side)?.addEventListener('click', () => advance(m.clock + 5))
    $('#run', side)?.addEventListener('click', () => {
      if (timer) stop()
      else timer = window.setInterval(() => advance(m.clock + 1), 350)
      render()
    })
    $('#sites', side)?.addEventListener('click', () => { stop(); ctx.sites() })
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

/** One stacked budget bar with a text legend. `mark` draws a limit line at that value. */
function bar(title: string, summary: string, bad: boolean, segs: Seg[], span: number, unit: string, key: Seg[], mark?: number) {
  const n = (v: number) => fmt(Math.round(v * 10) / 10)
  const shown = segs.filter(x => x.v > 0)
  return `<div class="budget ${bad ? 'bad' : ''}">
    <div class="bhead"><span>${title}</span><b>${summary}</b></div>
    <div class="track" role="img" aria-label="${title} in ${unit}: ${shown.map(x => `${x.label} ${n(x.v)}`).join(', ')}">${shown.map(x => `<span class="${x.cls}" style="width:${(x.v / span) * 100}%" title="${x.label}: ${n(x.v)} ${unit}"></span>`).join('')}${mark === undefined ? '' : `<i class="mark" style="left:${(mark / span) * 100}%"></i>`}</div>
    <div class="legend">${key.filter(x => x.v > 0).map(x => `<span><i class="${x.cls}"></i>${x.label} ${n(x.v)}</span>`).join('')}</div>
  </div>`
}
