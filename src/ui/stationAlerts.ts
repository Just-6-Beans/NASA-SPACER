// The three station alerts. Each takes the whole screen until it is over, like the rover's
// stuck-wheel alert, and uses the same glass panels (src/tasks.css).
//
//   S1  CO2 rising      build an adapter from the cargo before the air goes bad
//   S3  Power down      choose what stays on through a blackout, then restart in order
//   S4  Cabin alarm     find the module, seal it, shut down the right system, move the crew
//
// The rules are in src/core/stationTasks.ts. Every reading and timer here is our model; the real
// event behind each alert is on its NASA card (data/nasa/station-tasks.json).
import '../field.css'
import '../tasks.css'
import '../station-tasks.css'
import type { Mission } from '../core/mission'
import {
  ADAPTER_ROLES, BATTERY_FLOOR, BLACKOUT_HOURS, CABIN_LINKS, CABIN_MODULES, CABIN_PENALTY_S, CABIN_SECONDS, CABIN_STEPS, DRIFT_HOURS, HEALTH_COST, MUSTER,
  RATION_SYSTEMS, RESTART_PENALTY, SCRUBBER_PENALTY_S, SCRUBBER_SECONDS, SHUTDOWNS,
  adapterFaults, adapterInventory, adapterPart, alertPoints, blackout, cabinMove, cabinName, co2Pct, hatchesOf, newCabinAlarm, rationPoints, rationResult, rationSystem, restartBlock, shedBlock,
  type AdapterPicks, type AdapterRole, type AlertId, type CabinModule, type Rating,
} from '../core/stationTasks'
import type { StationCardId } from '../data/stationTasks'
import { sound } from '../audio'
import { $, $$, el, esc } from './dom'
import { stationCardHtml } from './stationTasks'

export interface AlertCtx { m: Mission; refresh: () => void; close: () => void }
const MODEL = '<span class="tag model">Our model</span>'

const shell = (label: string) => el(`<div class="tk-veil tk-task sa" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="tk-frame"></div></div>`)
const lfMeter = (id: string, label: string, value: string, pct: number, tone: '' | 'warn' | 'bad' = '') =>
  `<div class="lf-meter ${tone}" id="${id}"><div class="lf-meter-top"><span>${label}</span><b>${value}</b></div><div class="lf-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div></div>`
const head = (flag: string, title: string, meters: string, open: boolean) => `<header class="tk-head alert"><div><div class="tk-flag"><i></i>${esc(flag)}</div><h2>${esc(title)}</h2></div>
  <div class="tk-meters">${meters}</div>
  <button class="lf-help" id="cards" aria-expanded="${open}" aria-label="What really happened" title="NASA card">?</button></header>`
const cardBox = (open: boolean, card: StationCardId, model: string) => open ? `<div class="tk-cards"><div class="lf-k"><span>What really happened</span><button class="lf-x" id="cardsx" aria-label="Close">×</button></div>
  ${stationCardHtml(card)}<p class="lf-popnote">${MODEL}${esc(model)}</p></div>` : ''
/** How an alert ended, and the way back to the deck. */
const outcome = (won: boolean, verdict: string, text: string, lesson: string, foot: string) => `<div class="tk-panel sa-out"><div class="lf-lift ${won ? 'comfortable' : 'short'}"><span class="lf-verdict">${esc(verdict)}</span><p>${esc(text)}</p></div>
  <p class="tk-lesson">${esc(lesson)}</p><button class="btn primary lf-go" id="closetask"><b>Back to the station</b><small>${esc(foot)}</small></button></div>`
/** Wires the parts every alert screen shares. */
function common(frame: HTMLElement, ctx: AlertCtx, toggleCards: () => void) {
  frame.querySelector('#cards')?.addEventListener('click', () => { sound.play('ui'); toggleCards() })
  frame.querySelector('#cardsx')?.addEventListener('click', toggleCards)
  frame.querySelector('#closetask')?.addEventListener('click', () => { sound.play('ui'); ctx.close() })
}

