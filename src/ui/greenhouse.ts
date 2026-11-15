// Greenhouse panels. The greenhouse is two short missions and one event, all played at
// Greenhouse Control; the bay screens, the Service Bay and the Seed Bank & Galley only show
// status. Every number shown is read from the rules in src/core/greenhouse.ts.
//
// The panels stay live while open: values are patched in place a few times a second, and a tab
// is redrawn only when its structure changes, so buttons and sliders do not move under the pointer.
import '../greenhouse.css'
import { CROPS, STAGES, STAGE_TEXT, crop, type CropId } from '../core/crops'
import {
  BAY_IDS, BAY_PLAN, GH, NEED_KCAL, SLIDERS, STEPS, fedDays, slider,
  type BayId, type Greenhouse, type LoopId, type SliderId, type SliderSpec, type Symptom,
} from '../core/greenhouse'
import { TERMINALS, bayOf, isBayTerminal } from '../game/deck'
import type { BayStatus, GreenhouseView } from '../game/greenhouseFx'
import { sound } from '../audio'
import { el, esc, toast } from './dom'
import type { PanelCtx, Tab } from './panels'

const sheet = (id: CropId) => `${import.meta.env.BASE_URL}assets/crop-${id}.svg`
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const pct = (f: number) => Math.round(clamp(f, 0, 1) * 100)
const num = (n: number) => Math.round(n).toLocaleString('en-US')
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ------------------------------------------------------------------ live tabs
type Vals = Record<string, string | number | boolean>
type Acts = Record<string, (d: DOMStringMap) => string | null | void>
interface LiveTab { key: () => string; html: () => string; vals: () => Vals; acts: Acts; input?: (d: DOMStringMap, value: number) => void }
let live: { body: HTMLElement; tab: LiveTab; lastKey: string } | null = null
let pointerDown = false
window.addEventListener('pointerdown', () => { pointerDown = true }, true)
for (const ev of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(ev, () => { pointerDown = false }, true)

/** data-v text, data-w width %, data-l left %, data-c status class, data-dis disabled. */
function patch() {
  if (!live) return
  const v = live.tab.vals()
  live.body.querySelectorAll<HTMLElement>('[data-v]').forEach(e => { const t = String(v[e.dataset.v!] ?? ''); if (e.textContent !== t) e.textContent = t })
  live.body.querySelectorAll<HTMLElement>('[data-w]').forEach(e => { e.style.width = `${v[e.dataset.w!] ?? 0}%` })
  live.body.querySelectorAll<HTMLElement>('[data-l]').forEach(e => { e.style.left = `${v[e.dataset.l!] ?? 0}%` })
  live.body.querySelectorAll<HTMLElement>('[data-c]').forEach(e => {
    const c = String(v[e.dataset.c!] ?? '')
    if (e.dataset.cls === c) return
    if (e.dataset.cls) e.classList.remove(...e.dataset.cls.split(' '))
    if (c) e.classList.add(...c.split(' '))
    e.dataset.cls = c
  })
  live.body.querySelectorAll<HTMLButtonElement>('[data-dis]').forEach(e => { e.disabled = !!v[e.dataset.dis!] })
}
function draw() {
  if (!live) return
  live.lastKey = live.tab.key()
  live.body.innerHTML = live.tab.html()
  patch()
}
function mount(body: HTMLElement, tab: LiveTab) {
  live = { body, tab, lastKey: '' }
  body.onclick = e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
    if (!b || !live || (b as HTMLButtonElement).disabled) return
    const err = live.tab.acts[b.dataset.act!]?.(b.dataset)
    if (err) { sound.play('fail'); toast(err, 'warn', 4200) } else sound.play('ui')
    draw()
  }
  body.oninput = e => {
    const t = e.target as HTMLInputElement
    if (!live || !t.dataset.s) return
    live.tab.input?.(t.dataset, Number(t.value))
    patch()
  }
  draw()
}
/** Brings an open greenhouse panel up to date. The app calls this a few times a second. */
export function refreshGreenhousePanel() {
  if (!live) return
  if (!live.body.isConnected) { live = null; return }
  if (live.tab.key() !== live.lastKey && !pointerDown) draw()
  else patch()
}

// ------------------------------------------------------------------ mission cards
// The pop-up text follows the team's mission spec, with the wording fitted to the station
// (greenhouse days, not sols).
interface MissionText { tag: string; title: string; line: string; checks: string[]; target: string; card: [string, string, string]; debrief: string }
const MISSION: Record<'g1' | 'g2', MissionText> = {
  g1: {
    tag: 'NEW MISSION', title: 'GROW LIGHT',
    line: "Set up the greenhouse. A simulation inspired by NASA's Advanced Plant Habitat.",
    checks: STEPS.map(s => s.label),
    target: `Keep plant health above ${GH.healthLine}% for ${GH.testDays} days within the power budget.`,
    card: ['Advanced Plant Habitat', "A closed-loop system with over 180 sensors, whose lights deliver roughly half the sun's output at Earth.", 'NASA Space Station research pages'],
    debrief: 'Controlled-environment agriculture: growing plants in a closed room means balancing several variables at once.',
  },
  g2: {
    tag: 'NEW MISSION', title: 'WHAT TO GROW',
    line: "Plan the first harvest. A simulation inspired by NASA's ISS plant experiments.",
    checks: ['Compare crops', `Pick ${GH.picks} crops`, `Feed the crew for ${GH.runDays} days`],
    target: "Meet the crew's calorie needs without running out of water.",
    card: ['Space-grown Crops', 'Chile peppers grew for 137 days in orbit, producing 26 fruit. A Dutch study found radishes and tomatoes grew in Mars simulants while spinach did not do well.', 'NASA OSDR and published study'],
    debrief: 'Food planning: balancing nutrition, time and resources.',
  },
}
const PUMP_DEBRIEF = 'Triage and trade-offs: with one spare part, something has to wait.'

