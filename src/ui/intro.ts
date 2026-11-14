// Title, fleet carousel, crew manifest, and the launch/approach sequence (all DOM).
import { SHIPS, SUITS, byId, type ShipId, type SuitId } from '../core/data'
import { cleanCallSign } from '../core/mission'
import { sound } from '../audio'
import { asset } from '../game/game'
import { $, $$, el, esc, isTouch, reducedMotion } from './dom'
import { ICONS } from './icons'
import { mountBackdrop } from './titleScene'

export interface Draft { callSign: string; suit: SuitId; ship: ShipId }

export type Mode = 'solo' | 'coop'
export type LinkStatus = 'offline' | 'connecting' | 'connected' | 'error'
/** What the title screen needs from the co-op service. main.ts backs it with the Colyseus room. */
export interface CrewLink {
  state(): { status: LinkStatus; error: string; url: string; room: string; roomId: string; players: number }
  join(): void
  leave(): Promise<void>
}
export interface TitleUi {
  el: HTMLElement
  /** Call when the co-op link changes so the lobby shows the latest state. */
  update(): void
}

const LOGO_DEPTH = 12 // extruded copies stacked behind the logo face
const CHIP: Record<LinkStatus, string> = { offline: 'Standby', connecting: 'Linking', connected: 'Linked', error: 'No link' }

/**
 * Title: logo, then the choice between a solo mission and a co-op mission. Choosing co-op flips the
 * cards over to a lobby that joins the co-op room before the mission starts. The link then stays up
 * through spacecraft selection, launch and docking.
 */
