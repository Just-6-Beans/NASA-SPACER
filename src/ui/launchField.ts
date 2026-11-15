// The launch field: mission design on the ground, then the climb to orbit flown by hand.
//
//   1. Arrival: the view falls from orbit onto a floodlit pad at dusk.
//   2. Design: choose the launch system (in co-op, the host does), load instruments and supplies
//      inside one budget, and watch what the weight does to the lift.
//   3. Countdown and ascent: the pilot steers the stack to orbit. Too heavy, or flown badly, and
//      the launch fails; the debrief says which, and the pilot flies again or changes the design.
//   4. Orbit, then the docking film (scene/docking.ts): the spacecraft closes on the station, seen
//      from outside and then from its docking camera; the hatch opens and its light becomes the deck.
//      Not playable, and it can be skipped. Without WebGL, or where motion is to be kept low, a
//      still picture of the station comes up instead.
//
// The scene is WebGL (launchScene.ts); the panels and read-outs are DOM (src/field.css). What is
// real: the three launch systems and what NASA says about them (src/data/launchVehicles.ts).
// What is our model: every price and mass, and the ascent itself (src/core/loadout.ts,
// src/core/ascent.ts). The screen labels both.
import '../field.css'
import {
  APO_MIN, DT, PERI_MIN, PLANET, VEHICLES, altitude, guidance, guidanceControls, orbitOf, pitch, resultOf, showAltKm, showAltM, showSpeedKms,
  speed, startAscent, stepAscent, thrustToWeight, type Ascent, type AscentResult, type Controls,
} from '../core/ascent'
import { CARGO, MISSION_BUDGET, SHIPS, SUITS, cargoStep, type CargoId, type Ship, type ShipId, type SuitId } from '../core/data'
import { ROCKET_ANY } from '../core/delivery'
import { INSTRUMENT_MIN, cargoKg, cleanLoadout, designBlock, designCost, designForecast, failureCauses, instrumentLine, liftLine, type LaunchRecord, type Loadout } from '../core/loadout'
import { cleanCallSign } from '../core/mission'
import { ROCKET_DATA, USD_MILLIONS_PER_CREDIT, rocket, rocketSources, sourceNumbers } from '../data/launchVehicles'
import { formatDate } from '../data/opsDates'
import { sound } from '../audio'
import { asset } from '../game/game'
import { $, $$, el, esc, isTouch, reducedMotion } from './dom'
import { drawDial, drawMap, type Trail } from './flightInstruments'
import type { Draft } from './intro'
import { launchScene, type SceneState } from './launchScene'
import { CONTACT, DOCK_SECONDS, FRAMING, dockShot, type DockShot } from './scene/docking'

export type FieldRole = 'solo' | 'host' | 'guest'
/** What the launch field needs to know about the co-op room. main.ts backs it with the Colyseus room. */
export interface FieldLink {
  role(): FieldRole
  players(): number
  /** For a guest: the launch system the host has on the pad, or null while the host has not chosen. */
  hostShip(): ShipId | null
  /** For a guest: the host has committed to launch, so the launch system is settled. */
  hostLaunched(): boolean
}
export interface FieldHandlers {
  onBack(): void
  /** The pilot who decides here put a different launch system on the pad. */
  onPick(ship: ShipId): void
  /** The pilot changed their call sign, suit or cargo. */
  onDraft(d: Draft): void
  /** This pilot started their countdown. */
  onLaunch(d: Draft): void
  /** Docked. `filmed`: the docking film was shown, so the player has already seen and heard the two craft meet. */
  onDone(d: Draft, launch: LaunchRecord, filmed: boolean): void
}
export interface FieldUi {
  el: HTMLElement
  /** Call when the co-op link changes: the role, the host's launch system or the pilot count. */
  update(): void
  ship(): ShipId
  /** For automated checks: let the guidance fly, run the model faster, read where things stand. */
  autopilot(on: boolean): void
  warp(steps: number): void
  state(): Record<string, unknown>
  /** For automated checks: show the docking film held at one moment (seconds), or let it run again (null). */
  film(seconds: number | null): void
}