const nasaCard = (m: MissionText) => `<div class="gh-card"><span>NASA card</span><b>${esc(m.card[0])}</b><p>${esc(m.card[1])}</p><small>Source: ${esc(m.card[2])}. The numbers in the game are our model.</small></div>`
/** `done[i]` ticks a checklist line; `live` names a data-c key prefix so the ticks follow the game. */
const checklist = (m: MissionText, done: boolean[] = [], liveKey = '') => `<ul class="gh-checks">${m.checks.map((c, i) => `<li class="${done[i] ? 'done' : ''}" ${liveKey ? `data-c="${liveKey}${i + 1}"` : ''}><i></i>${esc(c)}</li>`).join('')}</ul>`
const missionCard = (m: MissionText) => `<div class="gh-mission"><div class="gh-m-tag">${m.tag}</div><h3>${m.title}</h3><p>${esc(m.line)}</p>
  ${checklist(m)}<div class="gh-target"><span>Game target</span>${esc(m.target)}</div>${nasaCard(m)}</div>`

let brief: HTMLElement | null = null
/** The NEW MISSION pop-up, shown the first time the astronaut walks into the greenhouse. */
export function showGreenhouseBrief(onClose: () => void) {
  if (brief) return
  const root = el(`<div class="overlay gh-pop" role="dialog" aria-modal="true" aria-label="New mission: Grow Light"><div class="panel">
    <div class="panel-body">${missionCard(MISSION.g1)}
      <p class="gh-note">The greenhouse is optional and is scored on its own, 0 to 100. Each mission is played once: there is no retry. Start at the <b>Greenhouse Control</b> screen in this module.</p>
      <div class="actions"><button class="btn primary" id="gh-pop-ok">Got it</button></div></div></div></div>`)
  const close = () => { window.removeEventListener('keydown', onKey, true); root.remove(); brief = null; onClose() }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close() } }
  brief = root
  document.body.append(root)
  window.addEventListener('keydown', onKey, true)
  root.querySelector<HTMLButtonElement>('#gh-pop-ok')!.addEventListener('click', () => { sound.play('ui'); close() })
  setTimeout(() => root.querySelector<HTMLButtonElement>('#gh-pop-ok')?.focus(), 30)
}

// ------------------------------------------------------------------ shared pieces
const SYM_ROW: Record<Symptom, number> = { none: 0, wilt: 1, yellow: 2, spots: 3 }
const thumb = (id: CropId) => `<span class="gh-thumb" style="background-image:url(${sheet(id)})" role="img" aria-label="${esc(crop(id).name)}"></span>`
const sideCrops = (gh: Greenhouse, side: LoopId) => {
  const names = BAY_IDS.filter(b => BAY_PLAN[b].loop === side).map(b => gh.plan[b]).filter(Boolean).map(id => crop(id!).name.toLowerCase())
  const count = new Map<string, number>()
  for (const n of names) count.set(n, (count.get(n) ?? 0) + 1)
  return [...count].map(([n, k]) => `${k} ${n}`).join(', ') || 'nothing planted'
}

/** How a bay is doing, in one word, for the rack lamp. */
function bayStatus(b: { crop: CropId | null; ready: boolean; slow: boolean; symptom: Symptom }): BayStatus {
  if (!b.crop) return 'empty'
  if (b.ready) return 'ready'
  if (b.slow || b.symptom !== 'none') return 'warn'
  return 'growing'
}

/** The pump-failure choice. Shown at Greenhouse Control and at the Service Bay. */
function pumpCard(gh: Greenhouse) {
  const p = gh.run?.pump
  if (!p || p.state === 'none') return ''
  if (p.state === 'fixed') return `<div class="feedback warn">Pump failure handled: the spare part went to side ${p.saved}. Side ${p.saved === 'A' ? 'B' : 'A'} grows at half speed until day ${GH.runDays}.</div>`
  return `<div class="gh-alert"><div class="gh-m-tag">ALERT</div><h3>PUMP FAILURE</h3><p>Choose what to fix first. Both pumps have stopped and there is <b>one spare part</b>. The side you save grows on at full speed. The other side grows at half speed until day ${GH.runDays}.</p>
    <div class="actions"><button class="btn primary" data-act="pump" data-side="A">Save side A<small>${esc(sideCrops(gh, 'A'))}</small></button><button class="btn primary" data-act="pump" data-side="B">Save side B<small>${esc(sideCrops(gh, 'B'))}</small></button></div>
    <p class="gh-note">The 30 days are paused while you choose.</p></div>`
}
const pumpAct = (gh: Greenhouse): Acts => ({ pump: d => gh.choosePump(d.side as LoopId) })

// ------------------------------------------------------------------ G1: Grow Light
const pos = (s: SliderSpec, v: number) => clamp((v - s.min) / (s.max - s.min), 0, 1) * 100
const MAX_KW = GH.baseKw + GH.lightKw + GH.pumpKw

