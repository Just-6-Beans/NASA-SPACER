// Rover operations: planner, forecast, transmission, delayed clock, and telemetry.
import { DUST_DEADLINE, RESERVE_FLOOR, ROUTES, SCANS, STRONG_LOW_END, byId, type RouteId, type ScanId } from '../core/data'
import type { Mission } from '../core/mission'
import {
  COMMAND_LABEL, commandStatus, forecastWarnings, fmt, queueError, roverPosition, uncertaintyFor, reading, type CommandKind, type TimelineEvent,
} from '../core/rover'
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
    <div class="mapzone"><div class="maplabel"><b style="font-family:var(--display);font-size:18px;letter-spacing:.06em">ARES SURVEY SECTOR</b><div class="sim">Simulated terrain, ice and timing</div></div>
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

  function render() {
    syncMap()
    const p = m.pass
    const known = p ? ([...p.commands].reverse().find(c => c.telemetryAt !== null && m.clock >= c.telemetryAt)?.batteryEnd ?? m.ship.battery) : m.ship.battery
    const bt = $('#batt', s)
    bt.className = `batt ${known <= 30 ? 'low' : ''}`
    bt.innerHTML = `<span class="bcell"><i style="width:${known}%"></i></span>BATTERY ${known}%`
    bt.title = p ? 'Last battery level received on Earth' : 'Starting rover battery'
    side.innerHTML = m.pass ? opsHtml() : planHtml()
    bind()
    ctx.refresh()
  }

  function planHtml() {
    const f = m.forecast()!
    const qErr = queueError(m.queue)
    const block = m.transmitBlock()
    const warns = forecastWarnings(m.snapshot()!, f)
    const unc = uncertaintyFor(m.instrument!, m.calibrated, m.power, m.scan)
    const rd = reading(unc)
    const sc = f.commands[1]
    return `<div class="row" style="justify-content:space-between"><h2>Rover planner</h2><button class="btn small" id="back">← Station</button></div>
      <div class="sim" style="margin:4px 0 8px">Rover clock T+ is simulated mission minutes; it starts at transmission.</div>
      <h3>Route</h3><div class="seg-ctl">${ROUTES.map(r => `<button data-route="${r.id}" aria-pressed="${m.route === r.id}"><b>${r.name}</b><small>${r.legMin} min · ${r.legDraw - (m.completed.has('battery') ? 3 : 0)} pts / leg</small></button>`).join('')}</div>
      <div style="font-size:12px;color:#b9ae95;margin-top:4px">${byId(ROUTES, m.route).note}</div>
      <h3>Scan</h3><div class="seg-ctl">${SCANS.map(x => `<button data-scan="${x.id}" aria-pressed="${m.scan === x.id}"><b>${x.name}</b><small>${x.minutes} min · ${m.instrumentInfo!.quickDraw + x.extraDraw} pts${x.uncertaintyCut ? ` · −${x.uncertaintyCut} unc` : ''}</small></button>`).join('')}</div>
      <h2 style="margin-top:16px;font-size:30px">Command queue</h2>
      <div class="row" style="gap:6px;margin:8px 0">${(['drive', 'scan', 'return'] as CommandKind[]).map(k => `<button class="btn small" data-add="${k}">+ ${COMMAND_LABEL[k]}</button>`).join('')}<button class="btn small ghost" id="clr">Clear</button></div>
      <div class="qrows">${m.queue.map((k, i) => qrow(i, k, qErr !== null && i >= firstBad(m.queue))).join('')}${m.queue.length < 3 ? `<div class="qrow empty"><span class="num">${String(m.queue.length + 1).padStart(2, '0')}</span><span></span><span class="lbl">Add ${COMMAND_LABEL[(['drive', 'scan', 'return'] as CommandKind[])[m.queue.length]]}</span><span></span></div>` : ''}</div>
      ${qErr ? `<div class="warns"><div class="danger">${esc(qErr)}</div></div>` : ''}
      <div class="linkrow">${ICONS.dish}<span>Uplink</span><b>+${fmt(f.uplink)} min</b></div>
      <div class="linkrow">${ICONS.bars}<span>Scan telemetry</span><b>${f.readingAt !== null ? `T+${fmt(f.readingAt)}` : '—'}</b></div>
      <div class="linkrow">${ICONS.home}<span>Return confirmed</span><b>${f.returned ? `T+${fmt(f.finalTelemetryAt)}` : 'safe mode'}</b></div>
      <h3>Forecast (shared with execution)</h3>
      <div class="fc">
        <span>Uplink (Earth → Mars)</span><b>${fmt(f.uplink)} min</b>
        <span>Downlink (Mars → Earth)</span><b>${fmt(f.downlink)} min</b>
        <span>Drive starts on Mars</span><b>T+${fmt(f.commands[0].start)}</b>
        <span>Scan data received</span><b>${f.readingAt !== null ? `T+${fmt(f.readingAt)}` : sc.status === 'partial' ? 'none (stops mid-scan)' : '—'}</b>
        <span>Return confirmation</span><b>${f.returned ? `T+${fmt(f.finalTelemetryAt)}` : `safe mode T+${fmt(f.safeMode!.arriveAt)}`}</b>
        <span>Battery start → end</span><b>${m.ship.battery}% → ${f.finalBattery}%</b>
        <span>Reserve floor</span><b>${RESERVE_FLOOR}%</b>
        <span>Predicted ice reading</span><b>${rd.estimate}% ±${rd.uncertainty} (low ${rd.low}%)</b>
        <span>Evidence</span><b style="color:${rd.strong ? '#6ef2c6' : '#ffb347'}">${rd.strong ? 'Strong' : 'Weak'} (needs low ≥ ${STRONG_LOW_END}%)</b>
        <span>Ares dust deadline</span><b>T+${DUST_DEADLINE}</b>
      </div>
      <div class="warns">${warns.map(w => `<div class="${w.level}">${esc(w.text)}</div>`).join('')}</div>
      <button class="btn primary huge" id="tx" ${block || busy ? 'disabled' : ''}>${busy ? 'Checking with crew…' : 'Transmit sequence'}</button>
      ${block ? `<div class="feedback warn">${esc(block)}</div>` : '<div class="feedback">Risky plans can be sent. One pass per run.</div>'}
      ${msg ? `<div class="feedback ${msg.kind}">${esc(msg.text)}</div>` : ''}`
  }

  function opsHtml() {
    const p = m.pass!
    const rd = m.receivedReading
    const lastBattery = [...p.commands].reverse().find(c => c.telemetryAt !== null && m.clock >= c.telemetryAt)?.batteryEnd ?? m.ship.battery
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
      <div class="row" style="justify-content:space-between;margin-top:8px"><div><div class="bigclock mono">T+${fmt(m.clock)}</div><div class="sim">Simulated mission minutes</div></div>
        <div style="text-align:right;font-family:var(--mono);font-size:12px">Signal leg ${fmt(p.uplink)} min<br/>Last known battery <b>${lastBattery}%</b></div></div>
      <div class="actions">${m.passDone ? '<button class="btn primary" id="sites">Review landing sites</button>' : `<button class="btn" id="next">Next event</button><button class="btn" id="p5">+5 min</button><button class="btn mint" id="run">${timer ? 'Pause clock' : 'Run clock'}</button>`}</div>
      ${m.passDone ? `<div class="feedback ok">Final telemetry received at T+${fmt(p.finalTelemetryAt)}. ${p.returned ? `Rover back at base with ${p.finalBattery}%.` : `Rover in safe mode at ${p.finalBattery}% reserve.`}</div>` : ''}
      <h3>Command queue</h3><div class="qrows">${p.commands.map((c, i) => {
        const st = commandStatus(p, i, m.clock)
        return `<div class="qrow"><span class="num">${String(i + 1).padStart(2, '0')}</span>${CMD_ICON[c.kind]}<span class="lbl">${CMD_TEXT[c.kind]}<small>${c.status === 'cancelled' ? 'not executed' : `Mars T+${fmt(c.start)} → T+${fmt(c.end)}${c.telemetryAt !== null ? ` · telemetry T+${fmt(c.telemetryAt)}` : ''}`}</small></span><span class="st ${st}">${STATUS_TEXT[st]}</span></div>`
      }).join('')}</div>
      <h3>Evidence on Earth</h3>${evidence}
      <h3>Event log</h3><div class="evlog">${fired.length ? fired.map(e => `<div><span class="tm">T+${fmt(e.t)}</span> ${esc(e.text)}</div>`).join('') : '<div>Plan transmitted at T+0. Uplink in transit…</div>'}</div>`
  }

  function bind() {
    $('#back', side)?.addEventListener('click', () => { stop(); ctx.back() })
    $$('[data-route]', side).forEach(b => b.addEventListener('click', () => { m.route = b.dataset.route as RouteId; sound.play('ui'); render() }))
    $$('[data-scan]', side).forEach(b => b.addEventListener('click', () => { m.scan = b.dataset.scan as ScanId; sound.play('ui'); render() }))
    $$('[data-add]', side).forEach(b => b.addEventListener('click', () => { m.queue = [...m.queue, b.dataset.add as CommandKind]; sound.play('ui'); msg = null; render() }))
    $('#clr', side)?.addEventListener('click', () => { m.queue = []; render() })
    $('#tx', side)?.addEventListener('click', async () => {
      busy = true; render()
      const err = await ctx.transmit()
      busy = false
      if (err) { sound.play('fail'); msg = { text: err, kind: 'bad' }; render(); return }
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
function qrow(i: number, k: CommandKind, bad: boolean) {
  return `<div class="qrow ${bad ? 'bad' : ''}"><span class="num">${String(i + 1).padStart(2, '0')}</span>${CMD_ICON[k]}<span class="lbl">${CMD_TEXT[k]}</span><span></span></div>`
}

function firstBad(q: CommandKind[]) {
  const order: CommandKind[] = ['drive', 'scan', 'return']
  const i = q.findIndex((k, j) => k !== order[j])
  return i < 0 ? 3 : i
}