export function alertOverlay(id: AlertId, ctx: AlertCtx): HTMLElement {
  return id === 'scrubber' ? scrubberOverlay(ctx) : id === 'rationing' ? rationOverlay(ctx) : cabinOverlay(ctx)
}

// ---------------------------------------------------------------- S1 Square peg, round hole
function scrubberOverlay(ctx: AlertCtx): HTMLElement {
  const m = ctx.m
  const s = shell('Alert: CO2 rising'), frame = $('.tk-frame', s)
  const limit = m.alertSeconds(SCRUBBER_SECONDS)
  const inventory = adapterInventory(m.rng)
  const started = performance.now()
  let penalty = 0, tries = 0, cardsOpen = false
  let active: AdapterRole = 'enclose'
  const picks: AdapterPicks = {}
  let faults: { role: AdapterRole; text: string }[] = []
  let result: { won: boolean; left: number } | null = null
  const used = () => (performance.now() - started) / 1000 + penalty
  const left = () => Math.max(0, Math.ceil(limit - used()))

  const meters = () => {
    const u = result ? limit - result.left : used(), pct = result?.won ? 20 : co2Pct(u, limit)
    return lfMeter('co2', 'CO₂ in the cabin', result?.won ? 'falling' : `${pct}% of the limit`, pct, pct >= 85 ? 'bad' : pct >= 65 ? 'warn' : '')
      + lfMeter('time', 'Time left', `${result ? result.left : left()} s`, ((result ? result.left : left()) / limit) * 100, left() <= 15 && !result ? 'bad' : '')
  }
  function finish(won: boolean) {
    if (result) return
    clearInterval(timer)
    result = { won, left: won ? left() : 0 }
    const detail = won ? `adapter fitted with ${result.left} s to spare, at fitting ${tries}` : 'the CO₂ reached the limit before a working adapter was fitted.'
    m.endAlert('scrubber', won, alertPoints(result.left / limit), detail)
    sound.play(won ? 'success' : 'fail')
    ctx.refresh()
    render()
  }
  const lit = (role: AdapterRole) => picks[role] ? (faults.some(f => f.role === role) ? 'bad' : 'on') : ''
  const diagram = () => `<svg class="sa-adapter" viewBox="0 0 420 120" role="img" aria-label="The adapter: a square canister wrapped and joined to a round socket">
    <rect class="sa-wrap ${lit('enclose')}" x="14" y="12" width="150" height="96" rx="18"/>
    <rect class="sa-can" x="42" y="30" width="72" height="60" rx="3"/><text x="78" y="64" class="sa-t">SQUARE</text><text x="78" y="76" class="sa-t">CANISTER</text>
    <path class="sa-brace ${lit('brace')}" d="M124 22 V98"/>
    <path class="sa-hose ${lit('reach')}" d="M164 60 C210 60 230 28 280 34 S340 60 366 60"/>
    <circle class="sa-socket" cx="386" cy="60" r="20"/><text x="386" y="96" class="sa-t">ROUND SOCKET</text>
    <path class="sa-tape ${lit('seal')}" d="M158 46 l12 28 M360 46 l12 28"/></svg>`
  function render() {
    const ready = ADAPTER_ROLES.every(r => picks[r.id])
    const body = result
      ? outcome(result.won, result.won ? 'CO₂ falling' : 'CO₂ at the limit',
        result.won ? `The adapter holds and the air is clearing, with ${result.left} seconds to spare. +${alertPoints(result.left / limit)} points.` : 'The CO₂ reached the limit before a working adapter was fitted. Mission control talked the crew through the build, but late: the crew is unwell.',
        'Improvise with what is on board: each part had to match in shape, size and material.', result.won ? `+${alertPoints(result.left / limit)} points` : `crew health −${HEALTH_COST.scrubber}%`)
      : `<div class="tk-grid">
        <div class="tk-panel"><div class="lf-k"><span>1 · Cargo</span><em>tap a part for the job that is lit</em></div>
          <div class="tk-opts sa-parts">${inventory.map(id => { const p = adapterPart(id)!; const job = ADAPTER_ROLES.find(r => picks[r.id] === id)
            return `<button class="tk-opt" data-part="${id}" aria-pressed="${!!job}"><b>${esc(p.name)}</b><small>${esc(p.shape)} · ${esc(p.size)}</small><small>${esc(p.material)}</small></button>` }).join('')}</div></div>
        <div class="tk-col"><div class="tk-panel"><div class="lf-k"><span>2 · Adapter</span>${MODEL}</div>${diagram()}
          <div class="sa-jobs">${ADAPTER_ROLES.map(r => { const part = picks[r.id] ? adapterPart(picks[r.id]!) : null, fault = faults.find(f => f.role === r.id)
            return `<button class="sa-job ${active === r.id ? 'active' : ''} ${fault ? 'bad' : part ? 'on' : ''}" data-role="${r.id}"><b>${esc(r.name)}</b><small>${esc(fault ? fault.text : r.need)}</small><span>${part ? esc(part.name) : 'empty'}</span></button>` }).join('')}</div>
          ${faults.length ? `<div class="lf-block" role="alert">The adapter leaks. That fitting cost ${SCRUBBER_PENALTY_S} seconds.</div>` : ''}
          <button class="btn primary lf-go" id="install" ${ready ? '' : 'disabled'}><b>3 · Install the adapter</b><small>${ready ? 'a failed fitting costs ' + SCRUBBER_PENALTY_S + ' seconds' : 'choose a part for each of the four jobs'}</small></button></div></div></div>`
    frame.innerHTML = `${head('Alert · CO₂ rising', 'Fit the scrubber', meters(), cardsOpen)}${cardBox(cardsOpen, 'apollo13-filter', 'The parts, the time limit and the CO₂ gauge are game rules. The real adapter also used a sock and a liquid-cooling garment bag.')}
      ${body}<p class="tk-simnote sim">Simulated alert · our model, inspired by Apollo 13</p>`
    common(frame, ctx, () => { cardsOpen = !cardsOpen; render() })
    $$('[data-part]', frame).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.part!
      for (const r of ADAPTER_ROLES) if (picks[r.id] === id) delete picks[r.id]
      picks[active] = id
      faults = faults.filter(f => f.role !== active)
      active = ADAPTER_ROLES.find(r => !picks[r.id])?.id ?? active
      sound.play('ui')
      render()
    }))
    $$('[data-role]', frame).forEach(b => b.addEventListener('click', () => { active = b.dataset.role as AdapterRole; sound.play('ui'); render() }))
    frame.querySelector('#install')?.addEventListener('click', () => {
      tries++
      faults = adapterFaults(picks)
      if (!faults.length) return finish(true)
      penalty += SCRUBBER_PENALTY_S
      active = faults[0].role
      sound.play('fail')
      render()
    })
  }
  const timer = window.setInterval(() => {
    if (!s.isConnected) return clearInterval(timer)
    if (used() >= limit) return finish(false)
    const box = frame.querySelector('.tk-meters')
    if (box) box.innerHTML = meters()
  }, 200)
  render()
  return s
}