function controlRow(gh: Greenhouse, id: SliderId, locked: boolean) {
  const s = slider(id), lo = pos(s, s.good[0]), hi = pos(s, s.good[1])
  return `<div class="gh-ctl" data-c="cs-${id}"><label for="gs-${id}">${esc(s.label)}</label>
    <input type="range" id="gs-${id}" data-s="${id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${gh.settings[id]}" style="--lo:${lo}%;--hi:${hi}%" ${locked ? 'disabled' : ''} aria-describedby="gh-${id}"/>
    <b><span data-v="sv-${id}"></span> ${esc(s.unit)}</b>
    <div class="gh-sensor" title="Sensor reading against the good zone"><i class="good" style="left:${lo}%;width:${hi - lo}%"></i><i class="mark" data-l="rm-${id}"></i></div>
    <small id="gh-${id}"><span>Sensor <b data-v="rv-${id}"></b> · good ${s.good[0]} to ${s.good[1]}</span> <em data-v="rh-${id}"></em></small></div>`
}
function g1Html(gh: Greenhouse) {
  const setup = gh.phase === 'g1-setup'
  return `<div class="gh-head"><div><div class="gh-m-tag">MISSION G1</div><h3>GROW LIGHT</h3></div>${checklist(MISSION.g1, [], 'st-')}</div>
    <div class="gh-meters">
      <div class="gh-big" data-c="hc"><span>Plant health</span><b data-v="health"></b><div class="gbar lined" style="--line:${GH.healthLine}%"><i data-w="healthw"></i></div><small>must stay above ${GH.healthLine}%</small></div>
      <div class="gh-big" data-c="pc"><span>Power</span><b data-v="power"></b><div class="gbar lined" style="--line:${(GH.powerBudgetKw / MAX_KW) * 100}%"><i data-w="powerw"></i></div><small data-v="powernote"></small></div>
      <div class="gh-big"><span>Test</span><b data-v="day"></b><div class="gbar"><i data-w="dayw"></i></div><small data-v="daynote"></small></div>
    </div>
    ${STEPS.map(st => `<div class="gh-sec gh-step" data-c="sc-${st.n}"><h3>Step ${st.n}: ${esc(st.label)}</h3>${st.sliders.map(id => controlRow(gh, id, false)).join('')}</div>`).join('')}
    <div class="actions">${setup ? `<button class="btn primary" data-act="start" data-dis="nostart">Start the ${GH.testDays}-day test</button><span class="gh-miss" data-v="startnote" data-c="startc"></span>` : '<span class="gh-run">Test running. Keep every sensor in its green zone and the power under the line.</span>'}</div>
    <p class="gh-note">${setup ? `Move each control into its green zone to tick the three steps. More light costs more power. The test lasts ${GH.testSeconds} seconds and is run once: there is no retry.` : 'The plants change the room as they grow. When a sensor leaves its green zone, move that control until it comes back.'}</p>`
}
function g1Vals(gh: Greenhouse, v: Vals) {
  for (const s of SLIDERS) {
    const r = gh.reading(s.id), st = gh.status(s.id)
    v[`sv-${s.id}`] = gh.settings[s.id]
    v[`rv-${s.id}`] = `${Math.round(r)} ${s.unit}`
    v[`rm-${s.id}`] = pos(s, r)
    v[`cs-${s.id}`] = st === 'ok' ? 'ok' : 'bad'
    v[`rh-${s.id}`] = st === 'ok' ? 'In the green zone' : gh.hint(s.id) || `${cap(st === 'low' ? s.low : s.high)}: ${st === 'low' ? 'raise' : 'lower'} it.`
  }
  for (const st of STEPS) { const ok = gh.stepOk(st.n); v[`st-${st.n}`] = ok ? 'done' : ''; v[`sc-${st.n}`] = ok ? 'ok' : '' }
  const h = gh.health, kw = gh.powerKw, x = gh.test
  v.health = `${Math.round(h)}%`; v.healthw = h; v.hc = h < GH.healthLine ? 'bad' : h < 90 ? 'warn' : ''
  v.power = `${kw.toFixed(1)} kW`; v.powerw = (kw / MAX_KW) * 100; v.pc = gh.overBudget ? 'bad' : ''
  v.powernote = gh.overBudget ? (x ? `OVER BUDGET: lower the light. Breaker trips in ${Math.max(0, GH.overdrawSeconds - x.overdraw).toFixed(1)} s` : `Over the ${GH.powerBudgetKw} kW budget: lower the light`) : `budget ${GH.powerBudgetKw} kW`
  v.day = x ? `Day ${gh.testDay} of ${GH.testDays}` : 'Not started'
  v.dayw = x ? (x.t / GH.testSeconds) * 100 : 0
  v.daynote = x ? 'running' : `${GH.testDays} days in ${GH.testSeconds} seconds`
  const open = STEPS.find(st => !gh.stepOk(st.n))
  v.nostart = !!open
  v.startc = !open && !gh.overBudget ? 'ok' : ''
  v.startnote = open ? `Step ${open.n} is not in its green zone yet.` : gh.overBudget ? 'Warning: the power is over the budget.' : 'All three steps are set.'
}
function g1ResultHtml(gh: Greenhouse) {
  const r = gh.testResult!, part = gh.score().parts[0]
  return `<div class="gh-result ${r.won ? 'won' : 'lost'}"><div class="gh-m-tag">MISSION G1 · GROW LIGHT</div><h3>${r.won ? 'TEST PASSED' : 'TEST FAILED'}</h3><p>${esc(r.reason)}</p>
      <div class="gh-metrics"><div><span>Lowest plant health</span><b>${Math.round(r.minHealth)}%</b></div><div><span>Test ended</span><b>day ${r.day} of ${GH.testDays}</b></div><div><span>Points</span><b>${part.points} of ${part.max}</b></div></div></div>
    <div class="gh-debrief"><span>Debrief</span>${esc(MISSION.g1.debrief)}</div>${nasaCard(MISSION.g1)}
    <div class="actions"><button class="btn primary" data-act="next">Next mission: What to Grow</button></div>
    <p class="gh-note">${r.won ? '' : 'There is no retry for this test. '}The next mission does not depend on these settings.</p>`
}

