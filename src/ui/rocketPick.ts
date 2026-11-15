// Choosing the rocket that carries the rover to Mars. It comes straight after choosing the rover,
// on the same floodlit pad as the crew launch (launchScene.ts) and under the same glass panels
// (src/field.css), so the two launches look like one mission.
//
//   1. Pick: three rockets stand on the pad in turn. Two can be bought; the third explains why not.
//   2. Launch: a short countdown and climb. The dice were rolled when the pilot pressed Launch.
//   3. Result: the rover is on Mars, or the launch failed and a backup flew at the cost of Mars days.
//
// What is real: which rocket flew which rover, what NASA paid, the mass of the spacecraft
// (src/data/roverTasks.ts). Not NASA: SpaceX's figure for what a Falcon 9 can send to Mars.
// Our model: the price in credits, the success rate, and what a failure costs (src/core/delivery.ts).
import '../field.css'
import '../tasks.css'
import { BACKUP_SOLS, DELIVERY_ROCKETS, deliveryRocket, failureStory, marginKg, rocketRefusal, spacecraftKg, type DeliveryId, type DeliveryRocket } from '../core/delivery'
import type { Mission } from '../core/mission'
import { USD_MILLIONS_PER_CREDIT } from '../data/launchVehicles'
import { formatDate } from '../data/opsDates'
import { FALCON_MARS, ROVER_TASK_DATA, SPACECRAFT, roverRocketFacts, taskSources, type TaskQuote } from '../data/roverTasks'
import { sound } from '../audio'
import { $, $$, el, esc, isTouch, reducedMotion } from './dom'
import { launchScene, type SceneState } from './launchScene'

export interface RocketPickCtx {
  m: Mission
  /** The rover is on Mars (or its backup is): carry on to the map. */
  done: () => void
  back: () => void
}

const REAL = '<span class="tag real">NASA data</span>'
const MODEL = '<span class="tag model">Our model</span>'
const HELP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.4-2.8 4.2"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/></svg>'
const COUNT_FROM = 3
const CLIMB_S = 7.5
const kg = (n: number) => n.toLocaleString('en-US')
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const smooth = (a: number, b: number, t: number) => { const u = clamp01((t - a) / (b - a)); return u * u * (3 - 2 * u) }