const DESCENT_MS = 4200
const COUNT_FROM = 5
const IGNITION_AT = 2.6
const VERDICT = { comfortable: 'Comfortable', tight: 'Tight', marginal: 'Marginal', short: 'Too heavy', grounded: 'Will not lift' } as const
/** What each system calls its two stages, and the moment between them. */
const STAGES: Record<ShipId, [string, string, string]> = {
  shuttle: ['Boosters and main engines', 'Booster separation', 'Main engines'],
  falcon9: ['First stage', 'Stage separation', 'Second stage'],
  atlasv: ['Booster', 'Booster separation', 'Centaur upper stage'],
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const smooth = (a: number, b: number, t: number) => { const u = clamp01((t - a) / (b - a)); return u * u * (3 - 2 * u) }
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
/**
 * OUR MODEL: the second stage is flown at this many times real time, so the whole climb stays
 * under a minute (about 30 s of first stage, then 22 to 28 s). The model and its results are
 * untouched: only the clock runs faster, the change eases in over the first seconds after
 * staging, and the pilot's steering is slowed by the same factor so it feels the same.
 */
const STAGE2_PACE = 2.2
/** What the picture needs from the model at one step. */
interface Pose { h: number; ang: number; pitch: number; speed: number; t: number }
const poseOf = (a: Ascent): Pose => ({ h: altitude(a), ang: Math.atan2(a.x, a.y), pitch: pitch(a), speed: speed(a), t: a.t })
/** Moves `from` toward `to` like a damped spring that never overshoots: returns the new value and speed. */
function glide(from: number, to: number, vel: number, time: number, dt: number): [number, number] {
  const w = 2 / Math.max(1e-4, time), x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const d = from - to, t = (vel + w * d) * dt
  return [to + (d + t) * e, (vel - w * t) * e]
}
const REAL = '<span class="tag real">NASA data</span>'
const MODEL = '<span class="tag model">Our model</span>'
const HELP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.4-2.8 4.2"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/></svg>'
const kgText = (kg: number) => kg.toLocaleString('en-US')
const km = (metres: number) => (metres < 0 ? '—' : String(Math.round(showAltKm(metres))))
/** What happens to the crew when a launch fails. The two capsules carry abort engines (NASA data); the Shuttle's line claims nothing. */
const ESCAPE: Record<ShipId, string> = {
  shuttle: 'Simulated flight: nobody was aboard.',
  falcon9: 'Simulated flight: Crew Dragon\'s abort engines pull the capsule clear.',
  atlasv: 'Simulated flight: Starliner\'s abort engines push the capsule clear.',
}

export function launchField(draft: Draft, link: FieldLink, on: FieldHandlers, opts: { descend: boolean }): FieldUi {
  const still = reducedMotion()
  const scene = launchScene()
  const touch = isTouch()
  const d: Draft = { ...draft, ...cleanLoadout(draft) }

  const s = el(`<section class="screen lfield ${scene ? '' : 'lf-flat'}" aria-label="Launch field">
    <div class="lf-scene" id="scene" aria-hidden="true"></div>
    <div class="lf-grade" aria-hidden="true"></div><div class="holo-frame"></div>
    <div class="topbar lf-top"><button class="btn ghost small" id="back">← Title</button><span class="step">Mission design · launch field</span>
      <span class="lf-chips"><button class="lf-pilot" id="pilot" aria-haspopup="dialog"></button><span class="lf-role" id="role"></span></span></div>
    <div class="lf-tabs" role="tablist"><button data-tab="rocket" role="tab">1 · Rocket</button><button data-tab="load" role="tab">2 · Cargo</button><button data-tab="check" role="tab">3 · Launch</button></div>
    <div class="lf-design" id="design" data-tab="rocket">
      <div class="lf-col lf-left"><div class="lf-panel lf-rocket" id="rocketPanel"></div><div class="lf-panel lf-check" id="checkPanel"></div></div>
      <div class="lf-col lf-right"><div class="lf-panel lf-load" id="loadPanel"></div></div>
    </div>
    <div class="lf-pilotpop hidden" id="pilotpop" role="dialog" aria-label="Pilot">
      <div class="lf-k"><span>Pilot</span><button class="lf-x" id="pilotx" aria-label="Close">×</button></div>
      <div class="field"><label for="cs">Call sign (up to 20 characters)</label>
        <input type="text" id="cs" maxlength="20" autocomplete="off" spellcheck="false" placeholder="Pilot" value="${esc(d.callSign === 'Pilot' ? '' : d.callSign)}" /></div>
      <div class="field"><label id="suitlbl">EVA suit finish</label>
        <div class="suits" role="radiogroup" aria-labelledby="suitlbl">
          ${SUITS.map(x => `<button class="suit-opt" role="radio" data-id="${x.id}"><span class="sw" style="background:${x.primary}"></span>${x.name}</button>`).join('')}
        </div></div>
    </div>
    <div class="lf-count" id="count" role="timer" aria-live="off"><small id="countk"></small><b id="countn"></b><span id="countt"></span></div>
    <div class="lf-flight" id="flight">
      <div class="lf-phase" id="ph" role="status"></div>
      <div class="lf-goal" id="goal"></div>
      <div class="lf-readouts">
        <div><small>Altitude</small><b id="r-alt">0</b><i>km</i></div>
        <div><small>Speed</small><b id="r-spd">0.00</b><i>km/s</i></div>
        <div id="r-high"><small>High point</small><b id="r-apo">—</b><i>km</i></div>
        <div id="r-low"><small>Low point</small><b id="r-peri">—</b><i>km</i></div>
      </div>
      <div class="lf-tanks">
        <div class="lf-tank"><span id="t1"></span><div class="lf-bar"><i id="f1"></i></div></div>
        <div class="lf-tank"><span id="t2"></span><div class="lf-bar"><i id="f2"></i></div></div>
        <div class="lf-tank load"><span>Air load</span><div class="lf-bar"><i id="ld"></i><u></u></div></div>
        <div class="lf-tank thr"><span>Throttle</span><div class="lf-bar"><i id="th"></i></div></div>
      </div>
      <div class="lf-inst">
        <canvas id="map" aria-label="Map of the planet with the path ahead"></canvas>
        <div class="lf-dialbox"><canvas id="dial" aria-label="Pitch dial"></canvas><div class="lf-dialtxt" id="dialtxt"></div></div>
      </div>
      <div class="lf-keys">${touch ? '' : '<span><kbd>A</kbd><kbd>D</kbd> or <kbd>←</kbd><kbd>→</kbd> tilt</span><span><kbd>W</kbd><kbd>S</kbd> or <kbd>↑</kbd><kbd>↓</kbd> throttle</span>'}<span>Keep the white needle on the mint marker</span></div>
      <div class="lf-touch ${touch ? '' : 'hidden'}">
        <button data-key="left" aria-label="Tilt back toward vertical">◄</button><button data-key="right" aria-label="Tilt over toward the horizon">►</button>
        <button data-key="down" aria-label="Throttle down">−</button><button data-key="up" aria-label="Throttle up">+</button>
      </div>
      <div class="lf-simnote sim">Simulated ascent · our model on a small Earth · read-outs at real scale</div>
    </div>
    <div class="lf-result hidden" id="result" role="alertdialog" aria-live="assertive"></div>
    <img class="lf-station" id="station" src="${asset('station-exterior.svg')}" alt="" />
    <div class="lf-veil" id="veil"></div>
    <div class="lf-film" id="film" aria-hidden="true">
      <div class="lf-reticle"><i></i></div>
      <div class="lf-film-cap"><small id="filmk"></small><b id="filmt"></b><span id="filmr"></span></div>
      <div class="lf-film-note">Docking film · our own artist's impression, not NASA imagery · hours shortened to seconds</div>
    </div>
    <div class="lf-white" id="white"></div>
    <button class="btn ghost small lf-skip" id="skip" hidden>Skip ›</button>
    <div class="lf-foot">${REAL}<span>The three launch systems are real; what the game says about them comes from NASA pages, retrieved ${formatDate(ROCKET_DATA.retrieved)}. Prices, masses and the ascent are our model. The scene is our own artist's impression, not NASA imagery.</span></div>
  </section>`)
  if (scene) $('#scene', s).append(scene.canvas)

  const design = $('#design', s), rocketPanel = $('#rocketPanel', s), loadPanel = $('#loadPanel', s), checkPanel = $('#checkPanel', s)
  const input = $('#cs', s) as HTMLInputElement, pilotPop = $('#pilotpop', s), result = $('#result', s)
  const station = $('#station', s), veil = $('#veil', s), white = $('#white', s), skipBtn = $('#skip', s)
  const mapC = $('#map', s) as unknown as HTMLCanvasElement, dialC = $('#dial', s) as unknown as HTMLCanvasElement

  let index = Math.max(0, SHIPS.findIndex(x => x.id === d.ship))
  let phase: 'arrive' | 'design' | 'count' | 'flight' | 'result' | 'orbit' | 'film' | 'over' = opts.descend && !still && scene ? 'arrive' : 'design'
  const born = performance.now()
  let t0 = born, raf = 0, lastNow = born
  let helpOpen = false
  let swap: { at: number; to: number; done: boolean } | null = null
  let dim = 0
  // the flight
  let sim: Ascent | null = null
  let trail: Trail = []
  let bank = 0 // model time owed, seconds
  let throttle = 1
  let assist = false, warp = 1
  const held = { left: false, right: false, up: false, down: false }
  let attempts = 0
  const failures: AscentResult['outcome'][] = []
  let lastResult: AscentResult | null = null
  let chase = 0, orbitK = 0, boomAt = -1, lastTick = COUNT_FROM + 1, ignited = false, endedAt = 0, hudAt = 0, stagedSaid = false, liftSaid = false
  // What keeps the picture smooth. The model moves in fixed steps; the picture is drawn between
  // the last two of them (`poseWas`, `poseNow`), so the rocket never jumps when a frame holds no
  // step or two. The camera, the flame and the buffeting ease toward their values instead of
  // switching, and the pilot's steering eases in and out.
  let poseWas: Pose | null = null, poseNow: Pose | null = null
  let chaseV = 0, thrustShown = 0, shakeShown = 0, turnEase = 0
  /** How fast model time runs. It eases up to STAGE2_PACE once the first stage has gone. */
  let pace = 1
  /** When the first stage fell away, on the page's clock. */
  let stagedReal = 0
  // The docking film (staged in scene/docking.ts): when it began and, if the player skipped it, when;
  // the moment it is held at for a check; how far east the climb ended; what its caption last said.
  let filmAt = 0, skipAt = 0, filmHold: number | null = null, rangeNow = 0, filmBeat = '', filmRange = '', touched = false
  /** The film needs the 3D scene. Without it, or where motion is to be kept low, the old still picture of the station is used. */
  const filmed = !!scene && !still

  const current = () => SHIPS[index]
  const loadout = (): Loadout => ({ cargo: { ...d.cargo } })
  /** In co-op, a host who has launched with a crewmate in the room has committed both of them to this launch system. */
  const locked = () => link.role() === 'host' && link.players() > 1 && attempts > 0
  const decides = () => link.role() !== 'guest' && !locked()
  const designing = () => phase === 'design' || phase === 'arrive'
  const snapshot = (): Draft => ({ ...d, ship: current().id, callSign: cleanCallSign(input.value) })
  const narrowLayout = () => window.matchMedia('(max-width: 900px), (max-aspect-ratio: 1/1)').matches

  // ------------------------------------------------------------------ design panels
  function rocketHtml(ship: Ship): string {
    const r = rocket(ship.rocket), v = VEHICLES[ship.id]
    const sources = rocketSources(r)
    const ref = (fact: Parameters<typeof sourceNumbers>[1]) => { const n = sourceNumbers(r, fact); return n.length ? `<sup class="lf-ref">${n.join(' ')}</sup>` : '' }
    const host = (url: string) => new URL(url).hostname.replace(/^www\./, '')
    return `<div class="lf-k"><span>1 · Launch system</span><em>${index + 1} / ${SHIPS.length}</em></div>
      <div class="lf-title"><h2>${esc(ship.name)}</h2>
        <button class="lf-help" id="help" aria-expanded="${helpOpen}" aria-label="About the ${esc(ship.name)}: what NASA says, briefly" title="About this launch system">${HELP}</button></div>
      <div class="lf-sub"><span class="lf-roletag">${esc(ship.role)}</span><span>${esc(r.years)}</span></div>
      ${helpOpen ? `<div class="lf-pop" id="pop" role="dialog" aria-label="What NASA says about the ${esc(ship.name)}">
        <div class="lf-k"><span>${REAL} in brief</span><button class="lf-x" id="popx" aria-label="Close">×</button></div>
        <dl class="lf-brief">${r.brief.map(b => `<dt>${esc(b.label)}</dt><dd>${esc(b.text)}${ref(b)}</dd>`).join('')}</dl>
        <div class="lf-nums">${r.numbers.map(n => `<span><small>${esc(n.label)}</small><b>${esc(n.value)}${ref(n)}</b></span>`).join('')}</div>
        <details class="lf-src"><summary>${sources.length} NASA source${sources.length === 1 ? '' : 's'}, retrieved ${formatDate(ROCKET_DATA.retrieved)}</summary>
          <ol>${sources.map(x => `<li>${esc(x.title)} · <a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(host(x.url))}</a></li>`).join('')}</ol></details>
        <p class="lf-popnote">${MODEL}The price in credits (1 cr for each $${USD_MILLIONS_PER_CREDIT} million), the cargo rating and the climb.</p>
      </div>` : ''}
      <p class="lf-blurb">${esc(ship.blurb)}</p>
      <div class="lf-tiles">
        <div class="lf-tile real" title="NASA's cost figure for one flight, $${r.cost.usdMillions} million, at 1 credit for each $${USD_MILLIONS_PER_CREDIT} million. ${esc(r.cost.basis)}"><small>Launch cost</small><b>${ship.launchCost}<i>cr</i></b></div>
        <div class="lf-tile" title="Our model: the cargo a clean ascent carries with propellant to spare."><small>Carries</small><b>${kgText(ship.payloadKg)}<i>kg</i></b></div>
        <div class="lf-tile ${r.liftoff ? 'real' : ''}" title="Thrust at lift-off divided by weight. ${r.liftoff ? `NASA's figures for the real vehicle. ${esc(r.liftoff.note)}` : 'Our estimate: NASA gives the thrust but no lift-off weight for this stack.'}"><small>Thrust ÷ weight</small><b>${v.twr.toFixed(2)}</b></div>
      </div>
      <div class="tradeoffs">${ship.pros.map(p => `<span class="pro">${esc(p)}</span>`).join('')}${ship.cons.map(c => `<span class="con">${esc(c)}</span>`).join('')}</div>
      <div class="lf-switch"><button class="lf-arrow" id="prev" aria-label="Previous launch system">◄</button>
        <div class="lf-dots" aria-hidden="true">${SHIPS.map((_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('')}</div>
        <button class="lf-arrow" id="next" aria-label="Next launch system">►</button></div>`
  }

  function loadHtml(_ship: Ship): string {
    return `<div class="lf-k"><span>2 · Station cargo</span>${MODEL}</div>
      <div class="lf-group">For the space station <small>more of each does more, and weighs more</small></div>
      ${CARGO.map(c => {
        const kg = d.cargo[c.id], st = cargoStep(c.id, kg)
        return `<div class="lf-item lf-cargo ${st ? 'on' : ''}" role="group" aria-label="${esc(c.name)}" title="${esc(c.note)}">
          <span class="lf-item-main"><b>${esc(c.name)}</b>
            <small class="lf-fx">${esc(c.effect((st ?? c.steps[0]).value))}</small></span>
          <span class="lf-item-cost"><b>${st ? `${st.cost} cr` : '—'}</b><small>${st ? `${kgText(st.kg)} kg` : 'not loaded'}</small></span>
          <span class="lf-steps" role="radiogroup" aria-label="How much ${esc(c.name.toLowerCase())}">
            <button class="lf-step" data-id="${c.id}" data-kg="0" role="radio" aria-checked="${!st}">None</button>
            ${c.steps.map(x => `<button class="lf-step" data-id="${c.id}" data-kg="${x.kg}" role="radio" aria-checked="${x.kg === kg}" title="${x.cost} cr · ${esc(c.effect(x.value))}">${kgText(x.kg)} kg</button>`).join('')}
          </span></div>`
      }).join('')}`
  }

  function checkHtml(ship: Ship): string {
    const l = loadout(), c = designCost(ship, l), kg = cargoKg(l), f = designForecast(ship, l), block = designBlock(ship, l)
    const role = link.role(), r = rocket(ship.rocket)
    const scaleKg = Math.max(ship.payloadKg * 1.6, kg)
    const waits = role === 'guest' && !(link.hostLaunched() && link.hostShip())
    const risky = !block && (f.verdict === 'short' || f.verdict === 'grounded')
    const note = role === 'solo' ? '' : role === 'host'
      ? (locked() ? 'The launch system is settled: your crewmate is cleared to fly it. You can still change the cargo.'
        : link.players() > 1 ? 'You are the host: the launch system is your call. Each pilot loads and flies their own.' : 'You are the host. A pilot who joins flies the launch system you choose.')
      : waits ? (link.hostShip() ? 'The host is still choosing the launch system. Load your cargo meanwhile.' : 'The host has not reached the launch field yet.')
        : `The host has committed to the ${r.name}. Launch when you are ready.`
    return `<div class="lf-k"><span>3 · Launch check</span><em class="lf-twr" title="Thrust at lift-off divided by the weight with this cargo">T÷W ${f.liftoffTwr.toFixed(2)}</em></div>
      <div class="lf-meters">
        <div class="lf-meter ${c.left < 0 ? 'bad' : c.left < INSTRUMENT_MIN + ROCKET_ANY ? 'warn' : ''}"><div class="lf-meter-top"><span>Budget</span><b>${c.spent} / ${MISSION_BUDGET} cr</b></div>
          <div class="lf-bar"><i style="width:${Math.min(100, (c.spent / MISSION_BUDGET) * 100)}%"></i></div>
          <small>${c.left < 0 ? `${-c.left} cr over budget` : esc(instrumentLine(ship, l))}</small></div>
        <div class="lf-meter ${f.verdict === 'short' || f.verdict === 'grounded' ? 'bad' : kg > ship.payloadKg ? 'warn' : ''}"><div class="lf-meter-top"><span>Cargo</span><b>${kgText(kg)} kg</b></div>
          <div class="lf-bar"><i style="width:${Math.min(100, (kg / scaleKg) * 100)}%"></i><u style="left:${(ship.payloadKg / scaleKg) * 100}%"></u></div>
          <small>carries ${kgText(ship.payloadKg)} kg with propellant to spare</small></div>
      </div>
      <div class="lf-lift ${f.verdict}"><span class="lf-verdict">${VERDICT[f.verdict]}</span><p>${esc(liftLine(ship, l))}</p></div>
      ${block ? `<div class="lf-block" role="alert">${esc(block)}</div>` : ''}
      <button class="btn primary lf-go ${risky ? 'risky' : ''}" id="go" ${block || waits ? 'disabled' : ''}><b>${waits ? 'Stand by' : risky ? 'Launch anyway' : 'Launch'}</b><small>${waits ? 'the host decides the launch system' : risky ? 'the forecast says this design falls short' : `you fly the ${esc(ship.rocketName)} to orbit`}</small></button>
      ${note ? `<div class="lf-note ${role}">${esc(note)}</div>` : ''}`
  }

  function render() {
    const ship = current(), role = link.role()
    rocketPanel.innerHTML = rocketHtml(ship)
    loadPanel.innerHTML = loadHtml(ship)
    checkPanel.innerHTML = checkHtml(ship)
    for (const id of ['#prev', '#next']) ($(id, rocketPanel) as HTMLButtonElement).disabled = !decides()
    $('#prev', rocketPanel).addEventListener('click', () => step(-1))
    $('#next', rocketPanel).addEventListener('click', () => step(1))
    rocketPanel.classList.toggle('lf-helping', helpOpen)
    $('#help', rocketPanel).addEventListener('click', () => { helpOpen = !helpOpen; sound.play('ui'); render(); $('#help', rocketPanel).focus() })
    rocketPanel.querySelector('#popx')?.addEventListener('click', () => { helpOpen = false; render(); $('#help', rocketPanel).focus() })
    $$('.lf-step', loadPanel).forEach(b => b.addEventListener('click', () => setCargo(b.dataset.id as CargoId, Number(b.dataset.kg))))
    $('#go', checkPanel).addEventListener('click', launchPressed)
    $('#role', s).textContent = role === 'solo' ? 'Solo' : `${role === 'host' ? 'Host' : 'Crew'} · ${link.players()}/2`
    $('#role', s).classList.toggle('host', role === 'host')
    const suit = SUITS.find(x => x.id === d.suit)!
    $('#pilot', s).innerHTML = `<span class="sw" style="background:${suit.primary}"></span><b>${esc(cleanCallSign(input.value))}</b><small>${suit.name} suit · edit</small>`
    $$('.suit-opt', s).forEach(b => b.setAttribute('aria-checked', String(b.dataset.id === d.suit)))
  }
  const changed = () => { render(); on.onDraft(snapshot()) }

  /** Loads an amount of one cargo item, or unloads it (kg 0). */
  function setCargo(id: CargoId, kg: number) {
    if (phase !== 'design') return
    const cargo = { ...d.cargo }
    if (kg && cargoStep(id, kg)) cargo[id] = kg; else delete cargo[id]
    d.cargo = cargo
    sound.play('ui')
    changed()
    $<HTMLButtonElement>(`.lf-step[data-id=${id}][data-kg="${kg && cargoStep(id, kg) ? kg : 0}"]`, loadPanel)?.focus()
  }

  /** Puts another launch system on the pad: the lamps dip, the stack changes, the lamps come back. */
  function select(i: number, tell: boolean) {
    const to = (i + SHIPS.length) % SHIPS.length
    if (to === (swap ? swap.to : index)) return
    scene?.prepare(SHIPS[to].id)
    if (still || !scene || !s.isConnected) { index = to; swap = null; dim = 0; d.ship = current().id; render() } else swap = { at: performance.now(), to, done: false }
    if (tell) { sound.play('ui'); on.onPick(SHIPS[to].id) }
  }
  const step = (dir: number) => { if (phase === 'design' && decides()) select((swap ? swap.to : index) + dir, true) }

  function setTab(tab: string) {
    design.dataset.tab = tab
    $$('.lf-tabs button', s).forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)))
  }

  // ------------------------------------------------------------------ launch
  function launchPressed() {
    if (phase !== 'design' || swap) return
    const go = $('#go', checkPanel) as HTMLButtonElement
    if (go.disabled) return
    sound.play('ui')
    d.callSign = cleanCallSign(input.value)
    d.ship = current().id
    on.onLaunch(snapshot())
    startCount()
  }

  function startCount() {
    helpOpen = false
    pilotPop.classList.add('hidden')
    result.classList.add('hidden')
    attempts++
    phase = 'count'
    t0 = performance.now()
    lastTick = COUNT_FROM + 1
    ignited = false; liftSaid = false; stagedSaid = false
    sim = null; trail = []; bank = 0; throttle = 1; boomAt = -1; orbitK = 0; lastResult = null
    poseWas = poseNow = null; pace = 1; turnEase = 0; thrustShown = 0; shakeShown = 0
    held.left = held.right = held.up = held.down = false
    const ship = current()
    $('#countk', s).textContent = `${ship.name} · ${cleanCallSign(input.value)}${attempts > 1 ? ` · launch ${attempts}` : ''}`
    $('#countn', s).textContent = ''
    $('#t1', s).textContent = STAGES[ship.id][0]
    $('#t2', s).textContent = STAGES[ship.id][2]
    $('#goal', s).innerHTML = `Target orbit: low point above <b>${km(PERI_MIN)} km</b> · high point above <b>${km(APO_MIN)} km</b> · the station flies at <b>${km(PLANET.targetAlt)} km</b>`
    $('#ph', s).textContent = assist ? 'Guidance has the controls' : 'Stand by'
    s.classList.add('lf-ready', 'lf-launching')
    s.classList.remove('lf-flying', 'lf-orbit')
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  }

  function controls(): Controls {
    if (assist && sim) return guidanceControls(sim)
    // divided by the pace, so the nose swings as fast on the screen in the second stage as in the first
    return { turn: turnEase / pace, throttle }
  }

  function endFlight() {
    if (!sim) return
    const r = lastResult = resultOf(sim)
    endedAt = performance.now()
    const ship = current()
    if (r.outcome === 'orbit') {
      phase = 'orbit'
      t0 = endedAt
      sound.play('success')
      s.classList.add('lf-orbit')
      const o = orbitOf(sim)
      $('#ph', s).textContent = `Orbit · ${km(o.peri)} by ${km(o.apo)} km · ${r.marginPct.toFixed(0)}% propellant left`
      return
    }
    phase = 'result'
    failures.push(r.outcome)
    sound.play('fail')
    const blast = r.outcome === 'breakup' || r.outcome === 'crash'
    if (blast) boomAt = (endedAt - born) / 1000
    const why = failureCauses(ship, loadout(), r)
    const heavy = designForecast(ship, loadout()).outcome !== 'orbit'
    setTimeout(() => {
      if (phase !== 'result' || !s.isConnected) return
      result.innerHTML = `<div class="lf-result-card">
        <div class="lf-k"><span>Mission failed at launch</span><em>launch ${attempts}</em></div>
        <h2>${esc(why.headline)}</h2>
        <ul>${why.parts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        <p class="lf-result-note">${MODEL}${ESCAPE[ship.id]} The mission cannot go on until a launch reaches orbit.</p>
        <div class="actions">
          ${heavy ? '' : '<button class="btn primary" id="again">Fly it again</button>'}
          <button class="btn ${heavy ? 'primary' : ''}" id="redo">Change the design</button>
          ${!heavy && failures.length >= 2 ? '<button class="btn" id="assist">Let the guidance fly it</button>' : ''}
        </div></div>`
      result.classList.remove('hidden')
      $('#again', result)?.addEventListener('click', () => { sound.play('ui'); assist = false; startCount() })
      $('#assist', result)?.addEventListener('click', () => { sound.play('ui'); assist = true; startCount() })
      $('#redo', result).addEventListener('click', () => { sound.play('ui'); backToDesign() })
      ;($('.btn', result) as HTMLElement).focus()
    }, blast ? 1500 : 900)
  }

  function backToDesign() {
    result.classList.add('hidden')
    phase = 'design'
    sim = null; boomAt = -1; assist = false
    s.classList.remove('lf-launching', 'lf-flying', 'lf-orbit')
    render()
  }

  function dock() {
    if (phase === 'over' || !lastResult) return
    phase = 'over'
    cancelAnimationFrame(raf)
    const ship = current()
    const rec: LaunchRecord = {
      attempts, failures: [...failures], cargoKg: cargoKg(loadout()), marginPct: lastResult.marginPct,
      forecastPct: designForecast(ship, loadout()).marginPct, seconds: lastResult.seconds, assisted: assist,
    }
    on.onDone(snapshot(), rec, filmAt > 0)
  }

  // ------------------------------------------------------------------ the docking film
  function startFilm(now: number) {
    phase = 'film'
    filmAt = now
    skipAt = 0; touched = false; filmBeat = ''; filmRange = ''
    s.classList.add('lf-film-on')
    skipBtn.hidden = false
    $('#ph', s).textContent = 'Docking with the station'
  }
  /** The player does not want to watch: the picture dips out and the station follows at once. */
  function skipFilm() {
    if (phase === 'orbit' && filmed) startFilm(performance.now())
    if (phase !== 'film' || skipAt) return
    skipAt = performance.now()
    skipBtn.hidden = true
  }
  const BEATS: Record<DockShot['beat'], [string, string]> = {
    approach: ['Outside view', 'Closing on the station'], final: ['Docking camera', 'Final approach'],
    contact: ['Docking camera', 'Contact and capture'], hatch: ['Docking camera', 'Hatch open'],
  }
  /** The film's caption, touched only when what it says changes. */
  function filmText(shot: DockShot) {
    if (shot.beat !== filmBeat) {
      filmBeat = shot.beat
      $('#filmk', s).textContent = BEATS[shot.beat][0]
      $('#filmt', s).textContent = BEATS[shot.beat][1]
      s.classList.toggle('lf-film-nose', shot.beat === 'final' || shot.beat === 'contact')
    }
    const range = shot.beat === 'hatch' ? 'Welcome aboard' : `Range ${shot.gap < 10 ? shot.gap.toFixed(1) : Math.round(shot.gap)} m`
    if (range !== filmRange) $('#filmr', s).textContent = filmRange = range
  }

  // ------------------------------------------------------------------ every frame
  function hud(now: number) {
    if (!sim) return
    const ship = current(), v = VEHICLES[ship.id]
    drawMap(mapC, sim, trail)
    drawDial(dialC, sim)
    if (now - hudAt < 90) return
    hudAt = now
    const o = orbitOf(sim), h = altitude(sim)
    $('#r-alt', s).textContent = showAltKm(h) < 10 ? showAltKm(h).toFixed(1) : String(Math.round(showAltKm(h)))
    $('#r-spd', s).textContent = showSpeedKms(speed(sim)).toFixed(2)
    $('#r-apo', s).textContent = speed(sim) < 20 ? '—' : o.bound ? km(o.apo) : '∞'
    $('#r-peri', s).textContent = o.peri > 0 ? km(o.peri) : '—'
    $('#r-high', s).classList.toggle('ok', o.apo >= APO_MIN)
    $('#r-low', s).classList.toggle('ok', o.peri >= PERI_MIN)
    $('#f1', s).style.width = `${(sim.fuel1 / (v.mass * v.s1.fuel)) * 100}%`
    $('#f2', s).style.width = `${(sim.fuel2 / (v.mass * v.s2.fuel)) * 100}%`
    $('#th', s).style.width = `${sim.throttle * 100}%`
    const air = Math.exp(-Math.max(0, h) / PLANET.scaleHeight), sp = speed(sim)
    let load = 0
    if (sp > 20) {
      const cosA = Math.max(-1, Math.min(1, (Math.sin(sim.att) * sim.vx + Math.cos(sim.att) * sim.vy) / sp))
      load = (air * sp * sp * (cosA < 0 ? 1 : Math.sqrt(1 - cosA * cosA))) / v.loadLimit
    }
    const ld = $('#ld', s)
    ld.style.width = `${Math.min(100, load * 80)}%`
    ld.parentElement!.parentElement!.classList.toggle('hot', load > 0.7)
    const deg = (r: number) => Math.round((r * 180) / Math.PI)
    $('#dialtxt', s).innerHTML = `<span>Nose <b>${deg(pitch(sim))}°</b></span><span class="g">Guidance <b>${deg(guidance(sim))}°</b></span>`
    if (phase !== 'flight') return
    // what is happening, in a few words
    let text: string
    if (sim.status === 'pad') text = thrustToWeight(sim) > 1 ? 'Engines at full thrust' : 'Engines at full thrust · not lifting'
    else if (sim.stage === 1) text = sim.t - (sim.liftoffAt ?? 0) < 3 ? 'Lift-off' : STAGES[ship.id][0]
    else if (sim.gap > 0 || sim.t - (sim.stagedAt ?? 0) < 2.2) text = STAGES[ship.id][1]
    else text = sim.fuel2 <= 0 ? 'Propellant gone' : STAGES[ship.id][2]
    $('#ph', s).textContent = assist ? `${text} · guidance flying` : text
  }

  function arrive() {
    if (phase !== 'arrive') return
    phase = 'design'
    s.classList.add('lf-ready')
  }

  const ptr: [number, number] = [0, 0], ptrGoal: [number, number] = [0, 0]

  function frame(now: number) {
    if (!s.isConnected && now - born > 2500) return // the screen was replaced
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.1, (now - lastNow) / 1000)
    lastNow = now
    const time = (now - born) / 1000
    let descent = 0, ignite = 0
    ptr[0] += (ptrGoal[0] - ptr[0]) * Math.min(1, dt * 4); ptr[1] += (ptrGoal[1] - ptr[1]) * Math.min(1, dt * 4)

    if (phase === 'arrive') {
      const p = (now - t0) / DESCENT_MS
      if (p >= 1) arrive(); else descent = 1 - inOut(p)
    }
    if (swap) {
      // the lamps ease down, the stack changes in the dark, the lamps ease back up
      const t = now - swap.at
      if (!swap.done && t >= 240) { swap.done = true; index = swap.to; d.ship = current().id; render() }
      dim = t < 240 ? smooth(0, 240, t) : 1 - smooth(300, 760, t)
      if (t >= 760) { swap = null; dim = 0 }
    }
    if (phase === 'count') {
      const left = COUNT_FROM - (now - t0) / 1000
      const n = Math.ceil(left)
      if (n !== lastTick && n > 0) {
        lastTick = n
        $('#countn', s).textContent = `T−${n}`
        $('#countt', s).textContent = left <= IGNITION_AT ? 'Main engine start' : n === COUNT_FROM ? 'Go for launch' : 'All systems go'
        sound.play('count')
      }
      if (left <= IGNITION_AT && !ignited) { ignited = true; sound.play('ignite') }
      ignite = ignited ? clamp01((IGNITION_AT - left) / IGNITION_AT) * 0.75 : 0
      thrustShown = ignite
      if (left <= 0) {
        phase = 'flight'
        t0 = now
        sim = startAscent(current().id, cargoKg(loadout()))
        poseWas = poseNow = poseOf(sim)
        s.classList.add('lf-flying')
        $('#countn', s).textContent = ''
        $('#countt', s).textContent = ''
      }
    }
    // the camera glides toward where each part of the launch wants it, with no change of pace that shows
    const lifted = !!sim && sim.status !== 'pad' && phase !== 'design'
    const [chaseGoal, chaseTime] = designing() ? [0, 0.4] : lifted ? [1, 1.05] : [0.2, 1.7]
    ;[chase, chaseV] = glide(chase, chaseGoal, chaseV, chaseTime, dt)

    if (phase === 'flight' && sim) {
      if (held.up) throttle = Math.min(1, throttle + dt * 0.8)
      if (held.down) throttle = Math.max(0, throttle - dt * 0.8)
      turnEase += ((held.right ? 1 : 0) - (held.left ? 1 : 0) - turnEase) * Math.min(1, dt * 11)
      pace += ((sim.stage === 2 ? STAGE2_PACE : 1) - pace) * Math.min(1, dt * 0.9)
      bank += dt * warp * pace
      let n = 0
      while (bank >= DT && (sim.status === 'pad' || sim.status === 'flying') && n++ < 600) {
        poseWas = poseNow
        stepAscent(sim, controls())
        poseNow = poseOf(sim)
        bank -= DT
        if (sim.status === 'flying' && Math.round(sim.t / DT) % 12 === 0) trail.push([Math.atan2(sim.x, sim.y), altitude(sim)])
      }
      if (sim.status === 'flying' && !liftSaid) { liftSaid = true; sound.play('launch') }
      if (sim.stage === 2 && !stagedSaid) { stagedSaid = true; stagedReal = now; sound.play('alert') }
      if (sim.status === 'orbit' || sim.status === 'failed') endFlight()
    }
    if (phase === 'orbit') {
      const t = (now - t0) / 1000
      orbitK = smooth(0, 2.6, t)
      if (filmed) {
        // a moment to read the orbit, then the picture dips to black and the docking film opens out of it
        veil.style.opacity = String(smooth(1.35, 1.85, t))
        if (t >= 1.9) startFilm(now)
      } else {
        station.style.opacity = String(smooth(0.9, 2.2, t))
        station.style.transform = `translate(-50%, -50%) scale(${(0.06 + 1.5 * inOut(clamp01((t - 0.9) / 3.4))).toFixed(3)})`
        veil.style.opacity = String(smooth(3.3, 4.2, t))
        if (t > 4.3) return dock()
      }
    }
    let shot: DockShot | null = null, filmT = 0
    if (phase === 'film') {
      filmT = filmHold ?? (now - filmAt) / 1000
      shot = dockShot(filmT, FRAMING[current().id], window.innerWidth / Math.max(1, window.innerHeight))
      const out = skipAt ? smooth(0, 300, now - skipAt) : 0
      veil.style.opacity = String(Math.max(shot.black, out))
      white.style.opacity = String(shot.white * (1 - out))
      filmText(shot)
      if (!touched && filmT >= CONTACT && !skipAt) { touched = true; sound.play('dock') }
      if (filmHold === null && (skipAt ? now - skipAt > 320 : filmT >= DOCK_SECONDS)) return dock()
    }
    if (sim && phase !== 'design' && phase !== 'film') hud(now)

    // ---- the scene
    if (!scene) return
    const st: SceneState = {
      time: still && designing() ? 20 : time, ship: current().id, dim, descent, chase,
      ptr: still ? [0, 0] : ptr, shiftY: narrowLayout() ? (designing() ? 0.47 : 0.14) : 0,
      ignite, flight: null, orbit: orbitK, boom: boomAt < 0 ? -1 : time - boomAt,
      // the ground goes by below at the pace of a real orbit
      dock: shot ? { ship: current().id, shot, alt: showAltM(PLANET.targetAlt), range: rangeNow + 7600 * filmT } : null,
    }
    if (sim) {
      const live = sim.status === 'pad' || sim.status === 'flying'
      // between the last two steps of the model, by the share of a step still owed
      const a = poseNow ?? poseOf(sim), b = live && poseWas ? poseWas : a, k = live ? clamp01(bank / DT) : 1
      const h = b.h + (a.h - b.h) * k, ang = b.ang + (a.ang - b.ang) * k, sp = b.speed + (a.speed - b.speed) * k
      const burning = live && sim.gap <= 0 && (sim.stage === 1 ? sim.fuel1 > 0 : sim.fuel2 > 0)
      const alt = showAltM(h)
      const q = Math.exp(-Math.max(0, h) / PLANET.scaleHeight) * sp ** 2
      const ease = Math.min(1, dt * 7)
      thrustShown += ((burning ? sim.throttle : 0) - thrustShown) * ease
      shakeShown += ((still ? 0 : Math.min(1, q / 5200) * 0.8 + (burning && h < 400 ? 0.3 : 0)) - shakeShown) * ease
      rangeNow = ang * PLANET.radius * (1 + 30 * (Math.max(0, h) / PLANET.targetAlt) ** 1.5)
      st.flight = {
        alt, range: rangeNow, pitch: b.pitch + (a.pitch - b.pitch) * k,
        thrust: thrustShown < 0.004 ? 0 : thrustShown, stage: sim.stage,
        sinceStaging: sim.stagedAt === null ? -1 : (now - stagedReal) / 1000, // real seconds, so the spent stage falls away at its own pace
        air: Math.exp(-alt / 8500), shake: shakeShown,
      }
    }
    scene.draw(st)
  }

  // ------------------------------------------------------------------ events
  const move = (e: PointerEvent) => {
    if (!s.isConnected) return window.removeEventListener('pointermove', move)
    ptrGoal[0] = (e.clientX / window.innerWidth) * 2 - 1; ptrGoal[1] = (e.clientY / window.innerHeight) * 2 - 1
  }
  if (!still && !touch) window.addEventListener('pointermove', move, { passive: true })

  $('#back', s).addEventListener('click', () => { if (designing()) on.onBack() })
  $$('.lf-tabs button', s).forEach(b => b.addEventListener('click', () => { setTab(b.dataset.tab!); sound.play('ui') }))
  $('#pilot', s).addEventListener('click', () => {
    if (phase !== 'design') return
    pilotPop.classList.toggle('hidden')
    sound.play('ui')
    if (!pilotPop.classList.contains('hidden')) input.focus()
  })
  $('#pilotx', s).addEventListener('click', () => { pilotPop.classList.add('hidden'); $('#pilot', s).focus() })
  $$('.suit-opt', s).forEach(b => b.addEventListener('click', () => { d.suit = b.dataset.id as SuitId; sound.play('ui'); changed() }))
  $('.suits', s).addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.stopPropagation()
    const i = SUITS.findIndex(x => x.id === d.suit)
    d.suit = SUITS[(i + (e.key === 'ArrowRight' ? 1 : SUITS.length - 1)) % SUITS.length].id
    changed()
    $(`.suit-opt[data-id=${d.suit}]`, s).focus()
  })
  input.addEventListener('input', () => { d.callSign = cleanCallSign(input.value); changed() })
  input.addEventListener('keydown', e => {
    e.stopPropagation()
    if (e.key === 'Enter' || e.key === 'Escape') { pilotPop.classList.add('hidden'); $('#pilot', s).focus() }
  })

  const FLY: Record<string, keyof typeof held> = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' }
  const keyDown = (e: KeyboardEvent) => {
    if (!s.isConnected) return window.removeEventListener('keydown', keyDown)
    if (phase === 'flight' || phase === 'count') {
      const k = FLY[e.key]
      if (k) { held[k] = true; e.preventDefault() }
      if (e.key === 'x' || e.key === 'X') throttle = 0
      if (e.key === 'z' || e.key === 'Z') throttle = 1
      return
    }
    if (phase === 'orbit' || phase === 'film') {
      if (!e.repeat && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); skipFilm() }
      return
    }
    if (e.repeat) return
    if (phase === 'arrive') return arrive()
    if (phase !== 'design') return
    if (e.key === 'Escape') {
      if (!pilotPop.classList.contains('hidden')) pilotPop.classList.add('hidden')
      else if (helpOpen) { helpOpen = false; render() }
      return
    }
    if (e.key === 'ArrowLeft') step(-1)
    if (e.key === 'ArrowRight') step(1)
    if (e.key === '?' || e.key === 'i' || e.key === 'I') { helpOpen = !helpOpen; render() }
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') launchPressed()
  }
  const keyUp = (e: KeyboardEvent) => {
    if (!s.isConnected) return window.removeEventListener('keyup', keyUp)
    const k = FLY[e.key]
    if (k) held[k] = false
  }
  window.addEventListener('keydown', keyDown)
  window.addEventListener('keyup', keyUp)
  $$('.lf-touch button', s).forEach(b => {
    const k = b.dataset.key as keyof typeof held
    const set = (v: boolean) => (e: Event) => { e.preventDefault(); held[k] = v; b.classList.toggle('on', v) }
    b.addEventListener('pointerdown', set(true)); b.addEventListener('pointerup', set(false)); b.addEventListener('pointercancel', set(false)); b.addEventListener('pointerleave', set(false))
  })
  skipBtn.addEventListener('click', () => { sound.play('ui'); skipFilm() })
  s.addEventListener('pointerdown', () => arrive())
  // swipe the stack sideways to change it
  let swipe: { x: number; y: number } | null = null
  $('#scene', s).addEventListener('pointerdown', e => { swipe = { x: e.clientX, y: e.clientY } })
  $('#scene', s).addEventListener('pointercancel', () => { swipe = null })
  const lift = (e: PointerEvent) => {
    if (!s.isConnected) return window.removeEventListener('pointerup', lift)
    if (!swipe) return
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y
    swipe = null
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1)
  }
  window.addEventListener('pointerup', lift)

  // ------------------------------------------------------------------ start
  const hostShip = link.role() === 'guest' ? link.hostShip() : null
  if (hostShip) index = Math.max(0, SHIPS.findIndex(x => x.id === hostShip))
  d.ship = current().id
  scene?.prepare(current().id)
  if (phase === 'design') s.classList.add('lf-ready')
  setTab('rocket')
  render()
  raf = requestAnimationFrame(now => { t0 = now; lastNow = now; frame(now) })

  return {
    el: s,
    ship: () => (swap ? SHIPS[swap.to].id : current().id),
    update() {
      if (!designing()) return
      const want = link.role() === 'guest' ? link.hostShip() : null
      const i = want ? SHIPS.findIndex(x => x.id === want) : -1
      if (i >= 0 && i !== (swap ? swap.to : index)) select(i, false)
      else render()
    },
    autopilot(on_: boolean) { assist = on_ },
    warp(steps: number) { warp = Math.max(1, Math.min(20, steps)) },
    state: () => ({
      phase, ship: current().id, loadout: loadout(), cost: designCost(current(), loadout()), cargoKg: cargoKg(loadout()),
      verdict: designForecast(current(), loadout()).verdict, block: designBlock(current(), loadout()), attempts, failures: [...failures], assist, result: lastResult,
      sim: sim && { status: sim.status, failure: sim.failure, t: sim.t, alt: altitude(sim), speed: speed(sim), pitch: pitch(sim), guide: guidance(sim), stage: sim.stage, fuel2: sim.fuel2 },
      stats: scene?.stats() ?? null,
    }),
    film(seconds: number | null) {
      filmHold = seconds
      if (seconds === null || !scene || phase === 'film') return
      swap = null; dim = 0
      s.classList.add('lf-ready', 'lf-launching', 'lf-flying')
      startFilm(performance.now())
    },
  }
}