// ------------------------------------------------------------------ G2: What to Grow
function cropTable(gh: Greenhouse, pickable: boolean) {
  return `<table class="gh-table"><thead><tr><th>Crop</th><th>Growth time</th><th>Calories per harvest</th><th>Water</th><th>Light</th>${pickable ? '<th></th>' : ''}</tr></thead><tbody>
    ${CROPS.map(c => {
      const on = gh.picks.includes(c.id), full = gh.picks.length >= GH.picks
      return `<tr class="${on ? 'on' : ''}"><td>${thumb(c.id)}<b>${esc(c.name)}</b><small>${esc(c.note)}</small></td><td>${c.growDays} days</td><td>${num(c.kcal)} kcal</td><td>${c.waterLPerDay} L a day</td><td>${c.light}</td>
        ${pickable ? `<td><button class="btn small ${on ? 'mint' : ''}" data-act="pick" data-c="${c.id}" ${!on && full ? 'disabled' : ''} aria-pressed="${on}">${on ? 'Picked' : 'Pick'}</button></td>` : ''}</tr>`
    }).join('')}</tbody></table>
    <p class="gh-note">Per bay. A crop grows again after each harvest, so a ${CROPS[0].growDays}-day crop can be harvested three times in ${GH.runDays} days and a ${CROPS[CROPS.length - 1].growDays}-day crop once.</p>`
}
function forecastHtml(gh: Greenhouse) {
  if (!gh.planted) return `<div class="feedback">Plant a bay to see the forecast.</div>`
  const f = gh.forecast(), top = Math.max(NEED_KCAL * 1.5, f.kcalHarvested)
  const foodOk = f.kcalHarvested >= NEED_KCAL, waterOk = f.cause !== 'water'
  return `<div class="gh-chart" role="img" aria-label="Forecast of calories harvested by day">
      ${f.curve.map((k, i) => `<i class="${k >= NEED_KCAL ? 'ok' : ''} ${!waterOk && i + 1 > f.day ? 'dry' : ''}" style="height:${(k / top) * 100}%" title="Day ${i + 1}: ${num(k)} kcal"></i>`).join('')}
      <span class="need" style="bottom:${(NEED_KCAL / top) * 100}%">crew needs ${num(NEED_KCAL)} kcal</span></div>
    <div class="gh-axis"><span>day 1</span><span>day 10</span><span>day 20</span><span>day ${GH.runDays}</span></div>
    <div class="gh-metrics">
      <div class="${foodOk ? 'ok' : 'bad'}"><span>Food</span><b>${num(f.kcalHarvested)} kcal</b><small>${foodOk ? `Enough: ${num(f.kcalHarvested - NEED_KCAL)} kcal to spare` : `Too little: feeds the crew for ${f.fedDays} of ${GH.runDays} days`}</small></div>
      <div class="${waterOk ? 'ok' : 'bad'}"><span>Water</span><b>${waterOk ? `${num(f.waterL)} L left` : `dry on day ${f.day}`}</b><small>of ${num(gh.tankStartL)} L in the tank</small></div>
      <div class="${f.won ? 'ok' : 'bad'}"><span>Forecast</span><b>${f.won ? 'CREW FED' : 'PLAN FAILS'}</b><small>${f.won ? 'if nothing goes wrong' : 'change the crops or the bays'}</small></div></div>
    <p class="gh-note">The forecast assumes you press Harvest all soon after a bay is ready, and that nothing breaks. Keep some food to spare.</p>`
}
function bayPicker(gh: Greenhouse) {
  const row = (side: LoopId) => `<div class="gh-side"><span>Side ${side}</span>${BAY_IDS.filter(b => BAY_PLAN[b].loop === side).map(b => {
    const c = gh.plan[b]
    return `<button class="ghb ${c ? 'planted' : ''}" data-act="bay" data-b="${b}" aria-label="Bay ${b}: ${c ? crop(c).name : 'empty'}. Click to change."><b>${b}</b>${c ? `${thumb(c)}<span>${esc(crop(c).name)}</span>` : '<span class="none">Empty</span>'}</button>`
  }).join('')}</div>`
  return `<div class="gh-bays">${row('A')}${row('B')}</div>
    <p class="gh-note">Click a bay to change its crop: empty, then each crop you picked. Each side has its own water pump.</p>`
}
function g2PlanHtml(gh: Greenhouse) {
  const picked = gh.picks.length >= GH.picks
  return `<div class="gh-head"><div><div class="gh-m-tag">MISSION G2</div><h3>WHAT TO GROW</h3></div>${checklist(MISSION.g2, [true, picked, false])}</div>
    <div class="gh-sec"><h3>1. Compare crops and pick ${GH.picks} <small>${gh.picks.length} of ${GH.picks} picked</small></h3>${cropTable(gh, true)}</div>
    <div class="gh-sec"><h3>2. Plant the 8 bays <small>${gh.planted} of 8 planted</small></h3>${picked || gh.picks.length ? bayPicker(gh) : `<div class="feedback">Pick ${GH.picks} crops in the table first.</div>`}</div>
    <div class="gh-sec"><h3>3. Check the forecast <small>calories harvested by day, against what the crew needs</small></h3>${forecastHtml(gh)}</div>
    <div class="actions"><button class="btn primary" data-act="run" ${picked && gh.planted ? '' : 'disabled'}>Start the ${GH.runDays} days</button>
      <span class="gh-miss">${!picked ? `Pick ${GH.picks} crops first.` : !gh.planted ? 'Plant at least one bay.' : gh.forecast().won ? '' : 'Warning: the forecast says this plan fails, and there is no retry.'}</span></div>
    <p class="gh-note">The run lasts ${GH.runSeconds} seconds. Press <b>Harvest all</b> whenever bays are ready. The crew needs ${num(GH.crewKcalPerDay)} kcal a day, ${num(NEED_KCAL)} kcal in all${gh.tankStartL > GH.tankL ? `. The repaired water purifier adds ${GH.purifierBonusL} L to the tank` : ''}.</p>`
}
function g2RunHtml(gh: Greenhouse) {
  const r = gh.run!
  const row = (side: LoopId) => `<div class="gh-side"><span data-v="side-${side}"></span>${r.bays.filter(b => b.loop === side).map(b => `<div class="ghb run" data-c="bc-${b.id}"><b>${b.id}</b>${b.crop ? `${thumb(b.crop)}<span>${esc(crop(b.crop).name)}</span><div class="gbar"><i data-w="bw-${b.id}"></i></div><small data-v="bt-${b.id}"></small>` : '<span class="none">Empty</span>'}</div>`).join('')}</div>`
  return `<div class="gh-head"><div><div class="gh-m-tag">MISSION G2 · WHAT TO GROW</div><h3 data-v="day"></h3></div><div class="gbar gh-daybar"><i data-w="dayw"></i></div></div>
    ${pumpCard(gh)}
    <div class="gh-meters two">
      <div class="gh-big" data-c="fc"><span>Food harvested</span><b data-v="food"></b><div class="gbar lined" style="--line:${(1 / 1.5) * 100}%"><i data-w="foodw"></i></div><small data-v="foodnote"></small></div>
      <div class="gh-big" data-c="wc"><span>Water tank</span><b data-v="water"></b><div class="gbar water"><i data-w="waterw"></i></div><small>the run fails if it runs dry</small></div>
    </div>
    <div class="gh-bays">${row('A')}${row('B')}</div>
    <div class="actions"><button class="btn primary gh-harvest" data-act="harvest" data-dis="noharvest" data-c="hvc"><span data-v="harvest"></span></button></div>`
}
function g2RunVals(gh: Greenhouse, v: Vals) {
  const r = gh.run!, ready = gh.readyBays
  v.day = `Day ${gh.runDay} of ${GH.runDays}`; v.dayw = (r.t / GH.runSeconds) * 100
  v.food = `${num(r.kcalHarvested)} kcal`; v.foodw = (r.kcalHarvested / (NEED_KCAL * 1.5)) * 100
  v.fc = r.kcalHarvested >= NEED_KCAL ? 'ok' : ''
  v.foodnote = r.kcalHarvested >= NEED_KCAL ? `the crew's ${num(NEED_KCAL)} kcal are in` : `${num(NEED_KCAL - r.kcalHarvested)} kcal still needed`
  v.water = `${num(r.waterL)} L`; v.waterw = (r.waterL / r.tankL) * 100; v.wc = r.waterL < r.tankL * 0.15 ? 'bad' : ''
  for (const side of ['A', 'B'] as const) v[`side-${side}`] = `Side ${side}${r.pump.state === 'pending' ? ' · pump stopped' : r.pump.state === 'fixed' ? (r.pump.saved === side ? ' · pump repaired' : ' · half speed') : ''}`
  for (const b of r.bays) {
    v[`bw-${b.id}`] = b.progress * 100
    v[`bt-${b.id}`] = b.ready ? 'READY' : b.speed < 1 ? 'Growing slowly' : 'Growing'
    v[`bc-${b.id}`] = b.ready ? 'ready' : b.crop && b.speed < 1 ? 'slow' : ''
  }
  v.noharvest = !ready || gh.pumpPending
  v.harvest = gh.pumpPending ? 'Paused: choose a pump' : ready ? `Harvest all · ${plural(ready, 'bay')} ready` : 'Harvest all · nothing ready yet'
  v.hvc = ready && !gh.pumpPending ? 'go' : ''
}
function g2ResultHtml(gh: Greenhouse) {
  const r = gh.runResult!, s = gh.score()
  const by = CROPS.map(c => ({ c, hs: r.harvests.filter(h => h.crop === c.id) })).filter(x => x.hs.length)
  return `<div class="gh-result ${r.won ? 'won' : 'lost'}"><div class="gh-m-tag">MISSION G2 · WHAT TO GROW</div><h3>${r.won ? 'CREW FED' : 'MISSION FAILED'}</h3><p>${esc(r.reason)}</p>
      <div class="gh-metrics"><div><span>Food harvested</span><b>${num(r.kcalHarvested)} kcal</b><small>the crew needed ${num(NEED_KCAL)}: fed for ${r.fedDays} of ${GH.runDays} days</small></div>
        <div><span>Water left</span><b>${num(r.waterL)} L</b><small>of ${num(r.tankL)} L</small></div>
        <div><span>Points</span><b>${s.parts[1].points} of ${s.parts[1].max}</b><small>pump failure: ${s.parts[2].points} of ${s.parts[2].max}</small></div></div>
      ${by.length ? `<ul class="gh-list">${by.map(x => `<li><b>${esc(x.c.name)}</b>: ${num(x.hs.reduce((a, h) => a + h.kcal, 0))} kcal from ${plural(x.hs.reduce((a, h) => a + h.bays, 0), 'bay harvest')} (day ${x.hs.map(h => h.day).join(', ')})</li>`).join('')}</ul>` : '<p>Nothing was harvested.</p>'}
      ${r.pump ? `<p>Pump failure: the spare part went to side ${r.pump}, and side ${r.pump === 'A' ? 'B' : 'A'} grew at half speed. ${esc(PUMP_DEBRIEF)}</p>` : ''}</div>
    <div class="gh-debrief"><span>Debrief</span>${esc(MISSION.g2.debrief)}</div>${nasaCard(MISSION.g2)}
    <div class="actions"><button class="btn primary" data-act="next">See the greenhouse score</button></div>`
}
function scoreHtml(gh: Greenhouse) {
  const s = gh.score()
  return `<div class="gh-sec"><h3>Greenhouse score <small>its own line, beside the base score</small></h3>
      <div class="gh-score"><b>${s.total}</b><span>/ 100</span></div>
      <div class="gh-parts">${s.parts.map(p => `<div class="gh-part"><span>${esc(p.label)}</span><div class="gbar"><i style="width:${pct(p.points / p.max)}%"></i></div><b>${p.points} / ${p.max}</b><small>${esc(p.why)}</small></div>`).join('')}</div></div>`
}
const doneHtml = (gh: Greenhouse) => `${scoreHtml(gh)}
  <div class="feedback ${gh.complete ? 'ok' : 'warn'}">The greenhouse is finished. Both missions are played once, so this score is final. The bays keep the last crops.</div>
  <div class="gh-debrief"><span>Debrief</span>${esc(MISSION.g1.debrief)} ${esc(MISSION.g2.debrief)}</div>`