export function titleScreen(link: CrewLink, onStart: (mode: Mode) => void): TitleUi {
  const logo = 'SPACER<i>///</i>'
  const layers = Array.from({ length: LOGO_DEPTH }, (_, k) => {
    const i = LOGO_DEPTH - k
    return `<span class="lz${i === LOGO_DEPTH ? ' last' : ''}" style="--i:${i}" aria-hidden="true">${logo}</span>`
  }).join('')
  const s = el(`<section class="screen title" aria-label="Title">
    <div class="t3d-planet" aria-hidden="true"></div>
    <div class="t3d-shade" aria-hidden="true"></div><div class="holo-frame"></div>
    <div class="t3d-stage"><div class="t3d-rig">
      <h1 class="logo3d" aria-label="Spacer">${layers}<span class="lf" aria-hidden="true">${logo}</span></h1>
      <p class="tag">Orbital station operations · Delayed Mars rover survey</p>
      <div class="t-flip" id="flip">
        <div class="t-face t-front" id="front">
          <div class="t-modes" role="group" aria-label="Choose how to fly">
            <button class="t-mode" id="solo">
              <span class="t-ico">${ICONS.pilot}</span>
              <span class="t-k">One pilot</span>
              <span class="t-t">Solo mission</span>
              <span class="t-d">Run the whole mission yourself. Works offline, with no server.</span>
              <span class="t-go">Start →</span>
            </button>
            <button class="t-mode" id="coop">
              <span class="t-ico">${ICONS.crew}</span>
              <span class="t-k">Two pilots <em class="t-chip" id="cchip"></em></span>
              <span class="t-t">Co-op mission</span>
              <span class="t-d">Share one station deck and one power grid with a crewmate, live over the co-op service.</span>
              <span class="t-go">Open crew link →</span>
            </button>
          </div>
        </div>
        <div class="t-face t-back" id="back" inert>
          <div class="t-lobby" role="group" aria-label="Co-op crew link">
            <div class="t-lobby-head"><span class="t-k">Co-op mission</span><em class="t-chip" id="lchip"></em></div>
            <div class="t-t">Crew link</div>
            <div id="lbody"></div>
          </div>
        </div>
      </div>
    </div></div>
    <div class="foot"><span>A NASA Space Apps educational game. Scenario, terrain and ice readings are <b>simulated</b>; the signal delay and the Mars night cold are NASA data.</span>
      <span>Mars globe: procedural artist's impression, not a NASA image.</span></div>
  </section>`)
  const flipEl = $('#flip', s), front = $('#front', s), back = $('#back', s), body = $('#lbody', s)
  let inLobby = false
  let shown = ''
  const first = link.state()
  let was = first.status
  let crew = first.status === 'connected' ? first.players : 0

  const turn = (toLobby: boolean) => {
    inLobby = toLobby
    flipEl.classList.toggle('t-flipped', toLobby)
    front.toggleAttribute('inert', toLobby)
    back.toggleAttribute('inert', !toLobby)
    if (!toLobby) $('#coop', s).focus()
  }
  const start = (mode: Mode) => { sound.play('ui'); onStart(mode) }

  const update = () => {
    const st = link.state()
    const linked = st.status === 'connected'
    for (const id of ['#cchip', '#lchip']) {
      const badge = $(id, s)
      badge.className = `t-chip ${st.status}`
      badge.textContent = id === '#cchip' && st.status === 'offline' ? '' : linked ? `Linked · ${st.players}/2` : CHIP[st.status]
    }
    $('#coop .t-go', s).textContent = linked ? 'Crew link open →' : 'Open crew link →'
    const key = [st.status, st.error, st.roomId, st.players].join('|')
    if (key === shown) return
    shown = key
    if (st.status !== was) {
      if (linked) sound.play('success')
      if (st.status === 'error') sound.play('fail')
      was = st.status
    } else if (linked && st.players > crew) sound.play('telemetry') // a second pilot arrived
    crew = linked ? st.players : 0

    const you = linked ? 'Linked' : st.status === 'connecting' ? 'Linking…' : 'Not linked'
    const mate = !linked ? '—' : st.players > 1 ? 'Second pilot linked' : 'Waiting for a second pilot…'
    const actions = {
      connected: '<button class="btn primary" id="lgo">Continue to spacecraft →</button><button class="btn" id="lleave">Leave link</button>',
      connecting: '<button class="btn primary" disabled>Linking…</button><button class="btn" id="lback">Back</button>',
      error: '<button class="btn primary" id="ljoin">Retry</button><button class="btn" id="lsolo">Fly solo instead</button><button class="btn ghost" id="lback">Back</button>',
      offline: '<button class="btn primary" id="ljoin">Open link</button><button class="btn" id="lback">Back</button>',
    }[st.status]
    const hadFocus = body.contains(document.activeElement)
    body.innerHTML = `<div class="t-seats">
        <div class="t-seat ${linked ? 'on' : ''}"><i></i><div><b>You</b><small>${you}</small></div></div>
        <div class="t-seat ${linked && st.players > 1 ? 'on' : ''}"><i></i><div><b>${linked && st.players > 1 ? 'Crewmate' : 'Open seat'}</b><small>${mate}</small></div></div>
      </div>
      <div class="t-link" role="status">${linked
        ? `Room <b>${esc(st.room)} · ${esc(st.roomId)}</b> on ${esc(st.url)}. ${st.players > 1 ? 'Both seats are filled.' : 'The next pilot to open a crew link on this service joins you.'}`
        : st.status === 'connecting' ? `Contacting ${esc(st.url)}…` : `Service ${esc(st.url)}`}</div>
      ${st.status === 'error' ? `<div class="feedback bad">${esc(st.error)} Start it in a terminal with <code>npm run server</code>, keep it running, then retry.</div>` : ''}
      <div class="actions">${actions}</div>`
    $('#lgo', body)?.addEventListener('click', () => start('coop'))
    $('#lsolo', body)?.addEventListener('click', () => start('solo'))
    $('#ljoin', body)?.addEventListener('click', () => { sound.play('ui'); link.join() })
    $('#lback', body)?.addEventListener('click', () => { sound.play('ui'); turn(false) })
    $('#lleave', body)?.addEventListener('click', async () => { sound.play('ui'); await link.leave(); turn(false) })
    if (inLobby && hadFocus) $('.btn:not(:disabled)', body)?.focus()
  }

  $('#solo', s).addEventListener('click', () => start('solo'))
  $('#coop', s).addEventListener('click', () => {
    sound.play('ui')
    turn(true)
    const { status } = link.state()
    if (status === 'offline' || status === 'error') link.join()
    setTimeout(() => $('.btn:not(:disabled)', body)?.focus(), 60)
  })
  const key = (e: KeyboardEvent) => {
    if (!s.isConnected) return window.removeEventListener('keydown', key)
    if (e.key === 'Escape' && inLobby) return turn(false)
    if (inLobby || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    $(e.key === 'ArrowLeft' ? '#solo' : '#coop', s).focus()
  }
  window.addEventListener('keydown', key)
  update()
  mountBackdrop(s)
  if (!isTouch()) setTimeout(() => $('#solo', s).focus(), 50) // keyboard players can press Enter straight away
  return { el: s, update }
}

const MAX = { payload: 25, budget: 113, battery: 100, handoff: 3 }

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
            ${meter('Relay hand-off per signal leg', ship.handoffMin, MAX.handoff, 'min', true)}
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
        <div class="summary">Spacecraft <b>${ship.name}</b> · ${ship.role}<br/>Payload ${ship.payloadKg} kg · Budget ${ship.budget} cr · Rover ${ship.battery}% · Relay hand-off ${ship.handoffMin} min</div>
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