// ---------------------------------------------------------------- S3 Power rationing
const RATING: Record<Rating, [string, string]> = { critical: ['Critical', 'bad'], needed: ['Needed', 'warn'], useful: ['Useful', 'info'], spare: ['Can wait', 'none'] }

function rationOverlay(ctx: AlertCtx): HTMLElement {
  const m = ctx.m
  const s = shell('Alert: power down'), frame = $('.tk-frame', s)
  let phase: 'shed' | 'restart' | 'result' = 'shed'
  let off: string[] = [], up: string[] = [], waiting: string[] = []
  let mistakes = 0, msg = '', cardsOpen = false
  const batteryNow = () => Math.max(0, blackout(off).left - mistakes * RESTART_PENALTY)
  function end() {
    phase = 'result'
    const r = rationResult(off, mistakes)
    m.endAlert('rationing', r.won, rationPoints(r), r.won ? `${r.left}% of the battery left after a ${blackout(off).hours}-hour blackout${mistakes ? `, with ${mistakes} restart mistake${mistakes === 1 ? '' : 's'}` : ''}` : r.why)
    sound.play(r.won ? 'success' : 'fail')
    ctx.refresh()
    render()
  }
  function render() {
    const b = blackout(off), battery = phase === 'shed' ? b.left : batteryNow()
    const meters = lfMeter('batt', phase === 'shed' ? 'Battery when the array is back' : 'Battery', `${battery}%`, battery, battery < BATTERY_FLOOR ? 'bad' : battery < 15 ? 'warn' : '')
      + lfMeter('draw', 'Blackout', `${b.hours} h at ${b.drawPerHour}% an hour`, (b.drawPerHour / 35) * 100, b.frozen ? 'bad' : '')
    let body = ''
    if (phase === 'shed') {
      const warn = b.frozen ? 'With the heater off the cabin freezes before the array is back.' : b.left <= 0 ? 'The battery runs flat before the array is back.' : b.left < BATTERY_FLOOR ? `Less than ${BATTERY_FLOOR}% would be left.` : ''
      body = `<div class="tk-grid sa-ration">
        <div class="tk-panel"><div class="lf-k"><span>1 · Rank the systems</span>${MODEL}</div>
          <div class="sa-systems">${RATION_SYSTEMS.map(x => { const isOff = off.includes(x.id), lock = shedBlock(x.id), [word, tone] = RATING[x.rating]
            return `<div class="sa-sys ${isOff ? 'off' : ''}"><div><b>${esc(x.name)}</b><small>${esc(x.note)}</small></div><em class="risk ${tone}">${word}</em><span>${x.draw}% an hour</span>
              <button class="btn small ${isOff ? '' : 'mint'}" data-sys="${x.id}" ${lock ? 'disabled' : ''} aria-pressed="${!isOff}">${lock ? 'Stays on' : isOff ? 'Off' : 'On'}</button></div>` }).join('')}</div></div>
        <div class="tk-col"><div class="tk-panel"><div class="lf-k"><span>2 · Shut down non-essentials</span></div>
          <p class="tk-hint">The array is repaired in <b>${BLACKOUT_HOURS} hours</b>, or ${BLACKOUT_HOURS + DRIFT_HOURS} with navigation off. What stays on uses <b>${b.drawPerHour}%</b> of the battery an hour: <b>${b.used}%</b> in ${b.hours} hours.</p>
          <p class="tk-hint">Afterwards, everything you switch off has to be restarted in the right order. With communications on, mission control reads the order to you.</p>
          ${warn ? `<div class="lf-block" role="alert">${esc(warn)}</div>` : `<div class="lf-block ok">${b.left}% of the battery would be left: ${BATTERY_FLOOR}% is the least.</div>`}
          <button class="btn primary lf-go" id="ride"><b>Ride out the blackout</b><small>${off.length} system${off.length === 1 ? '' : 's'} switched off</small></button></div></div></div>`
    } else if (phase === 'restart') {
      const guided = !off.includes('comms')
      body = `<div class="tk-grid">
        <div class="tk-panel"><div class="lf-k"><span>3 · Restart in the right order</span></div>
          <p class="tk-hint">The array is back with <b>${battery}%</b> in the battery. Bring the systems back one at a time. A wrong step trips a breaker and costs <b>${RESTART_PENALTY}%</b>.</p>
          <div class="tk-opts">${waiting.map(id => { const x = rationSystem(id)
            return `<button class="tk-opt" data-up="${id}"><b>${esc(x.name)}</b><small>${guided || up.includes('comms') ? esc(x.rule) : 'No step on screen'}</small></button>` }).join('')}</div>
          ${msg ? `<div class="lf-block" role="alert">${esc(msg)}</div>` : ''}</div>
        <div class="tk-col"><div class="tk-panel"><div class="lf-k"><span>Running</span></div>
          <div class="sa-up">${up.map(id => `<span>${esc(rationSystem(id).name)}</span>`).join('')}</div>
          <p class="tk-hint">${guided || up.includes('comms') ? 'Communications is up: mission control reads each step to you.' : 'Communications is down, so the restart steps are not on screen. Restart it to see them.'}</p></div></div></div>`
    } else {
      const r = rationResult(off, mistakes)
      body = outcome(r.won, r.won ? 'Station alive' : 'Station in trouble', r.won ? `${r.why} +${rationPoints(r)} points.` : `${r.why} The crew came through it cold and shaken.`,
        'Power budgeting: what must run, what can wait, and what depends on what.', r.won ? `+${rationPoints(r)} points` : `crew health −${HEALTH_COST.rationing}%`)
    }
    frame.innerHTML = `${head('Alert · Power down', 'Keep the station alive', meters, cardsOpen)}${cardBox(cardsOpen, 'apollo13-power', 'The systems, what each draws, the four-hour blackout and the restart order are game rules.')}
      ${body}<p class="tk-simnote sim">Simulated alert · our model, inspired by Apollo 13</p>`
    common(frame, ctx, () => { cardsOpen = !cardsOpen; render() })
    $$('[data-sys]', frame).forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.sys!
      off = off.includes(id) ? off.filter(x => x !== id) : [...off, id]
      sound.play('ui')
      render()
    }))
    frame.querySelector('#ride')?.addEventListener('click', () => {
      const bo = blackout(off)
      if (bo.frozen || bo.left <= 0 || !off.length) return end()
      up = RATION_SYSTEMS.map(x => x.id).filter(id => !off.includes(id))
      waiting = RATION_SYSTEMS.map(x => x.id).filter(id => off.includes(id))
      phase = 'restart'
      sound.play('charge')
      render()
    })
    $$('[data-up]', frame).forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.up!
      const block = restartBlock(id, up, waiting)
      if (block) { mistakes++; msg = block; sound.play('fail'); if (batteryNow() < BATTERY_FLOOR) return end(); return render() }
      msg = ''
      up = [...up, id]
      waiting = waiting.filter(x => x !== id)
      sound.play('telemetry')
      if (!waiting.length) return end()
      render()
    }))
  }
  render()
  return s
}