// ------------------------------------------------------------------ Greenhouse Control
function controlTab(gh: Greenhouse): LiveTab {
  return {
    key: () => {
      const p = gh.phase
      return p === 'g2-plan' ? `plan|${gh.picks.join(',')}|${BAY_IDS.map(b => gh.plan[b] ?? '-').join(',')}|${gh.tankStartL}` : p === 'g2-run' ? `run|${gh.run!.pump.state}` : p
    },
    html: () => {
      switch (gh.phase) {
        case 'g1-setup': case 'g1-test': return g1Html(gh)
        case 'g1-result': return g1ResultHtml(gh)
        case 'g2-brief': return `${missionCard(MISSION.g2)}<div class="actions"><button class="btn primary" data-act="next">Compare crops</button></div><p class="gh-note">This mission is played once: there is no retry. You can check a forecast before the run starts.</p>`
        case 'g2-plan': return g2PlanHtml(gh)
        case 'g2-run': return g2RunHtml(gh)
        case 'g2-result': return g2ResultHtml(gh)
        default: return doneHtml(gh)
      }
    },
    vals: () => {
      const v: Vals = {}
      if (gh.phase === 'g1-setup' || gh.phase === 'g1-test') g1Vals(gh, v)
      else if (gh.phase === 'g2-run') g2RunVals(gh, v)
      return v
    },
    acts: {
      ...pumpAct(gh),
      start: () => gh.startTest(),
      next: () => gh.next(),
      pick: d => gh.togglePick(d.c as CropId),
      bay: d => gh.cycle(d.b as BayId),
      run: () => gh.startRun(),
      harvest: () => { const err = gh.harvestAll(); if (!err) sound.play('success'); return err },
    },
    input: (d, value) => { gh.setSlider(d.s as SliderId, value) },
  }
}

