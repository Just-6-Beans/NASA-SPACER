// Rover operations. First the player chooses one rover for the whole mission, then the rocket
// that carries it (rocketPick.ts). Then, on a real map: tap points for it to drive to, start the
// deployment and watch it drive (a real drive film on its camera; it saves a real photo by itself
// at each real photo spot it passes), run tests at the spot, read the verdict, and build the base
// there or explore on. A low battery can be recharged, which uses up some of the mission's Mars
// days: it runs on a real countdown that carries on while the player is back at the station.
//
// Two tasks interrupt the drive (roverTasks.ts): wheel trouble, which stops the rover until the
// pilot frees it, and the sample selection, which opens when the rover reaches a sample site.
//
// The battery is shown as one percentage: 100 % is full and 0 % is NASA's safe-mode line.
import '../rover.css'
import '../survey.css'
import type { Mission, SpotReport } from '../core/mission'
import { WEAR_LIMIT } from '../core/rescue'
import { mmrtgNowW, type RoverSpec } from '../core/rovers'
import { SAMPLE_RANGE_M, TUBE_COUNT } from '../core/samples'
import {
  BASE_LOAD_W, MAX_WAYPOINTS, MISSION_SOLS, PHOTO_BONUS_EACH, PHOTO_BONUS_MAX, RESERVE_FRACTION, SOL_HOURS, TESTS, TEST_ORDER, climbWhPerM, costPct, rechargeW, region,
  reserveWh, spendPct,
  type ActionKind, type Bar, type DriveResult, type Pt, type TestId,
} from '../core/survey'
import { WATER_BONUS } from '../core/mission'
import { sound } from '../audio'
import { $, $$, el, esc, reducedMotion, toast } from './dom'
import { ICONS } from './icons'
import { pin, toPx } from './mapView'
import { rocketPick } from './rocketPick'
import { applyView, captureFrame, flash, newViewer, renderViewer, showActionParts } from './roverPanels'
import { RESCUE_INTRO, SAMPLE_INTRO, rescueOverlay, sampleOverlay, taskIntro } from './roverTasks'
import { stationIntro } from './stationTasks'
import { DUST_SPEED } from '../core/mission'

export interface RoverCtx {
  m: Mission
  /** Checks with the co-op crew, then deploys. Returns an error or null. */
  transmit: () => Promise<string | null>
  back: () => void
  report: () => void
  refresh: () => void
}

