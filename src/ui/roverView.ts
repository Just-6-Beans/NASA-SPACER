// Rover operations. First the player chooses one rover for the whole mission. Then, on a real
// map: tap points for it to drive to, start the deployment and watch it drive (a real drive film
// on its camera, with a camera button for the real photo spots it passes), run tests at the spot,
// read the verdict, and build the base there or explore on. A low battery can be recharged, which
// uses up some of the mission's Mars days: it runs on a real countdown that carries on while the
// player is back at the station.
//
// The battery is shown as one percentage: 100 % is full and 0 % is NASA's safe-mode line.
import '../rover.css'
import '../survey.css'
import type { Mission, SpotReport } from '../core/mission'
import { mmrtgNowW, type RoverSpec } from '../core/rovers'
import {
  BASE_LOAD_W, DRIVE_PHOTO_WH, MAX_WAYPOINTS, MISSION_SOLS, PHOTO_BONUS_EACH, PHOTO_BONUS_MAX, RESERVE_FRACTION, SOL_HOURS, TESTS, TEST_ORDER, climbWhPerM, costPct, driveWhPerM, rechargeW, region,
  reserveWh, spendPct,
  type ActionKind, type Bar, type DriveResult, type Pt, type TestId,
} from '../core/survey'
import { WATER_BONUS } from '../core/mission'
import { sound } from '../audio'
import { $, $$, el, esc, reducedMotion, toast } from './dom'
import { ICONS } from './icons'
import { pin, toPx } from './mapView'
import { applyView, flash, newViewer, renderViewer, shootState, showActionParts, updateShoot } from './roverPanels'

export interface RoverCtx {
  m: Mission
  /** Checks with the co-op crew, then deploys. Returns an error or null. */
  transmit: () => Promise<string | null>
  back: () => void
  report: () => void
  refresh: () => void
}

