// Title, fleet carousel, crew manifest, and the launch/approach sequence (all DOM).
import { SHIPS, SUITS, byId, type ShipId, type SuitId } from '../core/data'
import { cleanCallSign } from '../core/mission'
import { sound } from '../audio'
import { asset } from '../game/game'
import { $, $$, el, esc, reducedMotion } from './dom'

export interface Draft { callSign: string; suit: SuitId; ship: ShipId }

export function titleScreen(onStart: () => void): HTMLElement {
  const s = el(`<section class="screen earth-bg title" aria-label="Title">
    <div class="holo-rings" style="width:min(78vw,700px);aspect-ratio:1;left:50%;top:46%;transform:translate(-50%,-50%)"></div>
    <div class="scanlines"></div><div class="holo-frame"></div>
    <div style="position:relative">
      <div class="logo">SPACER<i>///</i></div>
      <div class="tag">Orbital station operations · Delayed Mars rover survey</div>
      <button class="btn primary" id="start">Start mission</button>
    </div>
    <div class="foot">A NASA Space Apps educational game. Scenario, terrain, ice readings and timing are <b>simulated</b>.</div>
  </section>`)
  $('#start', s).addEventListener('click', () => { sound.play('ui'); onStart() })
  setTimeout(() => $('#start', s).focus(), 50)
  return s
}

const MAX = { payload: 25, budget: 113, battery: 100, relay: 8 }

export function fleetScreen(draft: Draft, onBack: () => void, onPick: (id: ShipId) => void): HTMLElement {
  const s = el(`<section class="screen earth-bg fleet" aria-label="Choose spacecraft">
    <div class="scanlines"></div>
    <div class="topbar" style="z-index:2"><button class="btn ghost small" id="back">← Title</button><span class="step">Step 1 / 3 · Select spacecraft</span><span></span></div>
    <div class="carousel" id="car" tabindex="0" aria-roledescription="carousel">
      ${SHIPS.map(ship => `<div class="ship-slide" data-id="${ship.id}" role="group" aria-label="${ship.name}">
        <img src="${asset(`ship-${ship.id}.svg`)}" alt="${ship.name} spacecraft" draggable="false" />
        <div class="ship-card">
          <div class="role">${ship.role}</div>
          <h2>${ship.name}</h2>
          <p>${ship.blurb}</p>
          <div class="meters">
            ${meter('Payload capacity', ship.payloadKg, MAX.payload, 'kg')}
            ${meter('Supply budget', ship.budget, MAX.budget, 'cr')}
            ${meter('Starting rover battery', ship.battery, MAX.battery, '%')}
            ${meter('Baseline one-way relay', ship.relayMin, MAX.relay, 'min', true)}
          </div>
          <div class="tradeoffs">${ship.pros.map(p => `<span class="pro">${p}</span>`).join('')}${ship.cons.map(c => `<span class="con">${c}</span>`).join('')}</div>
        </div>
      </div>`).join('')}
    </div>
    <div class="fleet-nav">
      <button class="btn" id="prev" aria-label="Previous spacecraft">◀</button>
      <div class="dots">${SHIPS.map(() => '<i></i>').join('')}</div>
      <button class="btn" id="next" aria-label="Next spacecraft">▶</button>
      <button class="btn primary" id="pick">Select</button>
    </div>
  </section>`)
  const car = $('#car', s)
  let index = Math.max(0, SHIPS.findIndex(x => x.id === draft.ship))
  const update = () => {
    $$('.dots i', s).forEach((d, i) => d.classList.toggle('on', i === index))
    $('#pick', s).textContent = `Select ${SHIPS[index].name}`
  }
  const go = (i: number, smooth = true) => {
    index = (i + SHIPS.length) % SHIPS.length
    car.scrollTo({ left: index * car.clientWidth, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' })
    update()
    sound.play('ui')
  }
  car.addEventListener('scroll', () => {
    const i = Math.round(car.scrollLeft / Math.max(1, car.clientWidth))
    if (i !== index && i >= 0 && i < SHIPS.length) { index = i; update() }
  }, { passive: true })
  // vertical wheel scrolls horizontally
  car.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && Math.abs(e.deltaY) > 20) { e.preventDefault(); go(index + (e.deltaY > 0 ? 1 : -1)) }
  }, { passive: false })
  $('#prev', s).addEventListener('click', () => go(index - 1))
  $('#next', s).addEventListener('click', () => go(index + 1))
  $('#back', s).addEventListener('click', onBack)
  $('#pick', s).addEventListener('click', () => { sound.play('ui'); onPick(SHIPS[index].id) })
  const key = (e: KeyboardEvent) => {
    if (!s.isConnected) return window.removeEventListener('keydown', key)
    if (e.key === 'ArrowLeft') go(index - 1)
    if (e.key === 'ArrowRight') go(index + 1)
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') onPick(SHIPS[index].id)
  }
  window.addEventListener('keydown', key)
  requestAnimationFrame(() => { go(index, false); update() })
  window.addEventListener('resize', () => s.isConnected && car.scrollTo({ left: index * car.clientWidth }))
  return s
}

