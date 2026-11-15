// Station tasks that open as panel tabs, and the pop-up that announces a task:
//
//   Crew schedule (S5)         Crew Quarters    plan one day, keep performance above the target
//   Water recycling loop (S2)  Hab Systems      connect the loop, then decide on the filter bed
//   Relay repair               Rover Comms      tune the receiver onto a drifting carrier
//   Earth observation          Cupola           real photographs of Earth taken from the station
//
// The rules are in src/core/stationTasks.ts. The "NASA card" on each pop-up and the photographs
// come from data/nasa/station-tasks.json. Everything a panel shows as a reading is our model.
import '../field.css'
import '../tasks.css'
import '../station-tasks.css'
import { DUST_SPEED, type Mission } from '../core/mission'
import { powerPct } from '../core/power'
import {
  ACTIVITIES, BATTERY_FLOOR, BLOCK_HOURS, BRINE_LIFE_UNITS, CABIN_SECONDS, CLOG_LOSS, DIAL_MAX, DIAL_START, EXERCISE_NEED_H, FILTER_COST, LOOP_ORDER, LOOP_PARTS, LOOP_POOL,
  RELAY_HOLD_S, REST_NEED_H, SCHEDULE_START, SCHEDULE_TARGET, SCRUBBER_SECONDS, SLEEP_NEED_H, WATER_BASE_PCT, WATER_BRINE_PCT, WATER_TARGET, WORK_FAIR_H, WORK_NEED_H,
  crewDay, loopCheck, newRelayTuning, relayNoise, relayOnCarrier, relayQuality, scheduleBlock, schedulePoints, waterBonus, waterRecovery, waterSafe,
  type Activity, type RelayTuning,
} from '../core/stationTasks'
import { EARTH_PHOTOS, stationCard, type StationCardId } from '../data/stationTasks'
import { sound } from '../audio'
import { $, $$, el, esc } from './dom'
import { openPanel, type PanelCtx } from './panels'

const REAL = '<span class="tag real">NASA data</span>'
const file = (f: string) => `${import.meta.env.BASE_URL}${f}`
const fb = (body: HTMLElement, text: string, kind: 'ok' | 'bad' | 'warn' | '' = '') => {
  const f = $('.feedback', body)
  if (!f) return
  f.className = `feedback ${kind}`
  f.textContent = text
}
/** A labelled bar with an optional target mark, in the Mission Ops look. */
export const meter = (label: string, value: string, pct: number, tone: 'good' | 'warn' | 'bad' | 'info', mark?: number) =>
  `<div class="rbar ${tone}"><div class="rbar-top"><span>${label}</span><b>${value}</b></div><div class="rbar-track"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i>${mark === undefined ? '' : `<u style="left:${Math.max(0, Math.min(100, mark))}%"></u>`}</div></div>`

/** One "what really happened" card: a title, a few lines, and the NASA page they come from. */
export function stationCardHtml(id: StationCardId) {
  const c = stationCard(id), src = c.backing[0].source
  return `<div class="tk-card"><div class="tk-card-h">${REAL}<b>${esc(c.title)}</b></div>
    <p>${esc(c.text)}</p>
    <a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.provider)}: ${esc(src.title)}</a></div>`
}