const TEST_ICON: Record<TestId, string> = { photo: ICONS.scan, weather: ICONS.sun, radiation: ICONS.signal, drill: ICONS.flask }
const TEST_FOR: Record<TestId, string> = { photo: 'Measures the slope', weather: 'Sunlight and warmth', radiation: 'Radiation level', drill: 'Collects a rock sample' }
const colour = (score: number | null) => score === null ? 'transparent' : score >= 66 ? 'var(--mint)' : score >= 40 ? 'var(--warn)' : 'var(--danger)'
const rating = (score: number | null) => score === null ? ['Not measured', 'none'] : score >= 66 ? ['Great', 'great'] : score >= 40 ? ['OK', 'ok'] : ['Poor', 'poor']
const f1 = (n: number) => (Math.round(n * 10) / 10).toString()
/** A countdown as minutes and seconds, for example "0:23". */
const clock = (ms: number) => { const sec = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` }
/** A length of time in the words the player sees: hours when short, Mars days when long. */
const span = (hours: number) => hours < 20 ? `about ${f1(hours)} hours` : `about ${f1(hours / SOL_HOURS)} Mars days`
/** MODEL: the Recharge button appears once the gauge is at or below this (the battery "starts emptying"). */
const RECHARGE_OFFER_PCT = 50

/** The six checks as bars. Tap one to see where its number comes from. */
export function barsHtml(bars: Bar[], fresh: string[] = []) {
  return `<div class="bars">${bars.map(b => {
    const [word, cls] = rating(b.score)
    return `<details class="sbar ${b.score === null ? 'empty' : ''} ${fresh.includes(b.id) ? 'pop' : ''}">
    <summary><span class="bn">${esc(b.name)}${b.shared ? '<em>whole region</em>' : ''}</span><span class="br ${cls}">${word}</span><span class="bv">${b.score ?? '–'}</span>
      <span class="track"><i style="width:${b.score ?? 0}%;background:${colour(b.score)}"></i></span>
      <span class="bd">${esc(b.value)}</span></summary>
    <div class="why"><p><b>Real data:</b> ${esc(b.real)}</p><p><b>Source:</b> ${esc(b.source)}</p><p><b>Our scoring:</b> ${esc(b.model)}</p></div></details>`
  }).join('')}</div>`
}
export const starsHtml = (n: number) => `<span class="stars" aria-label="${n} of 3 stars">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</span>`
const VERDICT_WORD = { good: 'Good place', risky: 'Risky place', bad: 'Bad place', unknown: 'Not checked yet' }
const VERDICT_ICON = { good: '👍', risky: '⚠️', bad: '👎', unknown: '❔' }

/** One big answer with one plain sentence under it. */
export function verdictHtml(r: SpotReport) {
  const v = r.verdict
  const sentence = v.title.includes(': ') ? v.title.slice(v.title.indexOf(': ') + 2) : v.title
  return `<div class="verdictbox ${v.level}"><div class="vtop"><span class="vicon">${VERDICT_ICON[v.level]}</span><div><b>${VERDICT_WORD[v.level]}</b><p>${esc(sentence[0].toUpperCase() + sentence.slice(1))}.</p></div><div class="vscore"><b>${r.score}</b><small>out of 100</small></div></div></div>`
}

export function roverScreen(ctx: RoverCtx) {
  const m = ctx.m
  const s = el(`<section class="screen rover" aria-label="Rover operations">
    <header class="rv-head"><div class="brand">SPACER<i>///</i></div><div class="sect" id="sect">ROVER OPERATIONS</div><div class="daychip" id="daychip"></div><div class="batt" id="batt"></div></header>
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
  let play: { drive: DriveResult; path: Pt[]; total: number; pos: Pt; trail: Pt[]; wh: number; t0: number; ms: number; timer: number; cueAt: number; photoWh: number } | null = null
  /** Keeps the recharge countdown on screen up to date. The countdown itself lives in the mission, so it carries on while the player is at the station. */
  let chargeTimer = 0

  const planning = () => !play && !!m.rover && !m.base && panel === 'drive' && m.canDrive
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
        toast(`${m.rover!.name} is your rover for the whole mission. Tap the map to place points.`, 'ok', 4500)
        render()
      },
      back: () => ctx.back(),
      shoot,
    })
  }

  /** Battery in the top bar. */
  function battery(wh: number) {
    const rv = m.rover
    const bt = $('#batt', s)
    if (!rv) { bt.innerHTML = ''; return }
    const pct = spendPct(rv, wh)
    bt.className = `batt ${pct <= 15 ? 'low' : ''}`
    bt.innerHTML = `${play ? '<span class="rec on"></span>' : ''}<span class="bcell"><i style="width:${pct}%"></i></span>${m.charging ? '⚡ Charging' : 'Battery'} ${pct}%`
    bt.title = `${Math.round(wh)} Wh of ${rv.batteryWh} Wh. 0 % is the safe-mode line at ${reserveWh(rv)} Wh.`
  }
  /** Mission day in the top bar. */
  function days(hoursUsed: number) {
    const dc = $('#daychip', s)
    if (!m.rover) { dc.innerHTML = ''; return }
    const left = Math.max(0, MISSION_SOLS - hoursUsed / SOL_HOURS)
    dc.className = `daychip ${left <= 2 ? 'low' : ''}`
    dc.textContent = `☀ Day ${Math.min(MISSION_SOLS, Math.floor(hoursUsed / SOL_HOURS) + 1)} of ${MISSION_SOLS}`
    dc.title = `${f1(left)} Mars days left. Driving and recharging use them up.`
  }

  /** The Recharge button, or the question it leads to. Shown once the battery starts emptying. */
  function rechargeHtml(force = false) {
    const rv = m.rover!
    if (m.rechargeBlock()) return ''
    if (!force && spendPct(rv, m.batteryWh) > RECHARGE_OFFER_PCT && !m.stranded && m.canDrive) return ''
    const plan = m.rechargePlan()!
    const wait = `${span(plan.hours)}${plan.hours < 20 ? ' on Mars' : ''}, ${clock(plan.realMs)} on the timer`
    if (!askCharge) return `<button class="btn charge" id="askcharge">🔌 Recharge the battery<small>takes ${wait}</small></button>`
    return `<div class="reason"><b>Recharge now?</b> ${plan.full
      ? `The rover parks while its power source refills the battery. That takes <b>${wait}</b>. You have ${f1(m.solsLeft)} Mars days left.`
      : `Only ${span(plan.hours).replace('about ', '')} of the mission are left, so the battery will only reach <b>${spendPct(rv, plan.toWh)}%</b>. After that the Mars days are over.`} You can go back to the station while it charges.</div>
      <div class="row2"><button class="btn" id="nocharge">Not now</button><button class="btn primary" id="yescharge">🔌 Recharge</button></div>`
  }

  /** What the battery is at now and how long a full charge would take from here. */
  function fullIn(rv: RoverSpec) {
    const plan = m.rechargePlan()
    if (!plan || m.batteryWh >= rv.batteryWh - 1 || m.timeUp) return ''
    return `<p class="hint chargeinfo">⚡ The battery is at <b>${spendPct(rv, m.batteryWh)}%</b> now. A full charge from here takes <b>${span(plan.hours).replace('about ', '')}</b>${plan.hours < 20 ? ' on Mars' : ''} (${clock(plan.realMs)} on the timer).</p>`
  }

  /** Battery and Mars days at the top of the side panel, with what a planned drive would leave. */
  function statusBlk(rv: RoverSpec, afterWh: number | null, afterHours: number | null, note: string, forceCharge = false) {
    const now = spendPct(rv, m.batteryWh)
    const after = afterWh === null ? now : spendPct(rv, afterWh)
    const left = m.solsLeft
    const leftAfter = afterHours === null ? left : Math.max(0, left - afterHours / SOL_HOURS)
    return `<div class="blk status">
      <div class="stat"><span>🔋 Battery</span><b class="${after <= 15 ? 'low' : ''}">${afterWh === null ? `${now}%` : `${now}% → ${after}%`}</b>
        <div class="gauge" role="img" aria-label="Battery ${now} percent${afterWh === null ? '' : `, ${after} percent after the drive`}"><i class="now" style="width:${now}%"></i><i class="after ${after <= 15 ? 'low' : ''}" style="width:${after}%"></i></div></div>
      <div class="stat"><span>☀ Mars days left</span><b class="${leftAfter <= 2 ? 'low' : ''}">${afterHours === null ? f1(left) : `${f1(left)} → ${f1(leftAfter)}`}</b>
        <div class="gauge" role="img" aria-label="${f1(left)} of ${MISSION_SOLS} Mars days left"><i class="now" style="width:${(left / MISSION_SOLS) * 100}%"></i><i class="after sun ${leftAfter <= 2 ? 'low' : ''}" style="width:${(leftAfter / MISSION_SOLS) * 100}%"></i></div></div>
      <p class="hint">${note}</p>
      ${fullIn(rv)}
      ${rechargeHtml(forceCharge)}</div>`
  }

  function render() {
    const rv = m.rover
    s.classList.toggle('choosing', !rv)
    $('#sect', s).textContent = rv ? `${rv.name.toUpperCase()} · ${region(m.region!).name.toUpperCase()}` : 'CHOOSE YOUR ROVER'
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
  }

  const head = (title: string) => `<div class="side-h"><h2>${title}</h2><button class="btn small" id="back">← Station</button></div>`
  const timeUpHtml = () => m.timeUp ? `<div class="reason bad"><b>The ${MISSION_SOLS} Mars days are over.</b> Build your base on a spot you visited, or stay in orbit.</div>` : ''

  // ---------------------------------------------------------------- Plan a drive
  function driveHtml(rv: RoverSpec) {
    const f = m.forecast()
    const block = m.deployBlock()
    const perM = driveWhPerM(rv, m.balanced)
    const floor = reserveWh(rv)
    const here = m.spotHere
    const n = m.waypoints.length
    const rows = f ? f.legs.map((l, i) => {
      const last = i === n - 1 && !l.partial
      return `<div class="leg ${l.partial ? 'bad' : ''}"><span class="num">${last ? '⚑' : i + 1}</span><div><b>${l.partial ? `Stops after ${Math.round(l.distM)} m` : `${Math.round(l.distM)} m${last ? ' to the spot' : ''}`}</b><small>${l.partial ? 'The battery runs out here' : `${l.climbM >= 1 ? `Climbs ${Math.round(l.climbM)} m · ` : ''}about ${f1(l.hours)} hours for the real rover`}</small></div><em>−${costPct(rv, l.wh)}%</em></div>`
    }).join('') : ''
    const note = f
      ? f.safeMode ? 'This drive is too long for the battery.' : `After this drive, <b>${spendPct(rv, f.endWh)}%</b> battery is left for tests and photos.`
      : m.canDrive ? `Enough battery for about <b>${Math.round(m.spareWh / perM / 10) * 10} m</b> of driving. The mission lasts ${MISSION_SOLS} Mars days.` : 'The battery is too low to drive. Recharge it, or choose your base.'
    // Why the button is greyed out, in plain words, right above it.
    const why = !n && m.canDrive ? null : block
    return `${head('Plan the drive')}
      ${timeUpHtml()}
      ${statusBlk(rv, f ? f.endWh : null, f ? f.hours : null, note, !!f?.safeMode)}
      <div class="blk"><div class="blk-h"><span>① Tap the map</span><small>${n}/${MAX_WAYPOINTS} points</small></div>
        ${n ? `<div class="legs">${rows}</div>` : `<p class="hint">Place points on the map. ${esc(rv.name)} drives them in order, and the last one <b>⚑</b> is the spot it will test. Pass through a camera ring to find a real photo.</p>`}
        ${f?.safeMode ? `<div class="reason bad">Too far! The battery runs out ${f.distM} m along, before point ${f.reached + 1}. The rover would stop there in safe mode until you recharge it. Undo a point or pick a closer spot${m.rechargeBlock() ? '' : ', or recharge first'}.</div>` : f && spendPct(rv, f.endWh) < 9 ? '<div class="reason">Careful: almost nothing would be left for tests at the spot.</div>' : ''}
        ${n ? `<div class="row2"><button class="btn small" id="undo">↶ Undo last point</button><button class="btn small ghost" id="clear">Clear all</button></div>` : ''}
      </div>
      <div class="blk"><div class="blk-h"><span>② Send the rover</span></div>
        ${why ? `<div class="reason bad">${esc(why)}${/Communications|Life support/.test(why) ? ' Go back to the station (← Station) and change it at the Power Grid.' : ''}</div>` : !n ? '<p class="hint">Place at least one point first.</p>' : ''}
        <button class="btn primary huge" id="deploy" ${block || busy ? 'disabled' : ''}>${busy ? 'Checking with crew…' : '▶ Start deployment'}</button>
        ${msg ? `<div class="feedback ${msg.kind}">${esc(msg.text)}</div>` : ''}
      </div>
      ${here ? `<button class="btn" id="tospot">Test spot ${here.label} (where the rover is now)</button>` : ''}
      ${m.spots.length > 1 || m.timeUp ? '<button class="btn small" id="compare" style="margin-top:10px">Compare all my spots</button>' : ''}
      <details class="about"><summary>ⓘ How the battery and the days work</summary>
        <p>The gauge shows the battery the rover is allowed to use. NASA keeps ${esc(rv.name)}'s battery above ${Math.round(RESERVE_FRACTION * 100)} % full, so 0 % on the gauge is that safety line (${floor} Wh of ${rv.batteryWh} Wh).</p>
        <p>Driving needs about ${rv.driveW - (m.balanced ? 30 : 0) + BASE_LOAD_W} W. The rover's nuclear power source (MMRTG) makes ${mmrtgNowW(rv)} W and the battery supplies the rest. Climbing costs extra: ${f1(climbWhPerM(rv))} Wh for every metre up.</p>
        <p><b>Recharging:</b> while the rover is parked, the MMRTG puts about ${rechargeW(rv)} W into the battery, day and night. A full recharge takes ${span((rv.batteryWh - floor) / rechargeW(rv))}.</p>
        <p><b>Mars days:</b> the mission lasts ${MISSION_SOLS} Mars days (a Mars day is 24 hours 40 minutes). Driving counts at the real rover's speed, and recharging counts in full.</p>
        <p class="cam-credit">Real: battery size, the 40 % rule, MMRTG power, driving under 200 W, top speed ${rv.topSpeedMh} m/h, rover mass and map heights. Our model: the 30 W the computers use, what each test and photo costs, and the ${MISSION_SOLS}-day limit.</p></details>`
  }

  // ---------------------------------------------------------------- While the rover drives
  function drivingHtml() {
    const d = play!.drive, rv = m.rover!
    return `<div class="side-h"><h2>Driving…</h2></div>
      <div class="blk"><div class="blk-h"><span>🚙 Distance</span><b><span id="lv-d">0</span> / ${d.distM} m</b></div>
        <div class="gauge"><i class="after" id="lv-bar" style="width:0%"></i></div>
        <p class="hint">The real ${esc(rv.name)} would need about <b>${f1(d.hours)} hours</b> for this, at ${rv.topSpeedMh} m per hour. The game plays it in seconds.</p></div>
      <div class="blk"><div class="blk-h"><span>🔋 Battery</span><b id="lv-b">${spendPct(rv, d.startWh)}%</b></div><div class="gauge"><i class="after" id="lv-bb" style="width:${spendPct(rv, d.startWh)}%"></i></div></div>
      <div class="blk"><div class="blk-h"><span>📸 Photos found</span><b id="lv-p">${m.photos.length}</b></div>
        <p class="hint">Watch the map. When the rover drives into a camera ring, the <b>Take photo</b> button under the camera lights up. Tap it to save a real photo and score +${PHOTO_BONUS_EACH}.</p></div>
      <button class="btn huge" id="skip">Skip to the spot ⏭</button>`
  }

  // ---------------------------------------------------------------- While the battery recharges
  function chargingHtml(rv: RoverSpec) {
    const c = m.charging!
    const p = m.chargeProgress(Date.now())!
    const full = c.toWh >= rv.batteryWh
    return `<div class="side-h"><h2>Recharging…</h2><button class="btn small" id="back">← Station</button></div>
      <div class="blk chargeblk"><div class="chargesky" aria-hidden="true"><i class="sunmoon"></i></div>
        <div class="blk-h"><span>🔋 Battery now</span><b id="ch-b">${spendPct(rv, p.wh)}%</b></div><div class="gauge"><i class="after" id="ch-bar" style="width:${spendPct(rv, p.wh)}%"></i></div>
        <div class="blk-h" style="margin-top:16px"><span>⏱ ${full ? 'Full charge in' : 'Charging ends in'}</span><b id="ch-t">${clock(p.msLeft)}</b></div>
        <p class="hint">For the real rover that is <b id="ch-h">${f1(p.hoursLeft)}</b> more Mars hours. ${esc(rv.name)}'s nuclear power source (MMRTG) puts about ${rechargeW(rv)} W into the battery, day and night. The game plays one Mars hour each second.</p>
        <div class="blk-h" style="margin-top:16px"><span>☀ Mars days left</span><b id="ch-d">${f1(m.solsLeft)}</b></div>
        ${full ? '' : `<p class="hint">The mission days run out before the battery is full: it will stop at ${spendPct(rv, c.toWh)}%.</p>`}
        <p class="hint">The rover cannot drive or test while it charges. You can go back to the station: the timer keeps running.</p></div>
      <div class="row2"><button class="btn" id="stopcharge">■ Stop charging</button><button class="btn primary" id="skipcharge">Skip the wait ⏭</button></div>`
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
      const state = got ? `<span class="tdone">✓ Done${TESTS[t].scope === 'region' ? ' for the whole region' : ''}</span>`
        : block ? `<span class="tno">${/Needs/.test(block) ? `Needs ${cost}%, you have ${left}%` : /Safe mode/.test(block) ? 'Safe mode: recharge first' : esc(block)}</span>`
          : `<span class="tcost">uses ${cost}% battery</span>`
      return `<div class="test ${got ? 'done' : block ? 'off' : ''}"><button class="tbtn" data-test="${t}" ${got || block ? 'disabled' : ''}>${TEST_ICON[t]}<b>${TESTS[t].name}</b><small>${TEST_FOR[t]}</small>${state}</button><button class="qmark" data-learn="${t}" aria-label="Which rover parts does ${TESTS[t].name} use?" title="Which rover parts does this use?">?</button></div>`
    }).join('')
    const stuck = !m.canDrive
    const canCharge = !m.rechargeBlock()
    const bonus = [m.photoBonus ? `+${m.photoBonus} for ${m.photos.length} photo spot${m.photos.length > 1 ? 's' : ''} found${m.photoBonus >= PHOTO_BONUS_MAX ? ' (the most you can get)' : ''}` : '', m.completed.has('water') ? `+${WATER_BONUS} for the water purifier` : ''].filter(Boolean)
    return `${head(`Spot ${spot.label}`)}
      ${timeUpHtml()}
      <p class="lead">${g.source === 'rover' ? `📍 The real ${esc(rv.name)} parked right here on sol ${g.sol}, so the slope is NASA's own measurement.` : '🛰 No rover has been here. The slope comes from orbit, so it is less exact.'}</p>
      ${here && m.stranded ? '<div class="reason bad"><b>Safe mode.</b> The battery ran out on the way, so the rover stopped here. Recharge it to test or drive again.</div>' : ''}
      ${verdictHtml(r)}
      ${here ? `<div class="blk"><div class="blk-h"><span>① Run tests</span><b class="${left <= 15 ? 'low' : ''}">🔋 ${left}% left</b></div><div class="tests">${tests}</div>${here ? rechargeHtml() : ''}</div>` : `<div class="reason">The rover is at spot ${m.spotHere?.label ?? '?'} now. Drive back here to run more tests.</div>`}
      <div class="blk"><div class="blk-h"><span>${here ? '② ' : ''}The six checks</span><small>tap a bar for its source</small></div>${barsHtml(r.bars, fresh)}
        ${r.verdict.missing.length ? '<p class="hint">A check that has not been measured counts as 0.</p>' : ''}
        ${bonus.length ? `<p class="hint">⭐ Bonus on top: ${bonus.join(', ')}.</p>` : '<p class="hint">⭐ Find real photo spots on your drives to add bonus points.</p>'}</div>
      ${msg ? `<div class="feedback ${msg.kind}">${esc(msg.text)}</div>` : ''}
      <div class="blk"><div class="blk-h"><span>${here ? '③ ' : ''}What next?</span></div>
      ${confirmBuild ? `<div class="reason bad">${r.verdict.level === 'bad' ? 'This is a bad place.' : r.verdict.level === 'unknown' ? 'This spot has not been checked.' : 'This place is risky.'} You can still build here, but the base will only score ${r.score} out of 100. Build anyway?</div>
        <div class="row2"><button class="btn" id="nobuild">No, keep looking</button><button class="btn primary" id="yesbuild">Yes, build here</button></div>`
        : `<div class="row2"><button class="btn" id="explore" ${stuck ? 'disabled' : ''}>🧭 Explore another spot</button><button class="btn primary" id="build">🏗 Build the base here</button></div>`}
      ${stuck && !confirmBuild && !m.timeUp && !m.stranded ? `<div class="reason">The battery is too low to drive again. ${canCharge ? 'Recharge it, build here, or pick another spot you visited.' : 'Build here, pick another spot you visited, or stay in orbit.'}</div>` : ''}
      ${m.spots.length > 1 || stuck ? '<button class="btn small" id="compare" style="margin-top:10px">Compare all my spots</button>' : ''}</div>`
  }

  // ---------------------------------------------------------------- Compare spots
  function chooseHtml() {
    const rs = m.reports()
    return `${head('My spots')}
      ${timeUpHtml()}
      <p class="lead">Every place the rover stopped. Open one to see its checks. You can build on any of them.</p>
      <div class="spotlist">${rs.map(r => `<button class="spotrow ${r.verdict.level}" data-open="${r.spot.id}"><b>${r.spot.label}</b><span>${VERDICT_ICON[r.verdict.level]} ${VERDICT_WORD[r.verdict.level]}</span><em>${r.score}</em></button>`).join('')}</div>
      ${m.canDrive ? '' : rechargeHtml(true)}
      <div class="row2"><button class="btn" id="defer">Stay in orbit</button>${m.canDrive ? '<button class="btn primary" id="explore">🧭 Keep exploring</button>' : ''}</div>`
  }

  function doneHtml() {
    const b = m.base!
    const sentence = b.reason.includes(': ') ? b.reason.slice(b.reason.indexOf(': ') + 2) : b.reason
    return `<div class="side-h"><h2>${b.approved ? 'Base built!' : 'No base built'}</h2></div>
      ${b.approved ? `<div class="bigstars">${starsHtml(b.stars)}</div>
        <div class="verdictbox ${b.level}"><div class="vtop"><span class="vicon">🏗</span><div><b>${esc(b.name)}</b><p>${esc(sentence[0].toUpperCase() + sentence.slice(1))}.</p></div><div class="vscore"><b>${b.score}</b><small>out of 100</small></div></div></div>`
        : '<div class="verdictbox unknown"><div class="vtop"><span class="vicon">🛰</span><div><b>The crew stays in orbit</b><p>No base was built this time.</p></div></div></div>'}
      <p class="lead">${b.approved ? 'The mission goes on. Read the report, then get the habitat ready.' : 'The mission goes on. Read the report to see what happened.'}</p>
      <button class="btn primary huge" id="report">Mission report →</button>`
  }

  // ---------------------------------------------------------------- The camera button
  function shoot() {
    const rv = m.rover
    if (!rv || m.base || m.charging) return
    const st = shootState(m, rv, play ? play.pos : m.pos)
    if (!st.place || !st.ready) { toast(st.note, 'warn'); sound.play('fail'); return }
    const err = m.takePhoto(st.place.id)
    if (err) { toast(err, 'warn'); sound.play('fail'); return }
    if (play) play.photoWh += DRIVE_PHOTO_WH
    sound.play('shutter')
    toast(m.photos.length * PHOTO_BONUS_EACH > PHOTO_BONUS_MAX ? '📸 Real photo saved to your album! The photo bonus is already at its maximum.' : `📸 Real photo saved to your album! +${PHOTO_BONUS_EACH} score`, 'ok', 3200)
    if (play) { drawViewer(); set('#lv-p', String(m.photos.length)) } else render()
    flash(viewer)
  }

  // ---------------------------------------------------------------- Playback of a deployment
  function startPlayback(d: DriveResult) {
    const path = [d.start, ...d.legs.map(l => l.to)]
    const total = d.legs.reduce((a, l) => a + l.distM, 0) || 1
    // The longer the drive, the longer the film: about 22 m of driving per second, between 8 s and 70 s.
    const ms = Math.max(8000, Math.min(70000, (total / 22) * 1000)) * (reducedMotion() ? 0.3 : 1)
    play = { drive: d, path, total, pos: d.start, trail: [d.start], wh: d.startWh, t0: performance.now(), ms, timer: 0, cueAt: 0, photoWh: 0 }
    v.tab = 'map'
    v.feedIdx = 0
    viewer.scrollTop = 0
    render()
    // In a small window the camera button can sit below the fold: bring it into view for the drive.
    viewer.querySelector('#shoot')?.scrollIntoView({ block: 'nearest' })
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
    wh -= p.photoWh
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
    updateShoot(viewer, m, rv, pos)
    if (now - p.cueAt > 1500) { p.cueAt = now; sound.play('drive') }
    if (f >= 1) return finish()
    p.timer = window.setTimeout(tick, 33)
  }
  function finish() {
    if (!play) return
    clearTimeout(play.timer)
    const d = play.drive
    play = null
    const spot = m.spotHere
    v.focus = spot?.id ?? null
    v.feedIdx = 0
    panel = 'spot'
    confirmBuild = false
    askCharge = false
    sound.play(d.safeMode ? 'alert' : 'telemetry')
    toast(d.safeMode ? `Safe mode! The battery ran out ${d.distM} m along. Recharge to carry on.` : `Arrived at spot ${spot?.label}. Run tests to see if it is a good place.`, d.safeMode ? 'bad' : 'ok', 4500)
    if (m.timeUp) toast(`The ${MISSION_SOLS} Mars days are over. Choose your base.`, 'warn', 5000)
    render()
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
    if (m.timeUp) { panel = 'choose'; toast(`Battery at ${spendPct(rv, m.batteryWh)}%, but the ${MISSION_SOLS} Mars days are over. Choose your base.`, 'warn', 5000) }
    else toast(`Battery at ${spendPct(rv, m.batteryWh)}%. ${f1(m.solsLeft)} Mars days left.`, 'ok', 4000)
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
      sound.play(t === 'photo' ? 'shutter' : t === 'drill' ? 'drill' : 'telemetry')
      if (t === 'photo') v.feedIdx++
      const lv = after.bars.find(x => x.id === (t === 'photo' ? 'level' : t === 'drill' ? 'sample' : t === 'radiation' ? 'rad' : 'sun'))!
      toast(`${lv.name}: ${lv.value}`, 'ok', 3200)
      render()
    }))
    $$('[data-learn]', side).forEach(b => b.addEventListener('click', () => { showActionParts(v, m.rover!, b.dataset.learn as ActionKind); toast(`The gold dots are the parts used for ${TESTS[b.dataset.learn as TestId].name}.`, 'info', 3500); drawViewer() }))
    $('#explore', side)?.addEventListener('click', () => { panel = 'drive'; v.focus = null; v.tab = 'map'; confirmBuild = false; askCharge = false; msg = null; sound.play('ui'); render() })
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
  }
  return { el: s, render, stop, powerChanged: () => { if (m.rover && !m.base && !play && !m.charging) render() } }
}