// ---------------------------------------------------------------- S4 Fire or leak response
// The station in plan: where each module and each hatch sits on the alarm panel.
const PLAN: Record<CabinModule, [number, number, number, number]> = {
  cupola: [20, 10, 120, 70], dock: [500, 10, 120, 70], node3: [20, 122, 120, 82], node1: [180, 122, 120, 82], lab: [340, 122, 120, 82], node2: [500, 122, 120, 82],
  greenhouse: [180, 246, 280, 70], comms: [500, 246, 120, 70],
}
const HATCH: Record<string, [number, number]> = { cupola: [80, 101], 'n3-n1': [160, 163], 'n1-lab': [320, 163], 'lab-n2': [480, 163], dock: [560, 101], greenhouse: [240, 225], comms: [560, 225] }
const STEP_NAME = { identify: 'Identify the module', seal: 'Seal its hatches', shutdown: 'Shut down the system', muster: 'Move the crew' }

function cabinOverlay(ctx: AlertCtx): HTMLElement {
  const m = ctx.m
  const s = shell('Alert: cabin alarm'), frame = $('.tk-frame', s)
  const alarm = newCabinAlarm(m.rng)
  const limit = m.alertSeconds(CABIN_SECONDS)
  const started = performance.now()
  let penalty = 0, at = 0, cardsOpen = false, msg = '', bad = false
  let sealed: string[] = []
  let result: { won: boolean; left: number } | null = null
  const used = () => (performance.now() - started) / 1000 + penalty
  const left = () => Math.max(0, Math.ceil(limit - used()))
  const what = alarm.hazard === 'fire' ? 'fire' : 'air leak'
  const meters = () => lfMeter('time', 'Time left', `${result ? result.left : left()} s`, ((result ? result.left : left()) / limit) * 100, !result && left() <= 10 ? 'bad' : '')
    + lfMeter('step', 'Step', result ? 'done' : `${at + 1} of ${CABIN_STEPS.length}`, ((result?.won ? CABIN_STEPS.length : at) / CABIN_STEPS.length) * 100)
  function finish(won: boolean) {
    if (result) return
    clearInterval(timer)
    result = { won, left: won ? left() : 0 }
    m.endAlert('cabin', won, alertPoints(result.left / limit), won ? `${what} in the ${cabinName(alarm.source)} contained with ${result.left} s to spare` : `the ${what} in the ${cabinName(alarm.source)} spread before it was contained.`)
    sound.play(won ? 'success' : 'fail')
    ctx.refresh()
    render()
  }
  function move(choice: string) {
    if (result) return
    const step = CABIN_STEPS[at], r = cabinMove(alarm, step, choice)
    msg = r.text
    bad = !r.ok
    if (!r.ok) { penalty += CABIN_PENALTY_S[step]; msg += ` −${CABIN_PENALTY_S[step]} s.`; sound.play('fail'); return render() }
    sound.play('ui')
    if (step === 'seal') {
      if (!sealed.includes(choice)) sealed = [...sealed, choice]
      if (hatchesOf(alarm.source).some(h => !sealed.includes(h))) return render()
    }
    at++
    if (at >= CABIN_STEPS.length) return finish(true)
    render()
  }
  const plan = () => {
    const step = result ? null : CABIN_STEPS[at], known = at > 0 || !!result
    const mods = CABIN_MODULES.map(x => {
      const [px, py, w, h] = PLAN[x.id], r = alarm.readings[x.id]
      const reading = alarm.hazard === 'fire' ? `Smoke ${r.smoke}%` : `${r.pressure} kPa`
      const cls = `${known && x.id === alarm.source ? 'source' : ''} ${step === 'identify' || step === 'muster' ? 'tap' : ''} ${result?.won && x.id === MUSTER ? 'safe' : ''}`
      return `<g class="sa-mod ${cls}" data-mod="${x.id}" tabindex="${step === 'identify' || step === 'muster' ? 0 : -1}" role="button" aria-label="${esc(x.name)}: ${reading}">
        <rect x="${px}" y="${py}" width="${w}" height="${h}" rx="14"/><text x="${px + w / 2}" y="${py + h / 2 - 5}" class="sa-mn">${esc(x.name)}</text><text x="${px + w / 2}" y="${py + h / 2 + 15}" class="sa-mr">${reading}</text></g>`
    }).join('')
    const hatches = CABIN_LINKS.map(l => {
      const [hx, hy] = HATCH[l.id], shut = sealed.includes(l.id)
      return `<g class="sa-hatch ${shut ? 'shut' : ''} ${step === 'seal' ? 'tap' : ''}" data-hatch="${l.id}" tabindex="${step === 'seal' ? 0 : -1}" role="button" aria-label="Hatch between ${esc(cabinName(l.a))} and ${esc(cabinName(l.b))}${shut ? ', closed' : ''}">
        <rect x="${hx - 15}" y="${hy - 15}" width="30" height="30" rx="5"/><path d="${shut ? `M${hx - 8} ${hy - 8} L${hx + 8} ${hy + 8} M${hx + 8} ${hy - 8} L${hx - 8} ${hy + 8}` : `M${hx - 8} ${hy} H${hx + 8}`}"/></g>`
    }).join('')
    return `<svg class="sa-plan" viewBox="0 0 640 326" role="group" aria-label="Station plan">${hatches}${mods}</svg>`
  }
  function render() {
    const step = result ? null : CABIN_STEPS[at]
    const guide = step === 'identify' ? `Tap the module with the worst ${alarm.hazard === 'fire' ? 'smoke' : 'pressure'} reading. Its neighbours read a little off too.`
      : step === 'seal' ? `Tap every hatch of the ${cabinName(alarm.source)} on the plan: ${sealed.length} of ${hatchesOf(alarm.source).length} closed.`
        : step === 'shutdown' ? `Which system feeds a ${what}? Shut it down.` : step === 'muster' ? 'Tap the module where the crew gathers: where the ship home is docked.' : ''
    const body = result
      ? outcome(result.won, result.won ? 'Contained' : 'It spread', result.won ? `The ${what} in the ${cabinName(alarm.source)} is sealed off and the crew is at the ship home, with ${result.left} seconds to spare.` : `Time ran out: the ${what} in the ${cabinName(alarm.source)} reached the next module before it was sealed off, and a crew member was hurt.`,
        'Isolate the fault first. Be quick without guessing: every wrong move cost seconds.', result.won ? `+${alertPoints(result.left / limit)} points` : `crew health −${HEALTH_COST.cabin}%`)
      : `<div class="tk-grid sa-cabin">
        <div class="tk-panel"><div class="lf-k"><span>${alarm.hazard === 'fire' ? 'Smoke alarm' : 'Pressure alarm'} · station plan</span>${MODEL}</div>${plan()}
          <p class="sa-key">${alarm.hazard === 'fire' ? 'Smoke in per cent of the alarm level. Clean air reads 0 to 3%.' : 'Cabin pressure in kilopascals. Normal is 101 kPa.'}</p></div>
        <div class="tk-col"><div class="tk-panel"><div class="lf-k"><span>What to do</span></div>
          <ol class="sa-steps">${CABIN_STEPS.map((x, i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''}"><b>${i + 1}</b><span>${STEP_NAME[x]}</span></li>`).join('')}</ol>
          <p class="tk-hint">${esc(guide)}</p>
          ${step === 'shutdown' ? `<div class="tk-opts sa-shut">${SHUTDOWNS.map(x => `<button class="tk-opt" data-shut="${x.id}"><b>${esc(x.name)}</b><small>${esc(x.clue)}</small></button>`).join('')}</div>` : ''}
          ${msg ? `<div class="lf-block ${bad ? '' : 'ok'}" role="${bad ? 'alert' : 'status'}">${esc(msg)}</div>` : ''}</div></div></div>`
    frame.innerHTML = `${head(`Alert · ${alarm.hazard === 'fire' ? 'Smoke alarm' : 'Pressure alarm'}`, 'Contain the emergency', meters(), cardsOpen)}${cardBox(cardsOpen, 'mir-fire', 'The readings, the four steps and the time limit are game rules. Real crews follow written procedures and train for them on the ground.')}
      ${body}<p class="tk-simnote sim">Simulated alert · our model, inspired by real fires and leaks on Mir and the space station</p>`
    common(frame, ctx, () => { cardsOpen = !cardsOpen; render() })
    const tap = (node: Element, fn: () => void) => { node.addEventListener('click', fn); node.addEventListener('keydown', e => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') { e.preventDefault(); fn() } }) }
    const step2 = result ? null : CABIN_STEPS[at]
    if (step2 === 'identify' || step2 === 'muster') frame.querySelectorAll('[data-mod]').forEach(n => tap(n, () => move((n as HTMLElement).dataset.mod!)))
    if (step2 === 'seal') frame.querySelectorAll('[data-hatch]').forEach(n => tap(n, () => move((n as HTMLElement).dataset.hatch!)))
    $$('[data-shut]', frame).forEach(b => b.addEventListener('click', () => move(b.dataset.shut!)))
  }
  const timer = window.setInterval(() => {
    if (!s.isConnected) return clearInterval(timer)
    if (used() >= limit) return finish(false)
    const box = frame.querySelector('.tk-meters')
    if (box) box.innerHTML = meters()
  }, 200)
  render()
  return s
}