// ---------------------------------------------------------------- The pop-up that announces a task
export type StationIntroId = 'schedule' | 'water' | 'scrubber' | 'rationing' | 'cabin' | 'dust'
interface Intro { tone: 'alert' | 'mission'; tag: string; title: string; lead: string; steps: [string, string, string]; target: string; card: StationCardId; go: string }
const intro = (id: StationIntroId, m: Mission): Intro => ({
  schedule: {
    tone: 'mission', tag: 'New mission', title: 'Daily routine', lead: "Plan the crew's day. A simulation inspired by space station crew schedules.",
    steps: ['Fill work blocks', 'Add exercise', 'Protect sleep'], target: `Keep crew performance above ${SCHEDULE_TARGET}%.`, card: 'crew-day', go: 'Open the day plan',
  },
  water: {
    tone: 'mission', tag: 'New mission', title: 'Every drop', lead: "Recycle the crew's water. A simulation inspired by the space station's water recovery system.",
    steps: ['Connect distiller, filters and tank', 'Keep water quality safe', `Reach ${WATER_TARGET}% recovery`], target: `${WATER_TARGET}% water recovery, safe to drink.`, card: 'iss-water', go: 'Open the loop',
  },
  scrubber: {
    tone: 'alert', tag: 'Alert', title: 'CO₂ rising', lead: 'Fit the scrubber. A simulation inspired by the Apollo 13 CO₂ crisis (1970).',
    steps: ['Inventory the cargo', 'Build an adapter', 'Install it before CO₂ hits the limit'], target: `A working adapter within ${m.alertSeconds(SCRUBBER_SECONDS)} seconds.`, card: 'apollo13-filter', go: 'Open the cargo',
  },
  rationing: {
    tone: 'alert', tag: 'Alert', title: 'Power down', lead: "A solar array has failed. Keep the station alive. A simulation inspired by Apollo 13's power-down.",
    steps: ['Rank the systems', 'Shut down non-essentials', 'Restart in the right order'], target: `Reach the end of the blackout with at least ${BATTERY_FLOOR}% battery.`, card: 'apollo13-power', go: 'Open the power board',
  },
  cabin: {
    tone: 'alert', tag: 'Alert', title: 'Cabin alarm', lead: 'Contain the emergency. A simulation inspired by real fires and leaks on Mir and the space station.',
    steps: ['Identify the module', 'Seal hatches and shut down the system', 'Move the crew'], target: `Contain it within ${m.alertSeconds(CABIN_SECONDS)} seconds with no crew injured.`, card: 'mir-fire', go: 'Open the station plan',
  },
  dust: {
    tone: 'alert', tag: 'Alert', title: 'Dust storm', lead: 'A dust storm has reached the rover. Its cameras see less, so it drives slower.',
    steps: ['Check the plan', 'Drive on, or wait it out', 'Watch the battery'], target: `For about ${m.dustSolsLeft} Mars days every metre costs about ${Math.round((1 / DUST_SPEED - 1) * 100)}% more battery. The storm passes by itself.`, card: 'dust-2018', go: 'Back to the rover',
  },
} as Record<StationIntroId, Intro>)[id]

/** A task's opening card: what it is, the three steps, the target, and one NASA card. */
export function stationIntro(id: StationIntroId, m: Mission, onGo: () => void): HTMLElement {
  const o = intro(id, m)
  const box = el(`<div class="tk-veil tk-intro ${o.tone}" role="alertdialog" aria-modal="true" aria-label="${esc(o.tag)}: ${esc(o.title)}">
    <div class="tk-introcard">
      <div class="tk-flag"><i></i>${esc(o.tag)}</div>
      <h2>${esc(o.title)}</h2>
      <p class="tk-lead">${esc(o.lead)}</p>
      <ol class="tk-steps">${o.steps.map((s, i) => `<li><b>${i + 1}</b><span>${esc(s)}</span></li>`).join('')}</ol>
      <div class="tk-target"><small>Target</small>${esc(o.target)}</div>
      ${stationCardHtml(o.card)}
      <button class="btn primary lf-go" id="go"><b>${esc(o.go)}</b></button>
    </div></div>`)
  $('#go', box).addEventListener('click', () => { sound.play('ui'); box.remove(); onGo() })
  setTimeout(() => ($('#go', box) as HTMLElement | null)?.focus(), 60)
  return box
}

// ---------------------------------------------------------------- S5 Crew schedule
const hh = (i: number) => `${String(i * BLOCK_HOURS).padStart(2, '0')}:00`
const ACT_SHORT: Record<Activity, string> = { sleep: 'Sleep', work: 'Work', exercise: 'Exercise', rest: 'Rest' }