export function rocketPick(ctx: RocketPickCtx): { el: HTMLElement; stop(): void } {
  const m = ctx.m, rv = m.rover!
  const still = reducedMotion()
  const scene = launchScene()
  const s = el(`<section class="lfield rpick lf-ready ${scene ? '' : 'lf-flat'}" aria-label="Choose the rocket for ${esc(rv.name)}">
    <div class="lf-scene" id="scene" aria-hidden="true"></div>
    <div class="lf-grade" aria-hidden="true"></div><div class="holo-frame"></div>
    <div class="topbar lf-top"><button class="btn ghost small" id="back">← Station</button><span class="step">Rover delivery · launch pad</span>
      <span class="lf-chips"><span class="lf-role" id="funds"></span></span></div>
    <div class="lf-tabs" role="tablist"><button data-tab="rocket" role="tab">1 · Rocket</button><button data-tab="check" role="tab">2 · Launch</button></div>
    <div class="lf-design" id="design" data-tab="rocket">
      <div class="lf-col lf-left"><div class="lf-panel lf-rocket" id="rocketPanel"></div></div>
      <div class="lf-col lf-right"><div class="lf-panel lf-check" id="checkPanel"></div></div>
    </div>
    <div class="lf-count" id="count" role="timer" aria-live="off"><small id="countk"></small><b id="countn"></b><span id="countt"></span></div>
    <button class="btn small rp-skip hidden" id="skip">Skip ⏭</button>
    <div class="lf-result hidden" id="result" role="alertdialog" aria-live="assertive"></div>
    <div class="lf-veil" id="veil"></div>
    <div class="lf-foot">${REAL}<span>Which rocket flew which rover, what NASA paid and the spacecraft's mass come from NASA pages, retrieved ${formatDate(ROVER_TASK_DATA.retrieved)}. Success rates and credits are our model. The scene is our own artist's impression.</span></div>
  </section>`)
  if (scene) $('#scene', s).append(scene.canvas)
  const rocketPanel = $('#rocketPanel', s), checkPanel = $('#checkPanel', s), result = $('#result', s), veil = $('#veil', s), design = $('#design', s)

  // Start on the rocket that really flew this rover.
  let index = 0
  let phase: 'pick' | 'count' | 'climb' | 'result' | 'over' = 'pick'
  let helpOpen = false
  let swap: { at: number; to: number; done: boolean } | null = null
  let dim = 0, chase = 0, raf = 0, t0 = 0, lastNow = performance.now(), lastTick = COUNT_FROM + 1, ignited = false, liftSaid = false
  const born = performance.now()
  const ptr: [number, number] = [0, 0], ptrGoal: [number, number] = [0, 0]
  const current = () => DELIVERY_ROCKETS[index]
  const narrow = () => window.matchMedia('(max-width: 900px), (max-aspect-ratio: 1/1)').matches

  // ------------------------------------------------------------------ panels
  const refs = (k: DeliveryRocket) => {
    const f = roverRocketFacts(k.facts)
    const all = taskSources([...f.brief, ...f.numbers, ...(f.cost ? [f.cost] : [])])
    const num = (fact: { backing: TaskQuote[] }) => {
      const n = [...new Set(fact.backing.map(b => all.findIndex(x => x.url === b.source.url) + 1))].sort((a, b) => a - b)
      return n.length ? `<sup class="lf-ref">${n.join(' ')}</sup>` : ''
    }
    return { f, all, num }
  }

  function rocketHtml(k: DeliveryRocket): string {
    const { f, all, num } = refs(k)
    const host = (url: string) => new URL(url).hostname.replace(/^www\./, '')
    const flown = k.id === 'atlas541' ? '2' : '0'
    return `<div class="lf-k"><span>1 · Rocket for ${esc(rv.name)}</span><em>${index + 1} / ${DELIVERY_ROCKETS.length}</em></div>
      <div class="lf-title"><h2>${esc(k.name)}</h2>
        <button class="lf-help" id="help" aria-expanded="${helpOpen}" aria-label="About the ${esc(k.name)}: what NASA says, briefly" title="About this rocket">${HELP}</button></div>
      <div class="lf-sub"><span class="lf-roletag">${esc(k.role)}</span><span>${esc(f.maker)}</span></div>
      ${helpOpen ? `<div class="lf-pop" id="pop" role="dialog" aria-label="What NASA says about the ${esc(k.name)}">
        <div class="lf-k"><span>${REAL} in brief</span><button class="lf-x" id="popx" aria-label="Close">×</button></div>
        <dl class="lf-brief">${f.brief.map(b => `<dt>${esc(b.label)}</dt><dd>${esc(b.text)}${num(b)}</dd>`).join('')}
          ${f.cost ? `<dt>Cost</dt><dd>${esc(f.cost.basis)}${num(f.cost)}</dd>` : ''}
          ${k.id === 'falcon9x' ? `<dt>Lift</dt><dd>${esc(FALCON_MARS.provider)} lists ${kg(FALCON_MARS.kg)} kg to Mars with the booster not recovered. That is SpaceX's figure, not NASA's.</dd>` : ''}</dl>
        <div class="lf-nums">${f.numbers.map(n => `<span><small>${esc(n.label)}</small><b>${esc(n.value)}${num(n)}</b></span>`).join('')}</div>
        <details class="lf-src"><summary>${all.length} NASA source${all.length === 1 ? '' : 's'}, retrieved ${formatDate(ROVER_TASK_DATA.retrieved)}</summary>
          <ol>${all.map(x => `<li>${esc(x.title)} · <a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(host(x.url))}</a></li>`).join('')}</ol></details>
        <p class="lf-popnote">${MODEL}The price in credits (1 cr for each $${USD_MILLIONS_PER_CREDIT} million) and the success rate.</p>
      </div>` : ''}
      <p class="lf-blurb">${esc(k.blurb)}</p>
      <div class="lf-tiles">
        <div class="lf-tile ${k.price === null ? '' : 'real'}" title="${k.price === null ? 'Not for sale.' : `NASA's cost figure, $${f.cost!.usdMillions} million, at 1 credit for each $${USD_MILLIONS_PER_CREDIT} million.`}"><small>Launch cost</small><b>${k.price ?? '—'}${k.price === null ? '' : '<i>cr</i>'}</b></div>
        <div class="lf-tile" title="Our model: the chance the rover reaches Mars on this rocket."><small>Success</small><b>${k.successPct ?? '—'}${k.successPct === null ? '' : '<i>%</i>'}</b></div>
        <div class="lf-tile real" title="Rovers this rocket has really launched to Mars."><small>Rovers flown</small><b>${flown}</b></div>
      </div>
      <div class="tradeoffs">${k.pros.map(p => `<span class="pro">${esc(p)}</span>`).join('')}${k.cons.map(c => `<span class="con">${esc(c)}</span>`).join('')}</div>
      <div class="lf-switch"><button class="lf-arrow" id="prev" aria-label="Previous rocket">◀</button>
        <div class="lf-dots" aria-hidden="true">${DELIVERY_ROCKETS.map((_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('')}</div>
        <button class="lf-arrow" id="next" aria-label="Next rocket">▶</button></div>`
  }

  function checkHtml(k: DeliveryRocket): string {
    const refusal = rocketRefusal(k, rv.id)
    const block = m.rocketBlock(k.id)
    const left = m.credits, after = k.price === null ? left : left - k.price
    const craft = spacecraftKg(rv.id), spare = marginKg(k.id, rv.id)
    const real = rv.id === 'curiosity'
    // How much of the rocket's lift the spacecraft takes: only the Falcon 9 has a figure to compare with.
    const lift = k.id === 'falcon9x' ? `<div class="lf-bar"><i style="width:${Math.min(100, (craft / FALCON_MARS.kg) * 100).toFixed(1)}%"></i><u style="left:100%"></u></div><small>${spare! >= 0 ? `${kg(spare!)} kg to spare of ${kg(FALCON_MARS.kg)} kg (SpaceX's figure)` : `${kg(-spare!)} kg too heavy`}</small>`
      : k.id === 'atlas541' ? `<div class="lf-bar"><i style="width:72%"></i></div><small>it really lifted this spacecraft</small>`
        : `<div class="lf-bar"><i style="width:8%"></i></div><small>a Moon rocket: far more lift than this needs</small>`
    const tone = refusal ? (k.id === 'saturnv' ? 'grounded' : 'short') : k.id === 'falcon9x' ? 'marginal' : 'comfortable'
    const word = refusal ? (k.id === 'saturnv' ? 'Retired' : 'Not for this rover') : k.id === 'falcon9x' ? 'At the limit' : 'Proven'
    const line = refusal ?? k.verdict
    return `<div class="lf-k"><span>2 · Launch check</span><em class="lf-twr">${esc(rv.name)}</em></div>
      <div class="lf-meters">
        <div class="lf-meter ${after < 0 ? 'bad' : ''}"><div class="lf-meter-top"><span>Budget</span><b>${k.price === null ? `${left} cr` : `${left} → ${after} cr`}</b></div>
          <div class="lf-bar"><i style="width:${Math.max(0, Math.min(100, (after / Math.max(1, left)) * 100))}%"></i></div>
          <small>${after < 0 ? `${-after} cr short` : k.price === null ? 'not for sale' : `${k.price} cr for the launch`}</small></div>
        <div class="lf-meter ${k.id === 'falcon9x' ? 'warn' : ''}"><div class="lf-meter-top"><span>Spacecraft</span><b>${kg(craft)} kg</b></div>
          ${lift}</div>
      </div>
      <div class="lf-lift ${tone}"><span class="lf-verdict">${word}</span><p>${esc(line)}</p></div>
      ${block && !refusal ? `<div class="lf-block" role="alert">${esc(block)}</div>` : ''}
      <button class="btn primary lf-go" id="go" ${block ? 'disabled' : ''}><b>${refusal ? 'Not available' : 'Launch'}</b><small>${refusal ? 'choose another rocket' : `${k.successPct}% chance to reach Mars · a failure costs ${BACKUP_SOLS} Mars days`}</small></button>
      <div class="lf-note">${real ? REAL : MODEL}${real ? `${kg(craft)} kg is NASA's figure for the whole spacecraft at launch.` : `${kg(craft)} kg is our sum: Curiosity's spacecraft (${kg(SPACECRAFT.curiosity.launchMassKg)} kg, NASA) plus the ${SPACECRAFT.perseverance.extraRoverKg} kg heavier rover.`}</div>`
  }

  function render() {
    const k = current()
    rocketPanel.innerHTML = rocketHtml(k)
    checkPanel.innerHTML = checkHtml(k)
    rocketPanel.classList.toggle('lf-helping', helpOpen)
    $('#funds', s).textContent = `${rv.name} · ${m.credits} cr left`
    $('#prev', rocketPanel).addEventListener('click', () => step(-1))
    $('#next', rocketPanel).addEventListener('click', () => step(1))
    $('#help', rocketPanel).addEventListener('click', () => { helpOpen = !helpOpen; sound.play('ui'); render(); $('#help', rocketPanel).focus() })
    rocketPanel.querySelector('#popx')?.addEventListener('click', () => { helpOpen = false; render(); $('#help', rocketPanel).focus() })
    $('#go', checkPanel).addEventListener('click', launchPressed)
  }

  /** Puts another rocket on the pad: the lamps dip, the stack changes, the lamps come back. */
  function select(i: number) {
    const to = (i + DELIVERY_ROCKETS.length) % DELIVERY_ROCKETS.length
    if (to === (swap ? swap.to : index)) return
    scene?.prepare(DELIVERY_ROCKETS[to].id)
    if (still || !scene || !s.isConnected) { index = to; swap = null; dim = 0; render() } else swap = { at: performance.now(), to, done: false }
    sound.play('ui')
  }
  const step = (dir: number) => { if (phase === 'pick') select((swap ? swap.to : index) + dir) }
  function setTab(tab: string) {
    design.dataset.tab = tab
    $$('.lf-tabs button', s).forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)))
  }

  // ------------------------------------------------------------------ launch
  function launchPressed() {
    if (phase !== 'pick' || swap) return
    const k = current()
    // The dice are rolled here; the climb that follows is the same picture either way.
    const err = m.chooseRocket(k.id)
    if (err) { sound.play('fail'); render(); return }
    sound.play('ui')
    helpOpen = false
    phase = 'count'
    t0 = performance.now()
    lastTick = COUNT_FROM + 1
    ignited = false; liftSaid = false
    $('#countk', s).textContent = `${k.name} · ${rv.name} aboard`
    $('#countn', s).textContent = ''
    s.classList.add('lf-launching')
    $('#skip', s).classList.remove('hidden')
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    if (still || !scene) showResult()
  }

  function showResult() {
    if (phase === 'result' || phase === 'over') return
    phase = 'result'
    $('#skip', s).classList.add('hidden')
    s.classList.add('lf-flying') // hides the countdown, also when the climb was skipped before lift-off
    $('#countn', s).textContent = ''
    $('#countt', s).textContent = ''
    const d = m.delivery!, k = deliveryRocket(d.rocket as DeliveryId)
    sound.play(d.ok ? 'success' : 'fail')
    result.innerHTML = `<div class="lf-result-card rp-card ${d.ok ? 'ok' : ''}">
      <div class="lf-k"><span>${d.ok ? 'Delivered' : 'Launch failed'}</span><em>${esc(k.name)}</em></div>
      <h2>${d.ok ? `${esc(rv.name)} is on Mars` : 'A backup had to fly'}</h2>
      <ul>${d.ok
        ? `<li>${esc(k.name)} did its job: ${k.price} cr, ${m.credits} cr left.</li><li>Day 1 of ${m.missionSols}. The rover is where the real ${esc(rv.name)} stands today.</li>`
        : `<li>${esc(failureStory(k))}</li><li>A backup ${esc(rv.name)} flew on the next rocket: <b>${d.solsLost} Mars days lost</b>. The mission starts on day ${m.sol} of ${m.missionSols}.</li>`}</ul>
      <p class="lf-result-note">${MODEL}The ${k.successPct}% chance and the ${BACKUP_SOLS}-day cost are game rules, not NASA figures.</p>
      <div class="actions"><button class="btn primary" id="on">Drive on Mars →</button></div></div>`
    result.classList.remove('hidden')
    $('#on', result).addEventListener('click', () => { if (phase !== 'over') { phase = 'over'; sound.play('ui'); ctx.done() } })
    ;($('#on', result) as HTMLElement).focus()
  }

  // ------------------------------------------------------------------ every frame
  function frame(now: number) {
    if (!s.isConnected && now - born > 2500) return // the screen was replaced
    if (phase === 'over') return
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.1, (now - lastNow) / 1000)
    lastNow = now
    ptr[0] += (ptrGoal[0] - ptr[0]) * Math.min(1, dt * 4); ptr[1] += (ptrGoal[1] - ptr[1]) * Math.min(1, dt * 4)
    if (swap) {
      const t = now - swap.at
      if (!swap.done && t >= 190) { swap.done = true; index = swap.to; render() }
      dim = t < 190 ? t / 190 : Math.max(0, 1 - (t - 190) / 300)
      if (t >= 490) { swap = null; dim = 0 }
    }
    let ignite = 0
    let flight: SceneState['flight'] = null
    if (phase === 'count') {
      const left = COUNT_FROM - (now - t0) / 1000
      const n = Math.ceil(left)
      if (n !== lastTick && n > 0) {
        lastTick = n
        $('#countn', s).textContent = `T−${n}`
        $('#countt', s).textContent = n === 1 ? 'Main engine start' : 'Go for launch'
        sound.play('count')
      }
      if (left <= 1.4 && !ignited) { ignited = true; sound.play('ignite') }
      ignite = ignited ? clamp01((1.4 - left) / 1.4) * 0.75 : 0
      chase = Math.min(0.2, chase + dt * 0.08)
      if (left <= 0) { phase = 'climb'; t0 = now; s.classList.add('lf-flying') }
    }
    if (phase === 'climb' || phase === 'result') {
      const t = (now - t0) / 1000
      if (!liftSaid) { liftSaid = true; sound.play('launch') }
      const alt = 7 * t ** 2.2
      chase = Math.min(1, chase + dt / 2.6)
      flight = {
        alt, range: 0.6 * Math.max(0, t - 3) ** 2.4, pitch: 0.16 * smooth(3, 9, t), thrust: 1, stage: 1, sinceStaging: -1,
        air: Math.exp(-alt / 8500), shake: still ? 0 : 0.55 * (1 - smooth(1, 6, t)) + 0.12,
      }
      if (phase === 'climb') {
        veil.style.opacity = String(0.55 * smooth(CLIMB_S - 1.2, CLIMB_S, t))
        if (t >= CLIMB_S) showResult()
      }
    }
    if (!scene) return
    scene.draw({
      time: still && phase === 'pick' ? 20 : (now - born) / 1000, ship: current().id, dim, descent: 0, chase,
      ptr: still ? [0, 0] : ptr, shiftY: narrow() ? (phase === 'pick' ? 0.47 : 0.14) : 0,
      ignite, flight, orbit: 0, boom: -1,
    })
  }

  // ------------------------------------------------------------------ events
  const move = (e: PointerEvent) => {
    if (!s.isConnected) return window.removeEventListener('pointermove', move)
    ptrGoal[0] = (e.clientX / window.innerWidth) * 2 - 1; ptrGoal[1] = (e.clientY / window.innerHeight) * 2 - 1
  }
  if (!still && !isTouch()) window.addEventListener('pointermove', move, { passive: true })
  const key = (e: KeyboardEvent) => {
    if (!s.isConnected) return window.removeEventListener('keydown', key)
    if (phase !== 'pick' || e.repeat) return
    if (e.key === 'ArrowLeft') step(-1)
    if (e.key === 'ArrowRight') step(1)
    if (e.key === 'Escape' && helpOpen) { helpOpen = false; render() }
  }
  window.addEventListener('keydown', key)
  $('#back', s).addEventListener('click', () => { if (phase === 'pick') ctx.back() })
  $('#skip', s).addEventListener('click', showResult)
  $$('.lf-tabs button', s).forEach(b => b.addEventListener('click', () => { setTab(b.dataset.tab!); sound.play('ui') }))
  // swipe the stack sideways to change it
  let swipe: { x: number; y: number } | null = null
  $('#scene', s).addEventListener('pointerdown', e => { swipe = { x: e.clientX, y: e.clientY } })
  $('#scene', s).addEventListener('pointerup', e => {
    if (!swipe) return
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y
    swipe = null
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1)
  })

  scene?.prepare(current().id)
  setTab('rocket')
  render()
  raf = requestAnimationFrame(now => { t0 = now; lastNow = now; frame(now) })
  // Build the other two stacks while the first is on screen, so changing rockets does not hitch.
  DELIVERY_ROCKETS.slice(1).forEach((k, i) => setTimeout(() => { if (s.isConnected) scene?.prepare(k.id) }, 500 + i * 400))

  return { el: s, stop: () => { phase = 'over'; cancelAnimationFrame(raf); window.removeEventListener('keydown', key); window.removeEventListener('pointermove', move) } }
}