const TEST_ICON: Record<TestId, string> = { photo: ICONS.scan, weather: ICONS.sun, radiation: ICONS.signal, drill: ICONS.flask }
const TEST_FOR: Record<TestId, string> = { photo: 'Slope', weather: 'Sun and warmth', radiation: 'Radiation', drill: 'Rock samples' }
const colour = (score: number | null) => score === null ? 'transparent' : score >= 66 ? 'var(--mint)' : score >= 40 ? 'var(--warn)' : 'var(--danger)'
const rating = (score: number | null) => score === null ? ['Not measured', 'none'] : score >= 66 ? ['Great', 'great'] : score >= 40 ? ['OK', 'ok'] : ['Poor', 'poor']
const f1 = (n: number) => (Math.round(n * 10) / 10).toString()
/** A countdown as minutes and seconds, for example "0:23". */
const clock = (ms: number) => { const sec = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` }
/** A length of time in the words the player sees: hours when short, Mars days when long. */
const span = (hours: number) => hours < 20 ? `${f1(hours)} h` : `${f1(hours / SOL_HOURS)} Mars days`
/** MODEL: the Recharge button appears once the gauge is at or below this (the battery "starts emptying"). */
const RECHARGE_OFFER_PCT = 50
const RISK_WORD = { low: 'Low', medium: 'Medium', high: 'High' }

/** The six checks as bars. Tap one to see its reading and where the number comes from. */
export function barsHtml(bars: Bar[], fresh: string[] = []) {
  return `<div class="bars">${bars.map(b => {
    const [word, cls] = rating(b.score)
    return `<details class="sbar ${b.score === null ? 'empty' : ''} ${fresh.includes(b.id) ? 'pop' : ''}">
    <summary><span class="bn">${esc(b.name)}${b.shared ? '<em>region</em>' : ''}</span><span class="br ${cls}">${word}</span><span class="bv">${b.score ?? '–'}</span>
      <span class="track"><i style="width:${b.score ?? 0}%;background:${colour(b.score)}"></i></span></summary>
    <div class="why"><p class="bd">${esc(b.value)}</p><p><b>Real data:</b> ${esc(b.real)}</p><p><b>Source:</b> ${esc(b.source)}</p><p><b>Our scoring:</b> ${esc(b.model)}</p></div></details>`
  }).join('')}</div>`
}
export const starsHtml = (n: number) => `<span class="stars" aria-label="${n} of 3 stars">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</span>`
const VERDICT_WORD = { good: 'Good place', risky: 'Risky place', bad: 'Bad place', unknown: 'Not checked yet' }

/** One big answer with one plain sentence under it. */
export function verdictHtml(r: SpotReport) {
  const v = r.verdict
  const sentence = v.title.includes(': ') ? v.title.slice(v.title.indexOf(': ') + 2) : v.title
  return `<div class="verdictbox ${v.level}"><div class="vtop"><div><b>${VERDICT_WORD[v.level]}</b><p>${esc(sentence[0].toUpperCase() + sentence.slice(1))}.</p></div><div class="vscore"><b>${r.score}</b><small>of 100</small></div></div></div>`
}

export function roverScreen(ctx: RoverCtx) {
  const m = ctx.m
  const s = el(`<section class="screen rover" aria-label="Rover operations">
    <header class="rv-head"><div class="brand">SPACER<i>///</i></div><div class="sect" id="sect">ROVER OPERATIONS</div><div class="wearchip" id="wearchip"></div><div class="daychip" id="daychip"></div><div class="batt" id="batt"></div></header>
    <div class="viewer"></div>
    <aside class="side" aria-live="polite"></aside>
  </section>`)
  const side = $('.side', s)
  const viewer = $('.viewer', s)
  const v = newViewer()
  let busy = false
  let msg: { text: string; kind: string } | null = null
  let panel: 'drive' | 'spot' | 'choose' = 'drive'
  let fresh: string[] = []
  let confirmBuild = false
  /** The player pressed Recharge and is being asked to confirm. */
  let askCharge = false
  /** A deployment being played back on the map. */
  let play: { drive: DriveResult; path: Pt[]; total: number; pos: Pt; trail: Pt[]; wh: number; t0: number; ms: number; timer: number; cueAt: number; shown: number } | null = null
  /** Keeps the recharge countdown on screen up to date. The countdown itself lives in the mission, so it carries on while the player is at the station. */
  let chargeTimer = 0
  /** The rocket choice, while the rover has no rocket yet. */
  let pick: ReturnType<typeof rocketPick> | null = null
  /** A task laid over the screen: its pop-up, the rescue, or the sample selection. */
  let task: HTMLElement | null = null

  const planning = () => !play && !!m.rover && !!m.delivery && !m.base && panel === 'drive' && m.canDrive
  const focusSpot = () => m.spots.find(x => x.id === v.focus) ?? m.spotHere
  const set = (id: string, text: string) => { const e = $(id, side); if (e) e.textContent = text }
  const width = (id: string, pct: number) => { const e = $(id, side); if (e) e.style.width = `${pct}%` }

  function drawViewer() {
    renderViewer(viewer, m, v, drawViewer, {
      planning: planning(),
      driving: !!play,
      anim: play ? { pos: play.pos, trail: play.trail, drive: play.drive } : null,
      pos: play ? play.pos : m.pos,
      addPoint: p => {
        const e = m.addWaypoint(p)
        if (e) { toast(e, 'warn'); sound.play('fail') } else sound.play('ui')
        msg = null
        render()
      },
      pickSpot: id => { if (play || m.charging) return; v.focus = id; panel = 'spot'; confirmBuild = false; askCharge = false; msg = null; sound.play('ui'); render() },
      chooseRover: id => {
        const err = m.chooseRover(id)
        if (err) { toast(err, 'bad'); sound.play('fail'); return }
        msg = null
        panel = 'drive'
        v.tab = 'map'
        v.focus = null
        v.pick = null; v.peek = null
        v.highlight = []; v.highlightJob = null; v.part = null
        viewer.scrollTop = 0
        sound.play('success')
        render()
      },
      back: () => ctx.back(),
      // Photo spots this drive will pass but has not reached yet stay hidden until the rover gets there.
      pending: play ? play.drive.photos.slice(play.shown).map(x => x.place) : [],
    })
  }

  /** Battery in the top bar. */
  function battery(wh: number) {
    const rv = m.rover
    const bt = $('#batt', s)
    if (!rv) { bt.innerHTML = ''; return }
    const pct = spendPct(rv, wh)
    bt.className = `batt ${pct <= 15 ? 'low' : ''}`
    bt.innerHTML = `${play ? '<span class="rec on"></span>' : ''}<span class="bcell"><i style="width:${pct}%"></i></span>${m.charging ? 'Charging' : 'Battery'} ${pct}%`
    bt.title = `${Math.round(wh)} Wh of ${rv.batteryWh} Wh. 0 % is the safe-mode line at ${reserveWh(rv)} Wh.`
  }
  /** Mission day and wheel wear in the top bar. */
  function days(hoursUsed: number) {
    const dc = $('#daychip', s), wc = $('#wearchip', s)
    if (!m.rover) { dc.innerHTML = ''; wc.innerHTML = ''; return }
    const left = Math.max(0, m.missionSols - hoursUsed / SOL_HOURS)
    dc.className = `daychip ${left <= 2 ? 'low' : ''}`
    dc.textContent = `Day ${Math.min(m.missionSols, Math.floor(hoursUsed / SOL_HOURS) + 1)} of ${m.missionSols}`
    dc.title = `${f1(left)} Mars days left. Driving, recharging and a stuck rover use them up.`
    wc.className = `wearchip ${m.wheelsWorn ? 'low' : ''}`
    wc.textContent = m.wheelWear ? `Wheels ${m.wheelWear}% worn` : ''
    wc.title = m.wheelsWorn ? `Past the ${WEAR_LIMIT}% limit: the rover drives slower for the rest of the mission (our model).` : `Wheel wear. Past ${WEAR_LIMIT}% the rover drives slower (our model).`
  }

  /** The Recharge button, or the question it leads to. Shown once the battery starts emptying. */
  function rechargeHtml(force = false) {
    const rv = m.rover!
    if (m.rechargeBlock()) return ''
    if (!force && spendPct(rv, m.batteryWh) > RECHARGE_OFFER_PCT && !m.stranded && m.canDrive) return ''
    const plan = m.rechargePlan()!
    if (!askCharge) return `<button class="btn charge" id="askcharge">Recharge<small>${span(plan.hours)} on Mars · ${clock(plan.realMs)} on the timer</small></button>`
    return `<div class="reason"><b>Recharge now?</b> ${plan.full
      ? `It takes <b>${span(plan.hours)}</b> of your ${f1(m.solsLeft)} Mars days.`
      : `Only ${span(plan.hours)} are left, so it stops at <b>${spendPct(rv, plan.toWh)}%</b>.`} You can go back to the station meanwhile.</div>
      <div class="row2"><button class="btn" id="nocharge">Not now</button><button class="btn primary" id="yescharge">Recharge</button></div>`
  }

  /** Battery and Mars days at the top of the side panel, with what a planned drive would leave. */
  function statusBlk(rv: RoverSpec, afterWh: number | null, afterHours: number | null, forceCharge = false) {
    const now = spendPct(rv, m.batteryWh)
    const after = afterWh === null ? now : spendPct(rv, afterWh)
    const left = m.solsLeft
    const leftAfter = afterHours === null ? left : Math.max(0, left - afterHours / SOL_HOURS)
    return `<div class="blk status">
      <div class="stat"><span>Battery</span><b class="${after <= 15 ? 'low' : ''}">${afterWh === null ? `${now}%` : `${now} → ${after}%`}</b>
        <div class="gauge" role="img" aria-label="Battery ${now} percent${afterWh === null ? '' : `, ${after} percent after the drive`}"><i class="now" style="width:${now}%"></i><i class="after ${after <= 15 ? 'low' : ''}" style="width:${after}%"></i></div></div>
      <div class="stat"><span>Mars days left</span><b class="${leftAfter <= 2 ? 'low' : ''}">${afterHours === null ? f1(left) : `${f1(left)} → ${f1(leftAfter)}`}</b>
        <div class="gauge" role="img" aria-label="${f1(left)} of ${m.missionSols} Mars days left"><i class="now" style="width:${(left / MISSION_SOLS) * 100}%"></i><i class="after sun ${leftAfter <= 2 ? 'low' : ''}" style="width:${(leftAfter / MISSION_SOLS) * 100}%"></i></div></div>
      ${rechargeHtml(forceCharge)}</div>`
  }

  function render() {
    const rv = m.rover
    s.classList.toggle('choosing', !rv)
    $('#sect', s).textContent = rv ? `${rv.name.toUpperCase()} · ${region(m.region!).name.toUpperCase()}` : 'CHOOSE YOUR ROVER'
    // The rover needs a rocket before anything else: the launch pad takes over the screen.
    if (rv && !m.delivery) {
      if (!pick) {
        pick = rocketPick({ m, back: () => ctx.back(), done: () => { pick?.stop(); pick?.el.remove(); pick = null; arrived() } })
        s.append(pick.el)
      }
    } else if (pick) { pick.stop(); pick.el.remove(); pick = null }
    // A recharge runs on real time: catch up with it first, in case the player was at the station.
    if (m.charging && m.syncRecharge(Date.now())) chargeDone(false)
    battery(play ? play.wh : m.batteryWh)
    days(m.hoursUsed)
    const spot = focusSpot()
    side.innerHTML = !rv ? '' : play ? drivingHtml() : m.charging ? chargingHtml(rv) : m.base ? doneHtml() : panel === 'choose' ? chooseHtml() : panel === 'spot' && spot ? spotHtml(rv, m.report(spot)) : driveHtml(rv)
    fresh = []
    bind()
    drawViewer()
    ctx.refresh()
    if (m.charging) chargeTick()
    // Wheel trouble does not wait: coming back to the screen with a stuck rover reopens the rescue.
    if (m.stuck && !play && !task) openRescue(false)
  }

  /** The rover has just reached Mars. */
  function arrived() {
    const rv = m.rover!
    toast(m.delivery!.ok ? `${rv.name} is on Mars. Tap the map to plan its first drive.` : `A backup ${rv.name} is on Mars. ${m.delivery!.solsLost} Mars days were lost.`, m.delivery!.ok ? 'ok' : 'warn', 5000)
    render()
  }

  const head = (title: string) => `<div class="side-h"><h2>${title}</h2><button class="btn small" id="back">← Station</button></div>`
  const timeUpHtml = () => m.timeUp ? `<div class="reason bad"><b>The ${m.missionSols} Mars days are over.</b> Build on a spot you visited, or stay in orbit.</div>` : ''

  /** Score that `n` more photo spots would add, given the bonus stops at its maximum. */
  const gain = (n: number) => Math.min(PHOTO_BONUS_MAX, (m.photos.length + n) * PHOTO_BONUS_EACH) - m.photoBonus

  // ---------------------------------------------------------------- Tasks laid over the screen
  function closeTask() {
    task?.remove()
    task = null
  }
  /** The stuck-rover rescue: its pop-up the first time, then the telemetry. */
  function openRescue(intro: boolean) {
    closeTask()
    const show = () => {
      closeTask()
      task = rescueOverlay({ m, close: () => { closeTask(); panel = 'spot'; v.focus = m.spotHere?.id ?? null; render() }, changed: () => { battery(m.batteryWh); days(m.hoursUsed) } }).el
      s.append(task)
    }
    if (intro && !m.drafts.rescueSeen) {
      m.drafts.rescueSeen = true
      sound.play('alert')
      task = taskIntro(RESCUE_INTRO, show)
      s.append(task)
    } else show()
  }
  /** The sample selection: its pop-up the first time, then the rocks. */
  function openSamples(intro: boolean) {
    closeTask()
    const show = () => {
      closeTask()
      task = sampleOverlay({ m, close: () => { closeTask(); render() }, changed: () => { battery(m.batteryWh); days(m.hoursUsed) } }).el
      s.append(task)
    }
    if (intro && !m.drafts.sampleSeen) {
      m.drafts.sampleSeen = true
      sound.play('telemetry')
      task = taskIntro(SAMPLE_INTRO, show)
      s.append(task)
    } else show()
  }

  // ---------------------------------------------------------------- Plan a drive
  function driveHtml(rv: RoverSpec) {
    const f = m.forecast()
    const block = m.deployBlock()
    const floor = reserveWh(rv)
    const here = m.spotHere
    const n = m.waypoints.length
    const risk = m.routeRisk()
    // The sample site this drive ends at, if it still has something for the tubes.
    const endSite = f && m.tubesLeft > 0 ? m.sampleSites.find(x => Math.hypot(f.end.x - x.x, f.end.y - x.y) <= SAMPLE_RANGE_M && m.rocksLeft(x).length) ?? null : null
    const rows = f ? f.legs.map((l, i) => {
      const last = i === n - 1 && !l.partial
      return `<div class="leg ${l.partial ? 'bad' : ''}"><span class="num">${last ? '⚑' : i + 1}</span><div><b>${l.partial ? `Stops after ${Math.round(l.distM)} m` : `${Math.round(l.distM)} m`}</b><small>${l.partial ? 'battery runs out' : `${l.climbM >= 1 ? `climbs ${Math.round(l.climbM)} m · ` : ''}${f1(l.hours)} h`}</small></div><em>−${costPct(rv, l.wh)}%</em></div>`
    }).join('') : ''
    const chips = [
      risk && !m.rescue ? `<span class="chip risk-${risk.level}" title="${esc(risk.why)}. Our model on real terrain: MOLA slopes and where the real rover parked.">Stuck risk · ${RISK_WORD[risk.level]}</span>` : '',
      f?.photos.length ? `<span class="chip photo" title="Real photo spots this drive passes">${f.photos.length} photo${f.photos.length > 1 ? 's' : ''}${gain(f.photos.length) ? ` · +${gain(f.photos.length)}` : ''}</span>` : '',
      endSite && !f!.safeMode ? `<span class="chip site">Ends at sample ${endSite.name.toLowerCase()}</span>` : '',
      m.dustActive ? `<span class="chip dust" title="Our model: in the storm the rover drives at ${Math.round(DUST_SPEED * 100)}% of its speed, so each metre costs more battery.">Dust storm · ${m.dustSolsLeft} d left</span>` : '',
    ].filter(Boolean).join('')
    // Why the button is greyed out, in plain words, right above it.
    const why = !n && m.canDrive ? null : block
    return `${head('Plan the drive')}
      ${timeUpHtml()}
      ${statusBlk(rv, f ? f.endWh : null, f ? f.hours : null, !!f?.safeMode)}
      <div class="blk"><div class="blk-h"><span>1 · Route</span><small>${n}/${MAX_WAYPOINTS} points</small></div>
        ${n ? `<div class="legs">${rows}</div>` : `<p class="hint">Tap the map. The last point <b>⚑</b> is where the rover stops.${m.tubesLeft > 0 ? ` <b class="sitekey">◆</b> marks the ${m.sampleSites.length} sample sites.` : ''}</p>`}
        ${chips ? `<div class="chips">${chips}</div>` : ''}
        ${risk && !m.rescue && risk.level !== 'low' ? `<p class="hint small">${esc(risk.why)}.</p>` : ''}
        ${m.dustActive ? `<p class="hint small dusthint">Dust storm: the rover sees less and drives slower, so each metre costs about ${Math.round((1 / DUST_SPEED - 1) * 100)}% more battery. It clears in about ${m.dustSolsLeft} Mars days. Recharging lets it pass.</p>` : ''}
        ${f?.safeMode ? `<div class="reason bad">Too far: the battery runs out ${f.distM} m along.</div>` : f && spendPct(rv, f.endWh) < 9 ? '<div class="reason">Almost nothing would be left for tests.</div>' : ''}
        ${n ? `<div class="row2"><button class="btn small" id="undo">Undo point</button><button class="btn small ghost" id="clear">Clear</button></div>` : ''}
      </div>
      <div class="blk"><div class="blk-h"><span>2 · Send</span></div>
        ${why ? `<div class="reason bad">${esc(why)}${/Communications|Life support/.test(why) ? ' Change it at the Power Grid.' : ''}</div>` : ''}
        <button class="btn primary huge" id="deploy" ${block || busy ? 'disabled' : ''}>${busy ? 'Checking with crew…' : 'Start deployment'}</button>
        ${msg ? `<div class="feedback ${msg.kind}">${esc(msg.text)}</div>` : ''}
      </div>
      <div class="row2 links">${here ? `<button class="btn small" id="tospot">Spot ${here.label}: tests</button>` : ''}${m.spots.length > 1 || m.timeUp ? '<button class="btn small" id="compare">My spots</button>' : ''}</div>
      <details class="about"><summary>How the battery and the days work</summary>
        <p>0% on the gauge is NASA's safety line: ${esc(rv.name)}'s battery stays above ${Math.round(RESERVE_FRACTION * 100)}% full (${floor} of ${rv.batteryWh} Wh).</p>
        <p>Driving needs about ${rv.driveW - (m.balanced ? 30 : 0) + BASE_LOAD_W} W. The nuclear power source (MMRTG) makes ${mmrtgNowW(rv)} W; the battery supplies the rest. Climbing costs ${f1(climbWhPerM(rv))} Wh a metre.</p>
        <p>Parked, the MMRTG puts about ${rechargeW(rv)} W into the battery: a full recharge takes ${span((rv.batteryWh - floor) / rechargeW(rv))}.</p>
        <p class="cam-credit">Real: battery size, the 40% rule, MMRTG power, driving under 200 W, top speed ${rv.topSpeedMh} m/h${m.dustActive ? ' (slowed by the dust storm, our model)' : m.wheelsWorn ? ' (slowed by worn wheels, our model)' : ''}, rover mass, map heights. Our model: the 30 W base load, test costs, stuck risk and the ${m.missionSols}-day limit.</p></details>`
  }

  // ---------------------------------------------------------------- While the rover drives
  function drivingHtml() {
    const d = play!.drive, rv = m.rover!
    return `<div class="side-h"><h2>Driving…</h2></div>
      <div class="blk"><div class="blk-h"><span>Distance</span><b><span id="lv-d">0</span> / ${d.distM} m</b></div>
        <div class="gauge"><i class="after" id="lv-bar" style="width:0%"></i></div>
        <p class="hint small">${f1(d.hours)} h for the real ${esc(rv.name)}, at ${rv.topSpeedMh} m/h.</p></div>
      <div class="blk"><div class="blk-h"><span>Battery</span><b id="lv-b">${spendPct(rv, d.startWh)}%</b></div><div class="gauge"><i class="after" id="lv-bb" style="width:${spendPct(rv, d.startWh)}%"></i></div></div>
      <div class="blk"><div class="blk-h"><span>Photos saved</span><b id="lv-p">${m.photos.length - d.photos.length + play!.shown}</b></div></div>
      <button class="btn huge" id="skip">Skip to the spot</button>`
  }

  // ---------------------------------------------------------------- While the battery recharges
  function chargingHtml(rv: RoverSpec) {
    const c = m.charging!
    const p = m.chargeProgress(Date.now())!
    const full = c.toWh >= rv.batteryWh
    return `<div class="side-h"><h2>Recharging…</h2><button class="btn small" id="back">← Station</button></div>
      <div class="blk chargeblk"><div class="chargesky" aria-hidden="true"><i class="sunmoon"></i></div>
        <div class="blk-h"><span>Battery</span><b id="ch-b">${spendPct(rv, p.wh)}%</b></div><div class="gauge"><i class="after" id="ch-bar" style="width:${spendPct(rv, p.wh)}%"></i></div>
        <div class="blk-h" style="margin-top:14px"><span>${full ? 'Full in' : 'Ends in'}</span><b id="ch-t">${clock(p.msLeft)}</b></div>
        <div class="blk-h" style="margin-top:14px"><span>Mars days left</span><b id="ch-d">${f1(m.solsLeft)}</b></div>
        <p class="hint small"><b id="ch-h">${f1(p.hoursLeft)}</b> more Mars hours at about ${rechargeW(rv)} W. One Mars hour each second. ${full ? '' : `It stops at ${spendPct(rv, c.toWh)}%: the days run out.`} The timer keeps running at the station.</p></div>
      <div class="row2"><button class="btn" id="stopcharge">Stop</button><button class="btn primary" id="skipcharge">Skip the wait</button></div>`
  }

  // ---------------------------------------------------------------- At a spot: tests and verdict
  function spotHtml(rv: RoverSpec, r: SpotReport) {
    const spot = r.spot
    const here = m.spotHere?.id === spot.id
    const done = m.testsFor(spot)
    const g = r.ground
    const left = spendPct(rv, m.batteryWh)
    const tests = TEST_ORDER.map(t => {
      const got = done.includes(t)
      const block = got ? null : m.testBlock(t)
      const cost = costPct(rv, m.testCost(t))
      const state = got ? '<span class="tdone">Done</span>'
        : block ? `<span class="tno">${/Needs/.test(block) ? `Needs ${cost}%` : /Safe mode/.test(block) ? 'Safe mode' : 'Not now'}</span>`
          : `<span class="tcost">−${cost}%</span>`
      return `<div class="test ${got ? 'done' : block ? 'off' : ''}"><button class="tbtn" data-test="${t}" ${got || block ? 'disabled' : ''} title="${esc(block ?? TESTS[t].verb)}">${TEST_ICON[t]}<b>${TESTS[t].name}</b><small>${TEST_FOR[t]}</small>${state}</button><button class="qmark" data-learn="${t}" aria-label="Which rover parts does ${TESTS[t].name} use?" title="Which rover parts does this use?">?</button></div>`
    }).join('')
    const stuck = !m.canDrive
    const canCharge = !m.rechargeBlock()
    const bonus = [m.photoBonus ? `+${m.photoBonus} photos` : '', m.completed.has('water') ? `+${WATER_BONUS} water purifier` : '', m.cargo('water') ? `+${m.cargo('water')} water tanks` : ''].filter(Boolean)
    // The sample site the rover stands at: the task, or what the tubes are worth so far.
    const siteHere = here ? m.siteHere : null
    const filled = TUBE_COUNT - m.tubesLeft
    const site = !siteHere ? '' : m.siteOpen
      ? `<div class="blk siteblk"><div class="blk-h"><span>Sample ${esc(siteHere.name.toLowerCase())}</span><small>${m.rocksLeft(siteHere).length} rock${m.rocksLeft(siteHere).length === 1 ? '' : 's'} · ${m.tubesLeft} tube${m.tubesLeft === 1 ? '' : 's'} left</small></div><button class="btn primary" id="samples">Inspect the rocks</button></div>`
      : `<div class="blk siteblk done"><div class="blk-h"><span>Sample ${esc(siteHere.name.toLowerCase())}</span><b>${m.samples?.value ?? 0}<small>/100</small></b></div><p class="hint small">${filled} of ${TUBE_COUNT} tubes sealed.${m.tubesLeft > 0 ? ' Nothing left to core here.' : ''}</p><button class="btn small" id="samples">See the tubes</button></div>`
    return `${head(`Spot ${spot.label}`)}
      ${timeUpHtml()}
      ${here && m.stranded ? '<div class="reason bad"><b>Safe mode.</b> The battery ran out on the way. Recharge to test or drive.</div>' : ''}
      ${verdictHtml(r)}
      <p class="srcline">${g.source === 'rover' ? `<span class="tag real">NASA data</span>Slope measured by the real ${esc(rv.name)}, sol ${g.sol}` : '<span class="tag real">NASA data</span>Slope from orbit (MOLA), less exact'}</p>
      ${site}
      ${here ? `<div class="blk"><div class="blk-h"><span>1 · Tests</span><b class="${left <= 15 ? 'low' : ''}">${left}%<small> battery</small></b></div><div class="tests">${tests}</div>${rechargeHtml()}</div>` : `<div class="reason">The rover is at spot ${m.spotHere?.label ?? '?'}. Drive back here to test.</div>`}
      <div class="blk"><div class="blk-h"><span>${here ? '2 · ' : ''}Six checks</span><small>tap for the source</small></div>${barsHtml(r.bars, fresh)}
        ${bonus.length ? `<p class="hint small">Bonus: ${bonus.join(' · ')}</p>` : ''}</div>
      ${msg ? `<div class="feedback ${msg.kind}">${esc(msg.text)}</div>` : ''}
      <div class="blk"><div class="blk-h"><span>${here ? '3 · ' : ''}Decide</span></div>
      ${confirmBuild ? `<div class="reason bad">${r.verdict.level === 'bad' ? 'A bad place.' : r.verdict.level === 'unknown' ? 'Not checked.' : 'A risky place.'} The base would score ${r.score} of 100. Build anyway?</div>
        <div class="row2"><button class="btn" id="nobuild">Keep looking</button><button class="btn primary" id="yesbuild">Build here</button></div>`
        : `<div class="row2"><button class="btn" id="explore" ${stuck ? 'disabled' : ''}>Explore on</button><button class="btn primary" id="build">Build the base</button></div>`}
      ${stuck && !confirmBuild && !m.timeUp && !m.stranded ? `<div class="reason">Battery too low to drive. ${canCharge ? 'Recharge, build here, or pick another spot.' : 'Build here, pick another spot, or stay in orbit.'}</div>` : ''}
      ${m.spots.length > 1 || stuck ? '<button class="btn small" id="compare" style="margin-top:10px">My spots</button>' : ''}</div>`
  }

  // ---------------------------------------------------------------- Compare spots
  function chooseHtml() {
    const rs = m.reports()
    return `${head('My spots')}
      ${timeUpHtml()}
      <div class="spotlist">${rs.map(r => `<button class="spotrow ${r.verdict.level}" data-open="${r.spot.id}"><b>${r.spot.label}</b><span>${VERDICT_WORD[r.verdict.level]}</span><em>${r.score}</em></button>`).join('')}</div>
      ${m.canDrive ? '' : rechargeHtml(true)}
      <div class="row2"><button class="btn" id="defer">Stay in orbit</button>${m.canDrive ? '<button class="btn primary" id="explore">Keep exploring</button>' : ''}</div>`
  }

  function doneHtml() {
    const b = m.base!
    const sentence = b.reason.includes(': ') ? b.reason.slice(b.reason.indexOf(': ') + 2) : b.reason
    return `<div class="side-h"><h2>${b.approved ? 'Base built' : 'No base built'}</h2></div>
      ${b.approved ? `<div class="bigstars">${starsHtml(b.stars)}</div>
        <div class="verdictbox ${b.level}"><div class="vtop"><div><b>${esc(b.name)}</b><p>${esc(sentence[0].toUpperCase() + sentence.slice(1))}.</p></div><div class="vscore"><b>${b.score}</b><small>of 100</small></div></div></div>`
        : '<div class="verdictbox unknown"><div class="vtop"><div><b>The crew stays in orbit</b><p>No base was built this time.</p></div></div></div>'}
      <button class="btn primary huge" id="report">Mission report →</button>`
  }

  // ---------------------------------------------------------------- Playback of a deployment
  function startPlayback(d: DriveResult) {
    const path = [d.start, ...d.legs.map(l => l.to)]
    const total = d.legs.reduce((a, l) => a + l.distM, 0) || 1
    // The longer the drive, the longer the film: about 22 m of driving per second, between 8 s and 70 s.
    const ms = Math.max(8000, Math.min(70000, (total / 22) * 1000)) * (reducedMotion() ? 0.3 : 1)
    play = { drive: d, path, total, pos: d.start, trail: [d.start], wh: d.startWh, t0: performance.now(), ms, timer: 0, cueAt: 0, shown: 0 }
    v.tab = 'map'
    v.feedIdx = 0
    viewer.scrollTop = 0
    render()
    // In a small window the camera can sit below the fold: bring it into view for the drive.
    viewer.querySelector('#feed-screen')?.scrollIntoView({ block: 'nearest' })
    tick()
  }
  // A timer, not requestAnimationFrame: frames stop in a hidden tab or pane, and the drive must still finish.
  function tick() {
    const p = play
    if (!p) return
    const rv = m.rover!
    const now = performance.now()
    const f = Math.min(1, (now - p.t0) / p.ms)
    const along = f * p.total
    let acc = 0, wh = p.drive.startWh, pos = p.path[0]
    const trail = [p.path[0]]
    for (const leg of p.drive.legs) {
      if (along >= acc + leg.distM) { acc += leg.distM; wh -= leg.wh; pos = leg.to; trail.push(leg.to); continue }
      const k = leg.distM ? (along - acc) / leg.distM : 1
      pos = { x: leg.from.x + (leg.to.x - leg.from.x) * k, y: leg.from.y + (leg.to.y - leg.from.y) * k }
      wh -= leg.wh * k
      trail.push(pos)
      break
    }
    p.pos = pos; p.trail = trail; p.wh = wh
    const q = toPx(rv, pos)
    // Zoomed in, the map follows the rover.
    if (v.view.k > 1) { v.view.cx = q.x; v.view.cy = q.y; applyView(viewer, v.view) }
    viewer.querySelector('#rv')?.setAttribute('transform', pin(q, v.view.k))
    viewer.querySelector('#trail')?.setAttribute('points', trail.map(t => { const a = toPx(rv, t); return `${a.x.toFixed(1)},${a.y.toFixed(1)}` }).join(' '))
    set('#lv-d', String(Math.round(along)))
    width('#lv-bar', f * 100)
    set('#lv-b', `${spendPct(rv, wh)}%`)
    width('#lv-bb', spendPct(rv, wh))
    battery(wh)
    const hud = $('#hud-d', viewer)
    if (hud) hud.textContent = `${Math.round(along)} m`
    // Each real photo spot is saved the moment the rover comes into its ring.
    let saved = 0
    while (p.shown < p.drive.photos.length && along >= p.drive.photos[p.shown].alongM) { p.shown++; saved++ }
    if (saved) photoSaved(saved)
    if (now - p.cueAt > 1500) { p.cueAt = now; sound.play('drive') }
    if (f >= 1) return finish()
    p.timer = window.setTimeout(tick, 33)
  }
  /** A real photo spot has just been passed: flash the camera, say so, and show it in the album and on the map. */
  function photoSaved(n: number) {
    const before = Math.min(PHOTO_BONUS_MAX, (m.photos.length - (play ? play.drive.photos.length - play.shown : 0) - n) * PHOTO_BONUS_EACH)
    const now = Math.min(PHOTO_BONUS_MAX, (m.photos.length - (play ? play.drive.photos.length - play.shown : 0)) * PHOTO_BONUS_EACH)
    sound.play('shutter')
    toast(now > before ? `${n > 1 ? `${n} real photos` : 'Real photo'} saved. +${now - before} score` : `${n > 1 ? `${n} real photos` : 'Real photo'} saved.`, 'ok', 3200)
    drawViewer()
    set('#lv-p', String(m.photos.length - (play ? play.drive.photos.length - play.shown : 0)))
    flash(viewer)
  }
  function finish() {
    if (!play) return
    clearTimeout(play.timer)
    const d = play.drive
    // Keep the picture the camera was showing when the rover stopped: it is what the camera shows
    // from now on, unless the rover has stopped at a real photo spot.
    const frame = captureFrame(viewer)
    if (frame) m.drafts.roverCam = { url: frame }
    const unseen = d.photos.length - play.shown
    play = null
    const spot = m.spotHere
    v.focus = spot?.id ?? null
    v.feedIdx = 0
    panel = 'spot'
    confirmBuild = false
    askCharge = false
    // Skipping the film still saves the photo spots the drive passed.
    if (unseen > 0) toast(`${unseen} real photo${unseen > 1 ? 's' : ''} saved on the way.`, 'ok', 3500)
    if (m.stuck) {
      // Wheel trouble: the alert takes over. render() would open the telemetry straight away, so the pop-up goes first.
      openRescue(true)
      render()
      return
    }
    sound.play(d.safeMode ? 'alert' : 'telemetry')
    if (d.safeMode) toast(`Safe mode: the battery ran out ${d.distM} m along.`, 'bad', 4500)
    else if (!m.siteOpen) toast(`Arrived at spot ${spot?.label}. Run tests.`, 'ok', 4000)
    if (m.timeUp) toast(`The ${m.missionSols} Mars days are over. Choose your base.`, 'warn', 5000)
    render()
    // Arriving at a sample site with coring still to do opens the sample selection.
    const samples = () => { if (!d.safeMode && m.siteOpen && !m.timeUp) openSamples(true) }
    // A dust storm that began on this drive is announced first.
    if (m.dustActive && !m.drafts.dustSeen) {
      m.drafts.dustSeen = true
      sound.play('alert')
      closeTask()
      task = stationIntro('dust', m, () => { closeTask(); render(); samples() })
      s.append(task)
    } else samples()
  }

  // ---------------------------------------------------------------- Recharging
  function startCharge() {
    const err = m.startRecharge(Date.now())
    askCharge = false
    if (err) { msg = { text: err, kind: 'bad' }; sound.play('fail'); render(); return }
    msg = null
    sound.play('charge')
    render()
  }
  /** Moves the countdown on. The mission works out the charge from the real time. */
  function chargeTick() {
    clearTimeout(chargeTimer)
    const rv = m.rover
    if (!rv || !m.charging) return
    const now = Date.now()
    if (m.syncRecharge(now)) { chargeDone(); return }
    const p = m.chargeProgress(now)!
    set('#ch-b', `${spendPct(rv, p.wh)}%`)
    width('#ch-bar', spendPct(rv, p.wh))
    set('#ch-t', clock(p.msLeft))
    set('#ch-h', f1(p.hoursLeft))
    set('#ch-d', f1(m.solsLeft))
    battery(m.batteryWh)
    days(m.hoursUsed)
    chargeTimer = window.setTimeout(chargeTick, reducedMotion() ? 1000 : 200)
  }
  /** The recharge has ended (finished, skipped or stopped): say where the battery is and carry on. */
  function chargeDone(redraw = true) {
    clearTimeout(chargeTimer)
    const rv = m.rover!
    sound.play('success')
    if (m.timeUp) { panel = 'choose'; toast(`Battery ${spendPct(rv, m.batteryWh)}%, but the ${m.missionSols} Mars days are over. Choose your base.`, 'warn', 5000) }
    else toast(`Battery ${spendPct(rv, m.batteryWh)}%. ${f1(m.solsLeft)} Mars days left.`, 'ok', 4000)
    if (redraw) render()
  }

  // ---------------------------------------------------------------- Events
  function bind() {
    $('#back', side)?.addEventListener('click', () => ctx.back())
    $('#undo', side)?.addEventListener('click', () => { m.undoWaypoint(); msg = null; render() })
    $('#clear', side)?.addEventListener('click', () => { m.clearWaypoints(); msg = null; render() })
    $('#tospot', side)?.addEventListener('click', () => { v.focus = m.spotHere?.id ?? null; panel = 'spot'; confirmBuild = false; askCharge = false; msg = null; render() })
    $('#deploy', side)?.addEventListener('click', async () => {
      busy = true; render()
      const err = await ctx.transmit()
      busy = false
      if (err) { sound.play('fail'); msg = { text: err, kind: 'bad' }; render(); return }
      msg = null
      askCharge = false
      startPlayback(m.drives[m.drives.length - 1])
    })
    $('#skip', side)?.addEventListener('click', finish)
    $('#samples', side)?.addEventListener('click', () => { sound.play('ui'); openSamples(true) })
    $('#askcharge', side)?.addEventListener('click', () => { askCharge = true; sound.play('ui'); render() })
    $('#nocharge', side)?.addEventListener('click', () => { askCharge = false; render() })
    $('#yescharge', side)?.addEventListener('click', startCharge)
    $('#skipcharge', side)?.addEventListener('click', () => { if (!m.skipRecharge()) chargeDone() })
    $('#stopcharge', side)?.addEventListener('click', () => { if (!m.stopRecharge(Date.now())) chargeDone() })
    $$('[data-test]', side).forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.test as TestId
      const spot = m.spotHere!
      const before = m.report(spot).bars.filter(x => x.score === null).map(x => x.id)
      const err = m.runTest(t)
      if (err) { sound.play('fail'); msg = { text: err, kind: 'bad' }; render(); return }
      msg = null
      const after = m.report(spot)
      fresh = before.filter(id => after.bars.find(x => x.id === id)!.score !== null)
      sound.play(t === 'photo' ? 'shutter' : 'telemetry')
      if (t === 'photo') v.feedIdx++
      const lv = after.bars.find(x => x.id === (t === 'photo' ? 'level' : t === 'radiation' ? 'rad' : 'sun'))!
      toast(`${lv.name}: ${lv.value}`, 'ok', 3200)
      render()
    }))
    $$('[data-learn]', side).forEach(b => b.addEventListener('click', () => { showActionParts(v, m.rover!, b.dataset.learn as ActionKind); toast(`The gold dots are the parts used for ${TESTS[b.dataset.learn as TestId].name}.`, 'info', 3500); drawViewer() }))
    // Back to planning: on a small screen the viewer may be scrolled down to the camera, so bring the map back up.
    $('#explore', side)?.addEventListener('click', () => { panel = 'drive'; v.focus = null; v.tab = 'map'; confirmBuild = false; askCharge = false; msg = null; viewer.scrollTop = 0; sound.play('ui'); render() })
    $('#compare', side)?.addEventListener('click', () => { panel = 'choose'; confirmBuild = false; askCharge = false; msg = null; render() })
    $$('[data-open]', side).forEach(b => b.addEventListener('click', () => { v.focus = Number(b.dataset.open); panel = 'spot'; confirmBuild = false; askCharge = false; sound.play('ui'); render() }))
    const build = () => {
      const spot = focusSpot()
      if (!spot) return
      const e = m.decideBase(spot.id)
      if (e) { msg = { text: e, kind: 'bad' }; sound.play('fail'); render(); return }
      sound.play('success')
      v.tab = 'map'
      render()
    }
    $('#build', side)?.addEventListener('click', () => {
      const spot = focusSpot()
      if (spot && m.report(spot).verdict.level !== 'good') { confirmBuild = true; sound.play('ui'); render(); return }
      build()
    })
    $('#yesbuild', side)?.addEventListener('click', build)
    $('#nobuild', side)?.addEventListener('click', () => { confirmBuild = false; render() })
    $('#defer', side)?.addEventListener('click', () => { m.decideBase('defer'); sound.play('ui'); render() })
    $('#report', side)?.addEventListener('click', () => ctx.report())
  }

  const stop = () => {
    if (play) { clearTimeout(play.timer); play = null }
    // Leaving the screen only stops the display: a recharge carries on by the clock.
    clearTimeout(chargeTimer)
    pick?.stop()
    closeTask()
  }
  return { el: s, render, stop, powerChanged: () => { if (m.rover && m.delivery && !m.base && !play && !m.charging && !task) render() } }
}