export function scheduleTab(body: HTMLElement, rerender: () => void, ctx: PanelCtx) {
  const m = ctx.m
  const d = (m.drafts.schedule ??= { day: [...SCHEDULE_START], brush: 'sleep' }) as { day: Activity[]; brush: Activity }
  const done = !!m.schedule
  const day = done ? m.schedule! : d.day
  const r = crewDay(day)
  const block = done ? null : scheduleBlock(day)
  const tone = r.performance >= 90 ? 'good' : r.performance >= SCHEDULE_TARGET ? 'info' : 'bad'
  const effect = r.performance >= 90 ? 'A rested crew: 15% more time in every alert.' : r.performance >= SCHEDULE_TARGET ? 'A steady crew: the normal time in every alert.' : 'A tired crew: 25% less time in every alert.'
  const need: Record<Activity, string> = {
    sleep: `${SLEEP_NEED_H} h needed`, work: `${WORK_NEED_H} h at least, ${WORK_FAIR_H} h without tiring`, exercise: `${EXERCISE_NEED_H} h needed`, rest: `${REST_NEED_H} h needed`,
  }
  body.innerHTML = `<p class="lead">${done ? 'The crew is working to this day.' : 'Plan one day for the crew, in two-hour blocks. Choose an activity, then tap the blocks it should fill.'}</p>
    ${done ? '' : `<div class="st-brush" role="radiogroup" aria-label="Activity">${ACTIVITIES.map(a => `<button class="st-act ${a.id}" data-act="${a.id}" role="radio" aria-checked="${d.brush === a.id}"><b>${a.name}</b><small>${a.clue}</small></button>`).join('')}</div>`}
    <div class="st-day">${day.map((a, i) => `<button class="st-block ${a}" data-i="${i}" ${done ? 'disabled' : ''} aria-label="${hh(i)}: ${ACT_SHORT[a]}"><small>${hh(i)}</small><b>${ACT_SHORT[a]}</b></button>`).join('')}</div>
    <div class="st-cols">
      <div>${meter('Crew performance', `${r.performance}%`, r.performance, tone, SCHEDULE_TARGET)}
        <p class="st-note">${effect}</p>
        ${r.costs.length ? `<ul class="st-costs">${r.costs.map(c => `<li><b>−${c.lost}%</b> ${esc(c.why)}</li>`).join('')}</ul>` : '<p class="st-note good">Nothing is pulling performance down.</p>'}</div>
      <div class="ledger st-hours">${ACTIVITIES.map(a => `<span>${a.name}</span><b>${r.hours[a.id]} h <small>${need[a.id]}</small></b>`).join('')}
        <span>Points</span><b>${schedulePoints(day)} <small>40 at the target, +5 for each hour of work past ${WORK_NEED_H}</small></b></div>
    </div>
    <p class="st-real">${REAL}Station crews exercise for an average of two hours a day. The hours of sleep, work and rest, and the performance figure, are our model.</p>
    <div class="feedback ${done ? (m.failed.has('schedule') ? 'warn' : 'ok') : block ? 'warn' : ''}">${done
      ? `The crew has its day: performance ${r.performance}%. ${effect}`
      : block ? esc(block) : r.performance < SCHEDULE_TARGET ? `Performance is under the ${SCHEDULE_TARGET}% target. You can still hand it over: the crew will be tired.` : 'Ready. The plan is given once and stays for the mission.'}</div>
    <div class="actions">${done ? '<span class="donebadge">COMPLETE</span>' : `<button class="btn primary" id="ok" ${block ? 'disabled' : ''}>Give the crew this day</button><button class="btn" id="rs">Reset</button>`}</div>`
  $$('.st-act', body).forEach(b => b.addEventListener('click', () => { d.brush = b.dataset.act as Activity; sound.play('ui'); rerender() }))
  $$('.st-block', body).forEach(b => b.addEventListener('click', () => { d.day[Number(b.dataset.i)] = d.brush; sound.play('ui'); rerender() }))
  $('#rs', body)?.addEventListener('click', () => { d.day = [...SCHEDULE_START]; rerender() })
  $('#ok', body)?.addEventListener('click', () => {
    const err = m.planDay(d.day)
    if (err) { sound.play('fail'); fb(body, err, 'bad'); return }
    sound.play(m.failed.has('schedule') ? 'fail' : 'success')
    ctx.refresh()
    rerender()
  })
}

// ---------------------------------------------------------------- S2 Water recycling loop
interface WaterDraft { order: string[]; connected: boolean; fresh: boolean }
const loopPart = (id: string) => LOOP_PARTS.find(p => p.id === id)!