function sourcesTab(): LiveTab {
  const row = (kind: 'real' | 'model', title: string, text: string) => `<div class="src ${kind}"><div><b>${title}</b><span>${text}</span></div><em>${kind === 'real' ? 'NASA research' : 'Our game model'}</em></div>`
  return {
    key: () => 'src',
    html: () => `<p class="lead">The greenhouse is a game module. NASA's plant research decides what is in it; every number is ours.</p><div class="srcs">
      ${row('real', 'Plant chambers on the station', "NASA grows plants on the ISS in the Veggie units and in the Advanced Plant Habitat, a closed chamber with more than 180 sensors that controls light, temperature, humidity, CO2, water and nutrients.")}
      ${row('real', 'Crops grown in space', 'Lettuce, radish, mizuna mustard, kale, chile peppers and dwarf tomatoes have all been grown on the ISS. The chile peppers grew for 137 days.')}
      ${row('model', 'The six controls', `The good zones, how fast plant health falls and recovers, the ${GH.powerBudgetKw} kW power budget and what each control draws.`)}
      ${row('model', 'Days and seconds', `A greenhouse day is a game unit: the ${GH.testDays}-day test and the ${GH.runDays}-day run each last ${GH.runSeconds} seconds. They do not move the mission clock.`)}
      ${row('model', 'Crops, calories and water', `Days to harvest, calories per harvest, water per day, the crew's ${num(GH.crewKcalPerDay)} kcal a day and the ${num(GH.tankL)} L tank are balancing numbers, not NASA yields.`)}
      ${row('model', 'The pump failure and the score', 'How often the pumps fail, what the spare part does and the 40 + 50 + 10 points are game rules.')}
    </div>`,
    vals: () => ({}),
    acts: {},
  }
}

// ------------------------------------------------------------------ status screens
const S = 2 // inspection view scale
const spriteStyle = (id: CropId, col: number, row: number) => `background-image:url(${sheet(id)});background-size:${576 * S}px ${480 * S}px;background-position:${-col * 72 * S}px ${-row * 120 * S}px;width:${72 * S}px;height:${120 * S}px`
const WHERE = 'Planting and harvesting are done at the Greenhouse Control screen.'

function bayTab(gh: Greenhouse, id: BayId): LiveTab {
  const view = () => gh.bayViews().find(b => b.id === id)!
  return {
    key: () => { const b = view(); return `bay|${id}|${gh.phase}|${b.crop}|${b.stage}|${b.symptom}|${b.slow}` },
    html: () => {
      const b = view(), side = BAY_PLAN[id].loop
      if (!b.crop) return `<div class="feedback">Bay ${id} is empty. ${gh.phase.startsWith('g1') ? 'The test trays stand in bays A1 and A2.' : ''} ${WHERE}</div>`
      const c = crop(b.crop), test = gh.phase.startsWith('g1')
      return `<div class="gh-bay"><div class="gh-insp"><div class="gh-sprite" style="${spriteStyle(b.crop, STAGES.indexOf(b.stage), b.stage === 'seed' ? 0 : SYM_ROW[b.symptom])}" role="img" aria-label="${esc(c.name)}, ${STAGE_TEXT[b.stage].toLowerCase()}"></div></div>
        <div class="gh-info"><h3>${esc(c.name)} <small>${test ? 'test tray for mission G1' : `side ${side}`}</small></h3>
          <div class="kv"><span>Stage</span><b data-v="stage"></b><span>Status</span><b data-v="status"></b>${test ? '' : `<span>Growth time</span><b>${c.growDays} days</b><span>Each harvest</span><b>${num(c.kcal)} kcal</b><span>Water</span><b>${c.waterLPerDay} L a day</b>`}</div>
          <div class="gh-meter"><span>${test ? 'Test' : 'To harvest'}</span><div class="gbar"><i data-w="prog"></i></div></div>
          <p class="gh-note">${WHERE}</p></div></div>`
    },
    vals: () => {
      const b = view(), v: Vals = {}
      v.stage = STAGE_TEXT[b.stage]
      v.status = gh.phase.startsWith('g1') ? `Plant health ${Math.round(gh.health)}%` : b.ready ? 'Ready: press Harvest all at Greenhouse Control' : b.slow ? 'Growing at half speed: this side lost its pump' : gh.run ? 'Growing' : 'Planned: grows when the run starts'
      v.prog = b.progress * 100
      return v
    },
    acts: {},
  }
}

function serviceTab(gh: Greenhouse): LiveTab {
  const pumpState = (side: LoopId) => {
    const p = gh.run?.pump
    if (!p || p.state === 'none') return ['RUNNING', '']
    if (p.state === 'pending') return ['STOPPED', 'bad']
    return p.saved === side ? ['REPAIRED', 'ok'] : ['HALF SPEED', 'warn']
  }
  return {
    key: () => `svc|${gh.phase}|${gh.run?.pump.state ?? ''}`,
    html: () => `${pumpCard(gh)}
      <div class="gh-sec"><h3>Pumps <small>one pump feeds the four bays of a side</small></h3>
        <div class="gh-metrics"><div data-c="pa"><span>Pump A · bays A1 to A4</span><b data-v="pumpA"></b></div><div data-c="pb"><span>Pump B · bays B1 to B4</span><b data-v="pumpB"></b></div>
          <div><span>Spare parts</span><b>${gh.run?.pump.state === 'fixed' ? '0' : '1'}</b><small>${gh.run?.pump.state === 'fixed' ? 'the spare pump part has been fitted' : 'one spare pump part aboard'}</small></div></div></div>
      <div class="gh-sec"><h3>Water tank</h3><div class="gh-big" data-c="wc"><b data-v="water"></b><div class="gbar water"><i data-w="waterw"></i></div><small>The crops drink from it during the ${GH.runDays}-day run.</small></div></div>
      <p class="gh-note">A pump can fail during the ${GH.runDays}-day run. If it does, the choice of which side to save appears here and at Greenhouse Control.</p>`,
    vals: () => {
      const v: Vals = {}, r = gh.run ?? gh.runResult
      const [a, ac] = pumpState('A'), [b, bc] = pumpState('B')
      v.pumpA = a; v.pa = ac; v.pumpB = b; v.pb = bc
      const tank = r?.tankL ?? gh.tankStartL, left = r?.waterL ?? tank
      v.water = `${num(left)} of ${num(tank)} L`; v.waterw = (left / tank) * 100; v.wc = left < tank * 0.15 ? 'bad' : ''
      return v
    },
    acts: pumpAct(gh),
  }
}

function galleyTab(gh: Greenhouse): LiveTab {
  return {
    key: () => `gal|${gh.phase}|${gh.picks.join(',')}`,
    html: () => `<div class="gh-sec"><h3>Food harvested <small>the crew needs ${num(NEED_KCAL)} kcal for ${GH.runDays} days</small></h3>
        <div class="gh-big" data-c="fc"><b data-v="food"></b><div class="gbar lined" style="--line:${(1 / 1.5) * 100}%"><i data-w="foodw"></i></div><small data-v="foodnote"></small></div>
        <ul class="gh-list" data-v="list"></ul></div>
      <div class="gh-sec"><h3>The six crops <small>all six have been grown on the ISS; the numbers are our model</small></h3>${cropTable(gh, false)}</div>
      <p class="gh-note">${WHERE}</p>`,
    vals: () => {
      const v: Vals = {}, kcal = gh.run?.kcalHarvested ?? 0, hs = gh.run?.harvests ?? []
      v.food = `${num(kcal)} kcal`; v.foodw = (kcal / (NEED_KCAL * 1.5)) * 100; v.fc = kcal >= NEED_KCAL ? 'ok' : ''
      v.foodnote = !gh.run ? 'Nothing yet: the feeding run has not started.' : `feeds the crew for ${fedDays(kcal)} of ${GH.runDays} days`
      v.list = CROPS.map(c => ({ c, k: hs.filter(h => h.crop === c.id).reduce((a, h) => a + h.kcal, 0) })).filter(x => x.k).map(x => `${x.c.name}: ${num(x.k)} kcal`).join(' · ')
      return v
    },
    acts: {},
  }
}

// ------------------------------------------------------------------ what the panels and the app ask for
const tab = (id: string, label: string, make: () => LiveTab): Tab => ({ id, label, render: body => mount(body, make()) })
export const isGreenhouseTerminal = (id: string) => id.startsWith('gh-') || isBayTerminal(id)

/** Title and place line for a greenhouse terminal's panel. */
export function greenhouseMeta(id: string): [string, string] {
  if (isBayTerminal(id)) { const b = bayOf(id), plan = BAY_PLAN[b]; return [`Bay ${b}`, `Greenhouse · Side ${plan.loop} · ${plan.kind === 'tier' ? 'Leaf rack' : 'Trellis bay'}`] }
  const name = TERMINALS.find(t => t.id === id)?.name ?? 'Greenhouse'
  return [name, id === 'gh-control' ? 'Greenhouse · Missions' : id === 'gh-service' ? 'Greenhouse · Pumps and water' : 'Greenhouse · Food harvested']
}

/** The tabs behind each greenhouse terminal. */
export function greenhouseTabs(id: string, ctx: PanelCtx): Tab[] {
  const gh = ctx.m.greenhouse
  if (isBayTerminal(id)) { const b = bayOf(id); return [tab('bay', `Bay ${b}`, () => bayTab(gh, b))] }
  if (id === 'gh-service') return [tab('pumps', 'Pumps & water', () => serviceTab(gh))]
  if (id === 'gh-prep') return [tab('food', 'Food harvested', () => galleyTab(gh))]
  return [tab('missions', 'Missions', () => controlTab(gh)), tab('sources', 'Real & model', () => sourcesTab())]
}

/** Greenhouse state in the shape the deck draws: plants, lights, lamps, array wings. */
export function greenhouseView(gh: Greenhouse): GreenhouseView {
  const r = gh.run, pump = r?.pump, testing = gh.phase === 'g1-setup' || gh.phase === 'g1-test'
  const flow = (side: LoopId) => !pump || pump.state === 'none' ? 1 : pump.state === 'pending' ? 0 : pump.saved === side ? 1 : GH.slowSpeed
  const s = gh.score()
  const screen: [string, string] =
    gh.phase === 'g1-setup' ? ['GROW LIGHT', `SET UP · ${STEPS.filter(st => gh.stepOk(st.n)).length} OF 3 STEPS`]
    : gh.phase === 'g1-test' ? [`TEST DAY ${gh.testDay}/${GH.testDays}`, `PLANT HEALTH ${Math.round(gh.health)}%`]
    : gh.phase === 'g1-result' ? [gh.testResult!.won ? 'TEST PASSED' : 'TEST FAILED', 'NEXT: WHAT TO GROW']
    : gh.phase === 'g2-brief' || gh.phase === 'g2-plan' ? ['WHAT TO GROW', `${gh.planted} OF 8 BAYS PLANTED`]
    : gh.phase === 'g2-run' ? [`DAY ${gh.runDay}/${GH.runDays}`, gh.pumpPending ? 'PUMP FAILURE' : `${gh.readyBays} READY · ${num(r!.kcalHarvested)} KCAL`]
    : [`SCORE ${s.total}/100`, gh.finished ? 'GREENHOUSE FINISHED' : gh.runResult!.won ? 'CREW FED' : 'MISSION FAILED']
  return {
    bays: gh.bayViews().map(b => ({ id: b.id, status: bayStatus(b), crop: b.crop, stage: b.stage, symptom: b.symptom, progress: b.progress, lit: !b.crop ? 0 : testing ? clamp(gh.settings.light / 100, 0.15, 1) : 1, tier: 1 })),
    alarm: gh.pumpPending ? 'damage' : gh.phase === 'g1-test' && (gh.health < 90 || gh.overBudget) ? 'warning' : null,
    arrayState: 'tracking',
    sunlit: gh.sunlit,
    flow: { A: flow('A'), B: flow('B') },
    airflow: true,
    condensation: testing && gh.status('humidity') === 'high',
    batteryPct: clamp(100 * (1 - gh.powerKw / GH.powerBudgetKw), 0, 100),
    tankPct: r ? (r.waterL / r.tankL) * 100 : 100,
    screen,
    radiation: false,
  }
}

/** One line for the HUD chip, and how loud it should be. */
export function greenhouseChip(gh: Greenhouse): { text: string; cls: '' | 'ok' | 'warn' | 'bad' } {
  switch (gh.phase) {
    case 'g1-setup': return { text: 'Greenhouse · optional · not started', cls: '' }
    case 'g1-test': return { text: `Greenhouse · test day ${gh.testDay} of ${GH.testDays} · plant health ${Math.round(gh.health)}%`, cls: gh.health < 90 || gh.overBudget ? 'warn' : 'ok' }
    case 'g1-result': case 'g2-brief': case 'g2-plan': return { text: `Greenhouse · Grow Light ${gh.testResult!.won ? 'passed' : 'failed'} · next: What to Grow`, cls: gh.testResult!.won ? 'ok' : 'warn' }
    case 'g2-run': return gh.pumpPending ? { text: 'Greenhouse · PUMP FAILURE · choose a side', cls: 'bad' } : { text: `Greenhouse · day ${gh.runDay} of ${GH.runDays} · ${gh.readyBays} ready`, cls: gh.readyBays ? 'warn' : 'ok' }
    default: return { text: `Greenhouse · finished · score ${gh.score().total}/100`, cls: gh.score().total >= 50 ? 'ok' : 'warn' }
  }
}

/** For the task drawer: how far the optional greenhouse task has got. */
export function greenhouseProgress(gh: Greenhouse): string {
  const t = gh.testResult, r = gh.runResult
  if (!gh.attempted) return 'not started'
  if (!t) return 'Grow Light test running'
  const g1 = `Grow Light ${t.won ? 'passed' : 'failed'}`
  if (!r) return `${g1} · What to Grow ${gh.phase === 'g2-run' ? 'running' : 'not played yet'}`
  return `${g1} · What to Grow ${r.won ? 'won' : 'failed'} · score ${gh.score().total}/100`
}