function meter(label: string, v: number, max: number, unit: string, lowerBetter = false) {
  const pct = Math.round((v / max) * 100)
  return `<div class="meter"><div class="row"><span>${label}</span><b>${v} ${unit}</b></div><div class="bar"><i style="width:${pct}%${lowerBetter ? ';background:linear-gradient(90deg,#ffb347,#e0702a)' : ''}"></i></div>${lowerBetter ? '<small style="color:#b9ae95">lower is faster</small>' : ''}</div>`
}

export function crewScreen(draft: Draft, onBack: () => void, onLaunch: (d: Draft) => void): HTMLElement {
  const ship = byId(SHIPS, draft.ship)
  const s = el(`<section class="screen crew" aria-label="Crew manifest">
    <div class="topbar"><button class="btn ghost small" id="back">← Fleet</button><span class="step">Step 2 / 3 · Crew manifest</span><span></span></div>
    <div class="crew-panel">
      <div class="crew-preview"><img id="pv" alt="Suit preview" /><div class="tagname" id="pvname"></div></div>
      <div>
        <h2 style="font-size:34px">Crew manifest</h2>
        <div class="field" style="margin-top:14px"><label for="cs">Call sign (up to 20 characters)</label>
          <input type="text" id="cs" maxlength="20" autocomplete="off" spellcheck="false" placeholder="Pilot" value="${esc(draft.callSign === 'Pilot' ? '' : draft.callSign)}" /></div>
        <div class="field" style="margin-top:16px"><label id="suitlbl">EVA suit finish</label>
          <div class="suits" role="radiogroup" aria-labelledby="suitlbl">
            ${SUITS.map(x => `<button class="suit-opt" role="radio" data-id="${x.id}" aria-checked="${x.id === draft.suit}"><span class="sw" style="background:${x.primary}"></span>${x.name}</button>`).join('')}
          </div></div>
        <div class="summary">Spacecraft <b>${ship.name}</b> · ${ship.role}<br/>Payload ${ship.payloadKg} kg · Budget ${ship.budget} cr · Rover ${ship.battery}% · Relay ${ship.relayMin} min</div>
        <div class="actions"><button class="btn primary" id="go">Launch</button></div>
      </div>
    </div>
  </section>`)
  const d = { ...draft }
  const refresh = () => {
    ;($('#pv', s) as HTMLImageElement).src = asset(`preview-${d.suit}.svg`)
    $('#pvname', s).textContent = cleanCallSign(($('#cs', s) as HTMLInputElement).value)
    $$('.suit-opt', s).forEach(b => b.setAttribute('aria-checked', String(b.dataset.id === d.suit)))
  }
  $$('.suit-opt', s).forEach(b => b.addEventListener('click', () => { d.suit = b.dataset.id as SuitId; sound.play('ui'); refresh() }))
  $('.suits', s).addEventListener('keydown', e => {
    const i = SUITS.findIndex(x => x.id === d.suit)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      d.suit = SUITS[(i + (e.key === 'ArrowRight' ? 1 : 3)) % 4].id
      refresh(); ($(`.suit-opt[data-id=${d.suit}]`, s)).focus()
    }
  })
  $('#cs', s).addEventListener('input', refresh)
  $('#cs', s).addEventListener('keydown', e => { if (e.key === 'Enter') $('#go', s).click() })
  $('#back', s).addEventListener('click', onBack)
  $('#go', s).addEventListener('click', () => { d.callSign = cleanCallSign(($('#cs', s) as HTMLInputElement).value); onLaunch(d) })
  refresh()
  setTimeout(() => $('#cs', s).focus(), 50)
  return s
}