export function waterTab(body: HTMLElement, rerender: () => void, ctx: PanelCtx) {
  const m = ctx.m
  const d = (m.drafts.water ??= { order: [], connected: false, fresh: true }) as WaterDraft
  const ran = !!m.waterLoop
  const order = ran || d.connected ? LOOP_ORDER : d.order
  const locked = ran || d.connected
  // The loop from the waste line to the tap: four places, filled in order. Once it is connected the parts are fixed.
  const chain = `<div class="st-flow"><span>In: urine, sweat, breath</span><i></i><span>Out: drinking water</span></div>
    <div class="st-loop">${LOOP_ORDER.map((_, i) => !order[i] ? `<div class="slot"><span style="color:#b9ae95">${i + 1}. empty</span></div>`
      : locked ? `<div class="slot filled"><b>${i + 1}. ${loopPart(order[i]).name}</b></div>`
        : `<button class="slot filled" data-slot="${i}" aria-label="Remove ${loopPart(order[i]).name}"><b>${i + 1}. ${loopPart(order[i]).name}</b>${loopPart(order[i]).clue}</button>`).join('')}</div>`
  if (!ran && !d.connected) {
    body.innerHTML = `<p class="lead">Step 1 of 2. Connect the four parts between the waste line and the tap. Read what each part does.</p>${chain}
      <div class="pool">${LOOP_POOL.map(id => `<button class="chip" data-id="${id}" ${d.order.includes(id) ? 'disabled' : ''}><b>${loopPart(id).name}</b>${loopPart(id).clue}</button>`).join('')}</div>
      <div class="feedback">Tap parts to place them in order. Tap a placed part to take it out.</div>
      <div class="actions"><button class="btn primary" id="ok">Check the connections</button><button class="btn" id="rs">Reset</button></div>`
    $$('.chip', body).forEach(c => c.addEventListener('click', () => { if (d.order.length < LOOP_ORDER.length) { d.order = [...d.order, c.dataset.id!]; sound.play('ui'); rerender() } }))
    $$('.slot[data-slot]', body).forEach(s => s.addEventListener('click', () => { d.order = d.order.filter((_, i) => i !== Number(s.dataset.slot)); rerender() }))
    $('#rs', body).addEventListener('click', () => { d.order = []; rerender() })
    $('#ok', body).addEventListener('click', () => {
      const r = loopCheck(d.order)
      if (!r.ok) { sound.play('fail'); fb(body, r.message, 'bad'); return }
      d.connected = true
      sound.play('telemetry')
      rerender()
    })
    return
  }

  const filterBlock = ran ? null : m.filterBlock()
  const fresh = ran ? m.waterLoop!.fresh : d.fresh && !filterBlock
  const brine = m.brineOn
  const pct = waterRecovery(fresh, brine), safe = waterSafe(fresh), won = safe && pct >= WATER_TARGET
  const brineLine = brine
    ? `Running: life support has ${powerPct(m.power.life)} of the station's power.`
    : `Off: it needs life support at ${powerPct(BRINE_LIFE_UNITS)} of the station's power (now ${powerPct(m.power.life)}). Change it at the Power Grid.`
  body.innerHTML = `<p class="lead">${ran ? 'The loop is running.' : 'Step 2 of 2. The loop is connected. Two things decide how much water comes back.'}</p>${chain}
    <div class="st-cols">
      <div class="st-choice"><h4>Filter bed</h4>
        ${ran ? `<p>${fresh ? `A fresh bed was fitted (${FILTER_COST} cr).` : 'The old bed was kept, and it clogged.'}</p>` : `<div class="seg-ctl">
          <button data-fresh="1" aria-pressed="${fresh}" ${filterBlock ? 'disabled' : ''}><b>Fit a fresh bed</b><small>${FILTER_COST} cr · safe water</small></button>
          <button data-fresh="0" aria-pressed="${!fresh}"><b>Keep the old one</b><small>free · it clogs: −${CLOG_LOSS}%, not safe</small></button></div>
          ${filterBlock ? `<p class="st-note bad">${esc(filterBlock)}</p>` : `<p class="st-note">${m.credits} cr left in the budget. The rover's rocket is still to pay.</p>`}`}</div>
      <div class="st-choice"><h4>Brine processor</h4><p class="${brine ? 'on' : 'off'}">${brineLine}</p>
        <p class="st-note">It recovers the water the distiller leaves behind: ${WATER_BASE_PCT}% without it, ${WATER_BRINE_PCT}% with it.</p></div>
    </div>
    <div class="st-cols">
      <div>${meter('Water recovered', `${pct}%`, pct, won ? 'good' : 'bad', WATER_TARGET)}</div>
      <div class="ledger"><span>Water quality</span><b class="${safe ? '' : 'over'}">${safe ? 'Safe to drink' : 'Not safe'}</b><span>Base score</span><b>+${waterBonus(fresh, brine)}</b></div>
    </div>
    <p class="st-real">${REAL}${WATER_BASE_PCT} to 94% before the brine processor and ${WATER_BRINE_PCT}% with it are the space station's own figures. The filter cost, the clog and the power the processor needs are our model.</p>
    <div class="feedback ${ran ? (won ? 'ok' : 'warn') : ''}">${ran
      ? won ? `Recovering ${pct}% of the crew's water, safe to drink: +${waterBonus(fresh, brine)} to the base score${brine ? '' : `. Give life support ${powerPct(BRINE_LIFE_UNITS)} of the power to reach ${WATER_BRINE_PCT}%`}.` : `The clogged bed let contaminants through: ${pct}% recovered and not safe to drink. Nothing is added to the base score.`
      : 'The loop runs once. The brine processor follows the Power Grid for the rest of the mission.'}</div>
    <div class="actions">${ran ? '<span class="donebadge">COMPLETE</span>' : '<button class="btn primary" id="run">Run the loop</button><button class="btn" id="back">Change the connections</button>'}</div>`
  $$('button[data-fresh]', body).forEach(b => b.addEventListener('click', () => { d.fresh = b.dataset.fresh === '1'; sound.play('ui'); rerender() }))
  $('#back', body)?.addEventListener('click', () => { d.connected = false; rerender() })
  $('#run', body)?.addEventListener('click', () => {
    const err = m.runWaterLoop(fresh)
    if (err) { sound.play('fail'); fb(body, err, 'bad'); return }
    sound.play(m.failed.has('water') ? 'fail' : 'success')
    ctx.refresh()
    rerender()
  })
}

// ---------------------------------------------------------------- Relay repair: tune the receiver
interface RelayDraft { tuning: RelayTuning; round: number; dial: number; moves: number }
const WAVE_W = 680, WAVE_H = 150

/** The received signal: a clean carrier, buried in more noise the farther the dial is from it. */
function drawWave(g: CanvasRenderingContext2D, phase: number, noise: number) {
  g.clearRect(0, 0, WAVE_W, WAVE_H)
  g.strokeStyle = 'rgba(63,208,255,.14)'
  g.lineWidth = 1
  g.beginPath()
  for (let x = 0; x <= WAVE_W; x += 40) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, WAVE_H) }
  for (let y = 15; y < WAVE_H; y += 30) { g.moveTo(0, y + 0.5); g.lineTo(WAVE_W, y + 0.5) }
  g.stroke()
  g.strokeStyle = `hsl(${Math.round(160 - 155 * noise)} 85% 62%)`
  g.shadowColor = g.strokeStyle
  g.shadowBlur = 8 * (1 - noise)
  g.lineWidth = 2
  g.beginPath()
  const amp = WAVE_H * 0.36
  for (let x = 0; x <= WAVE_W; x += 2) {
    const carrier = Math.sin((x / WAVE_W) * Math.PI * 2 * 7 + phase) * (1 - 0.8 * noise)
    const hiss = (Math.random() * 2 - 1) * noise * 1.15
    const y = WAVE_H / 2 - (carrier + hiss) * amp
    if (x === 0) g.moveTo(x, y); else g.lineTo(x, y)
  }
  g.stroke()
  g.shadowBlur = 0
}

export function relayTab(body: HTMLElement, _rerender: () => void, ctx: PanelCtx) {
  const m = ctx.m
  const done = m.completed.has('relay')
  const d = (m.drafts.relay ??= { tuning: newRelayTuning(m.rng), round: 0, dial: DIAL_START, moves: 0 }) as RelayDraft
  body.innerHTML = `<p class="lead">${done ? 'Relay restored. The receiver is holding the carrier from Mars.' : '<b style="color:#ff5a4a">EMERGENCY.</b> Payload power-up knocked the receiver off the carrier from Mars. Turn the dial until the signal is clean, and hold it there. The carrier may drift again before it settles.'}</p>
    <div class="sig ${done ? 'locked' : ''}"><canvas id="sig" width="${WAVE_W}" height="${WAVE_H}" role="img" aria-label="The received signal"></canvas>
      <div class="sig-read"><span>Signal quality</span><b id="sigq">${done ? '100%' : ''}</b></div><div class="sig-hold"><i id="sighold"></i></div></div>
    <div id="signoise">${meter('Noise', done ? '0%' : '', 0, 'good')}</div>
    <div class="slider"><label for="tune">Tuning</label><input type="range" id="tune" min="0" max="${DIAL_MAX}" step="1" value="${d.dial}" ${done ? 'disabled' : ''}/><span><b id="dialv">${d.dial}%</b></span></div>
    <div class="row" style="justify-content:flex-end;gap:6px"><button class="btn small" data-d="-1" ${done ? 'disabled' : ''}>Dial −1</button><button class="btn small" data-d="1" ${done ? 'disabled' : ''}>Dial +1</button></div>
    <div class="feedback ${done ? 'ok' : ''}">${done ? 'Carrier lock. The rover is reachable.' : d.round ? `Lock ${d.round} held, but the carrier drifted. Find it again.` : 'Sweep the dial and watch the noise fall.'}</div>
    <div class="actions">${done ? '<span class="donebadge">COMPLETE</span>' : '<span class="sim">Simulated signal · our model, not a real downlink</span>'}</div>`
  const canvas = $('#sig', body) as unknown as HTMLCanvasElement
  const g = canvas.getContext('2d')
  const dial = $("#tune", body) as HTMLInputElement
  const set = (v: number) => {
    const next = Math.max(0, Math.min(DIAL_MAX, Math.round(v)))
    if (next !== d.dial) d.moves++
    d.dial = next
    dial.value = String(next)
    $('#dialv', body).textContent = `${next}%`
  }
  dial.addEventListener('input', () => set(Number(dial.value)))
  $$('button[data-d]', body).forEach(b => b.addEventListener('click', () => { set(d.dial + Number(b.dataset.d)); dial.focus() }))

  let last = performance.now(), phase = 0, held = 0, shownQ = -1
  const frame = (now: number) => {
    if (!canvas.isConnected) return
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    phase += dt * 5
    const over = done || m.completed.has('relay')
    const target = over ? d.dial : d.tuning.targets[d.round]
    const noise = over ? 0 : relayNoise(d.dial, target)
    if (g) drawWave(g, phase, noise)
    if (!over) {
      const q = relayQuality(d.dial, target)
      if (q !== shownQ) {
        shownQ = q
        $('#sigq', body).textContent = `${q}%`
        $('#signoise', body).innerHTML = meter('Noise', `${100 - q}%`, 100 - q, q >= 90 ? 'good' : q >= 55 ? 'warn' : 'bad')
      }
      held = relayOnCarrier(d.dial, target) ? held + dt : 0
      $('#sighold', body).style.width = `${Math.min(100, (held / RELAY_HOLD_S) * 100)}%`
      if (held >= RELAY_HOLD_S) {
        held = 0
        d.round++
        if (d.round >= d.tuning.targets.length) {
          ctx.done('relay', `receiver tuned onto the carrier, which drifted ${d.tuning.targets.length} times before it held: uplink restored`)
          ctx.refresh()
          openPanel('comms', ctx, 'rover')
          return
        }
        sound.play('telemetry')
        fb(body, `Lock ${d.round} held, but the carrier drifted. Find it again.`, 'warn')
      }
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

// ---------------------------------------------------------------- Earth observation (Cupola)
export function earthTab(body: HTMLElement, rerender: () => void, ctx: PanelCtx) {
  const m = ctx.m
  const d = (m.drafts.earth ??= { at: 0 }) as { at: number }
  const n = EARTH_PHOTOS.length
  const p = EARTH_PHOTOS[d.at]
  ctx.done('earth', 'looked at Earth from the Cupola')
  m.seeEarth(p.id)
  body.innerHTML = `<p class="lead">Photographs of Earth taken by crews on the International Space Station, about 400 km up. This camera shows the real ones.</p>
    <figure class="eo"><img src="${file(p.file)}" alt="${esc(p.title)}: a photograph of Earth from the space station"/><span class="tag real">Real photo · NASA</span>
      <figcaption><h3>${esc(p.title)}</h3><p>${esc(p.caption)}</p>
        <small>Taken ${esc(p.taken)} · frame ${esc(p.id)} · Credit: ${esc(p.credit)} · <a href="${esc(p.page)}" target="_blank" rel="noopener noreferrer">NASA Image and Video Library</a></small></figcaption></figure>
    <div class="eo-strip">${EARTH_PHOTOS.map((x, i) => `<button class="eo-th ${m.earthSeen.includes(x.id) ? 'seen' : ''}" data-i="${i}" aria-pressed="${i === d.at}" aria-label="${esc(x.title)}" style="background-image:url(${file(x.file)})"></button>`).join('')}</div>
    <div class="actions"><button class="btn" id="prev">Previous</button><button class="btn primary" id="next">Next photo</button><span class="eo-count">${d.at + 1} of ${n} · ${m.earthSeen.length} viewed</span></div>`
  const go = (i: number) => { d.at = (i + n) % n; sound.play('shutter'); rerender() }
  $('#prev', body).addEventListener('click', () => go(d.at - 1))
  $('#next', body).addEventListener('click', () => go(d.at + 1))
  $$('.eo-th', body).forEach(b => b.addEventListener('click', () => go(Number(b.dataset.i))))
}