/** ~8 s ignition → ascent → orbital insertion → cockpit approach. Calls onDone exactly once. */
export function launchScreen(draft: Draft, onDone: () => void): HTMLElement {
  const s = el(`<section class="screen launch" aria-label="Launch sequence">
    <div class="sky"></div><div class="earthL"></div><div class="ground"></div>
    <div class="shipL"><div class="flame"></div><img src="${asset(`ship-${draft.ship}.svg`)}" alt="" style="width:100%" /></div>
    <img class="stationL" src="${asset('station-exterior.svg')}" alt="" /><div class="cockpit"></div>
    <div class="phase" id="ph">Ignition</div>
    <div class="hudL"><div>${esc(byId(SHIPS, draft.ship).name.toUpperCase())} · ${esc(draft.callSign)}</div><div>ALTITUDE <b id="alt">0</b> km</div><div id="vel">VELOCITY 0.0 km/s</div></div>
    <button class="btn small skip" id="skip">Skip animation</button>
  </section>`)
  let done = false
  let raf = 0
  const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); onDone() }
  $('#skip', s).addEventListener('click', finish)
  const key = (e: KeyboardEvent) => { if (!s.isConnected) return window.removeEventListener('keydown', key); if (e.key === 'Escape' || e.key === ' ') finish() }
  window.addEventListener('keydown', key)
  const sky = $('.sky', s), earth = $('.earthL', s), ground = $('.ground', s), ship = $('.shipL', s), flame = $('.flame', s)
  const station = $('.stationL', s), cockpit = $('.cockpit', s), ph = $('#ph', s), alt = $('#alt', s), vel = $('#vel', s)
  if (reducedMotion()) {
    sky.style.background = '#03050b'; earth.style.opacity = '1'; ground.style.display = 'none'; ship.style.display = 'none'
    cockpit.style.opacity = '1'; station.style.opacity = '1'; station.style.transform = 'translate(-50%,-50%) scale(1)'
    ph.textContent = 'Docking (reduced motion)'; alt.textContent = '408'
    setTimeout(finish, 1400)
    return s
  }
  sound.play('launch')
  const T = 8000
  const t0 = performance.now()
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t))
  const ease = (t: number) => t * t * (3 - 2 * t)
  let docked = false
  const frame = (now: number) => {
    const t = now - t0
    // altitude: 0 → 408 km by 5.2 s
    const a = Math.round(408 * ease(Math.min(1, t / 5200)) ** 0.9)
    alt.textContent = String(a)
    vel.textContent = `VELOCITY ${(7.66 * ease(Math.min(1, t / 5200))).toFixed(2)} km/s`
    const shake = t < 2600 ? (Math.random() - 0.5) * 4 : 0
    if (t < 1600) {
      ph.textContent = 'Ignition'
      sky.style.background = 'linear-gradient(#3a6ea8, #a8c8e0)'
      ship.style.transform = `translate(-50%, -10%) rotate(-90deg) translate(${shake}px, ${shake}px)`
      flame.style.transform = `rotate(90deg) scale(${0.6 + Math.random() * 0.5})`
    } else if (t < 4300) {
      ph.textContent = 'Ascent'
      const u = (t - 1600) / 2700
      sky.style.background = `linear-gradient(rgb(${lerp(58, 3, u)},${lerp(110, 5, u)},${lerp(168, 11, u)}), rgb(${lerp(168, 10, u)},${lerp(200, 18, u)},${lerp(224, 34, u)}))`
      ground.style.transform = `translateY(${u * 120}%)`
      ship.style.transform = `translate(-50%, ${lerp(-10, -60, u)}%) rotate(${lerp(-90, -70, u)}deg) translate(${shake}px,0)`
      flame.style.transform = `rotate(90deg) scale(${0.9 + Math.random() * 0.4})`
    } else if (t < 6000) {
      ph.textContent = 'Orbital insertion · 408 km'
      const u = (t - 4300) / 1700
      sky.style.background = '#03050b'
      earth.style.opacity = String(Math.min(1, u * 2))
      ship.style.transform = `translate(-50%, -60%) rotate(${lerp(-70, 0, ease(u))}deg)`
      flame.style.opacity = String(1 - u)
    } else if (t < T) {
      if (!docked) { docked = true; sound.play('dock') }
      ph.textContent = 'Approach · docking'
      const u = (t - 6000) / 2000
      ship.style.opacity = '0'
      cockpit.style.opacity = String(Math.min(1, u * 3))
      station.style.opacity = String(Math.min(1, u * 3))
      station.style.transform = `translate(-50%, -50%) scale(${lerp(0.15, 1.6, ease(u))})`
    } else return finish()
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return s
}
