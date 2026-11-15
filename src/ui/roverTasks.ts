// The two rover tasks that interrupt the drive, and the pop-up that announces each.
//
//   Stuck Rover Rescue: read the telemetry, say what the trouble is, choose a fix.
//   Sample Selection: five rocks at three sample sites; scan them, compare the clues, fill three tubes.
//
// Both are glass panels in the launch field's look (src/tasks.css) laid over the rover screen.
// The rules are in src/core/rescue.ts and src/core/samples.ts; the "NASA card" on each comes from
// data/nasa/rover-tasks.json. Everything a panel shows as a reading or a value is our model, and
// the panel says so.
import '../field.css'
import '../tasks.css'
import type { Mission } from '../core/mission'
import {
  CAUSES, CAUSE_ORDER, FIXES, FIX_ORDER, NOMINAL, RESCUE_LIMIT_SOLS, WEAR_LIMIT, WHEELS, WORN_SPEED, rescueLeft,
  type FixId, type Rescue, type Risk, type StuckCause,
} from '../core/rescue'
import { TUBE_COUNT, cacheRating, rock, rockTag, type RockId } from '../core/samples'
import { costPct, spendPct } from '../core/survey'
import { formatDate } from '../data/opsDates'
import { ROVER_TASK_DATA, TUBES, sampleFacts, taskCard, type CardId } from '../data/roverTasks'
import { sound } from '../audio'
import { $, $$, el, esc } from './dom'

const REAL = '<span class="tag real">NASA data</span>'
const MODEL = '<span class="tag model">Our model</span>'
const f1 = (n: number) => (Math.round(n * 10) / 10).toString()
const days = (n: number) => `${f1(n)} Mars day${n === 1 ? '' : 's'}`

/** One "what really happened" card: a title, two lines, and where it comes from. */
function cardHtml(id: CardId) {
  const c = taskCard(id), src = c.backing[0].source
  const nasa = !/not NASA/i.test(c.provider)
  return `<div class="tk-card ${nasa ? '' : 'news'}"><div class="tk-card-h">${nasa ? REAL : '<span class="tag model">News report</span>'}<b>${esc(c.title)}</b></div>
    <p>${esc(c.text)}</p>
    <a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(c.provider)}</a></div>`
}

// ---------------------------------------------------------------- The pop-up that announces a task
export interface IntroOpts {
  tone: 'alert' | 'mission'
  tag: string
  title: string
  lead: string
  steps: [string, string, string]
  target: string
  card: CardId
  go: string
}
/** A task's opening card: what happened, the three steps, the target, and one NASA card. */
export function taskIntro(o: IntroOpts, onGo: () => void): HTMLElement {
  const box = el(`<div class="tk-veil tk-intro ${o.tone}" role="alertdialog" aria-modal="true" aria-label="${esc(o.tag)}: ${esc(o.title)}">
    <div class="tk-introcard">
      <div class="tk-flag"><i></i>${esc(o.tag)}</div>
      <h2>${esc(o.title)}</h2>
      <p class="tk-lead">${esc(o.lead)}</p>
      <ol class="tk-steps">${o.steps.map((s, i) => `<li><b>${i + 1}</b><span>${esc(s)}</span></li>`).join('')}</ol>
      <div class="tk-target"><small>Target</small>${esc(o.target)}</div>
      ${cardHtml(o.card)}
      <button class="btn primary lf-go" id="go"><b>${esc(o.go)}</b></button>
    </div></div>`)
  $('#go', box).addEventListener('click', () => { sound.play('ui'); box.remove(); onGo() })
  setTimeout(() => ($('#go', box) as HTMLElement | null)?.focus(), 60)
  return box
}
export const RESCUE_INTRO: IntroOpts = {
  tone: 'alert', tag: 'Alert', title: 'Wheel trouble', lead: 'The rover has stopped. Free it.',
  steps: ['Read the telemetry', 'Diagnose the problem', 'Choose a fix'],
  target: `Free the rover fast, with little wheel damage. It can be held for at most ${RESCUE_LIMIT_SOLS} Mars days.`,
  card: 'rock-delay', go: 'Open telemetry',
}
export const SAMPLE_INTRO: IntroOpts = {
  tone: 'mission', tag: 'New mission', title: 'Choose wisely', lead: "Pick the rocks worth keeping. A simulation inspired by Perseverance's sample tubes.",
  steps: ['Inspect 5 rocks at 3 sites', 'Compare their clues', `Fill ${TUBE_COUNT} sample tubes`],
  target: `Fill ${TUBE_COUNT} tubes with the highest science value. They are all you have, for every site.`,
  card: 'sample-caching', go: 'Inspect the rocks',
}

// ---------------------------------------------------------------- Stuck rover rescue
export interface TaskCtx {
  m: Mission
  /** The task is over, or the pilot stepped away from it: back to the map. */
  close: () => void
  /** Something the header shows has changed (battery, Mars days). */
  changed: () => void
}

const RISK_WORD: Record<Risk, string> = { none: 'No wheel risk', low: 'Low wheel risk', medium: 'Medium wheel risk', high: 'High wheel risk' }
/** How one wheel reading looks: calm, working hard, stalled, or missing. */
const wheelState = (a: number | null) => (a === null ? 'gone' : a >= NOMINAL.stallA ? 'stall' : a > NOMINAL.currentA[1] ? 'high' : a < NOMINAL.currentA[0] ? 'light' : 'calm')

/** The rover from above: six wheels, each showing its motor current. Our own drawing. */
function roverSvg(r: Rescue): string {
  const t = r.telemetry
  // wheel centres: left column, right column; front at the top
  const at = (i: number): [number, number] => [i < 3 ? 46 : 214, 52 + (i % 3) * 62]
  const wheels = WHEELS.map((name, i) => {
    const [x, y] = at(i), a = t.currentA[i], st = wheelState(a), left = i < 3
    const label = a === null ? 'NO DATA' : `${a.toFixed(1)} A`
    return `<g class="tk-wheel ${st}"><title>${esc(name)}: ${a === null ? 'no reading' : `${a.toFixed(1)} amps`}</title>
      <rect x="${x - 15}" y="${y - 24}" width="30" height="48" rx="8"/>
      ${[-14, -5, 4, 13].map(d => `<line x1="${x - 15}" y1="${y + d}" x2="${x + 15}" y2="${y + d}"/>`).join('')}
      <text class="tk-wv" x="${left ? x - 22 : x + 22}" y="${y - 2}" text-anchor="${left ? 'end' : 'start'}">${label}</text>
      <text class="tk-wn" x="${left ? x - 22 : x + 22}" y="${y + 12}" text-anchor="${left ? 'end' : 'start'}">${esc(name.replace('Left ', 'L ').replace('Right ', 'R '))}</text></g>`
  }).join('')
  return `<svg class="tk-rover" viewBox="-40 0 340 232" role="img" aria-label="The rover from above with the motor current of each wheel">
    <path class="tk-arm" d="M61 52 H88 M61 114 H88 M61 176 H88 M199 52 H172 M199 114 H172 M199 176 H172 M88 52 V176 M172 52 V176"/>
    <rect class="tk-body" x="84" y="40" width="92" height="148" rx="10"/>
    <rect class="tk-deck" x="96" y="56" width="68" height="82" rx="4"/>
    <circle class="tk-mast" cx="150" cy="66" r="9"/><circle class="tk-eye" cx="150" cy="66" r="3.4"/>
    <path class="tk-rtg" d="M112 188 h36 l8 26 h-52 z"/>
    <path class="tk-arrow" d="M130 30 l-9 -13 h18 z"/><text class="tk-front" x="130" y="12" text-anchor="middle">FRONT</text>
    ${wheels}</svg>`
}

/** A half-dial for the tilt, with the limit marked. */
function tiltDial(r: Rescue): string {
  const t = r.telemetry, max = 36
  const ang = (deg: number) => Math.PI * (1 - Math.min(max, deg) / max)
  const pt = (deg: number, rad: number) => `${(70 + Math.cos(ang(deg)) * rad).toFixed(1)},${(70 - Math.sin(ang(deg)) * rad).toFixed(1)}`
  const arc = (a: number, b: number, cls: string) => `<path class="${cls}" d="M${pt(a, 54)} A54 54 0 0 1 ${pt(b, 54)}"/>`
  const hot = t.tiltDeg >= NOMINAL.tiltLimitDeg - 6
  return `<div class="tk-gauge ${hot ? 'over' : ''}"><div class="tk-gauge-h"><span>Tilt</span><b>${t.tiltDeg.toFixed(1)}°${t.tiltRising ? '<em title="Rising since the last reading">▲ rising</em>' : ''}</b></div>
    <svg viewBox="0 0 140 80" role="img" aria-label="Tilt ${t.tiltDeg} degrees, limit ${NOMINAL.tiltLimitDeg} degrees">
      ${arc(0, NOMINAL.tiltCalmDeg, 'tk-arc calm')}${arc(NOMINAL.tiltCalmDeg, NOMINAL.tiltLimitDeg, 'tk-arc mid')}${arc(NOMINAL.tiltLimitDeg, max, 'tk-arc over')}
      <line class="tk-needle" x1="70" y1="70" x2="${pt(t.tiltDeg, 46).split(',')[0]}" y2="${pt(t.tiltDeg, 46).split(',')[1]}"/><circle class="tk-hub" cx="70" cy="70" r="4.5"/>
      <text x="${pt(NOMINAL.tiltLimitDeg, 66).split(',')[0]}" y="${pt(NOMINAL.tiltLimitDeg, 66).split(',')[1]}" text-anchor="middle" class="tk-lim">${NOMINAL.tiltLimitDeg}°</text></svg>
    <small>limit ${NOMINAL.tiltLimitDeg}° · calm under ${NOMINAL.tiltCalmDeg}°</small></div>`
}
/** A bar for the hottest drive motor, with the limit marked. */
function tempBar(r: Rescue): string {
  const c = r.telemetry.motorC, lo = 0, hi = 90
  const pos = (v: number) => `${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`
  if (c === null) return `<div class="tk-gauge gone"><div class="tk-gauge-h"><span>Motor temperature</span><b>NO DATA</b></div><div class="lf-bar"><u style="left:${pos(NOMINAL.motorLimitC)}"></u></div><small>this reading did not arrive</small></div>`
  const hot = c > NOMINAL.motorLimitC
  return `<div class="tk-gauge ${hot ? 'over' : ''}"><div class="tk-gauge-h"><span>Motor temperature</span><b>${c} °C</b></div>
    <div class="lf-bar"><i style="width:${pos(Math.min(hi, c))}"></i><u style="left:${pos(NOMINAL.motorLimitC)}"></u></div><small>limit ${NOMINAL.motorLimitC} °C · calm under ${NOMINAL.motorCalmC} °C</small></div>`
}

export function rescueOverlay(ctx: TaskCtx): { el: HTMLElement } {
  const m = ctx.m
  const s = el('<div class="tk-veil tk-task tk-rescue" role="dialog" aria-modal="true" aria-label="Stuck rover rescue"><div class="tk-frame"></div></div>')
  const frame = $('.tk-frame', s)
  let cardsOpen = false
  let last: { ok: boolean; text: string } | null = null

  function header(r: Rescue) {
    const used = r.solsUsed, wear = m.wheelWear
    return `<header class="tk-head alert"><div><div class="tk-flag"><i></i>Alert · spot ${esc(r.spot)}</div><h2>Wheel trouble</h2></div>
      <div class="tk-meters">
        <div class="lf-meter ${used >= RESCUE_LIMIT_SOLS - 1 ? 'bad' : used >= 2 ? 'warn' : ''}"><div class="lf-meter-top"><span>Held</span><b>${f1(used)} / ${RESCUE_LIMIT_SOLS} days</b></div><div class="lf-bar"><i style="width:${(used / RESCUE_LIMIT_SOLS) * 100}%"></i></div></div>
        <div class="lf-meter ${wear >= WEAR_LIMIT ? 'bad' : wear >= WEAR_LIMIT - 8 ? 'warn' : ''}"><div class="lf-meter-top"><span>Wheel wear</span><b>${wear}%</b></div><div class="lf-bar"><i style="width:${Math.min(100, wear * 2)}%"></i><u style="left:${WEAR_LIMIT * 2}%"></u></div></div>
      </div>
      <button class="lf-help" id="cards" aria-expanded="${cardsOpen}" aria-label="What really happened on Mars" title="NASA cards">?</button></header>`
  }

  function render() {
    const r = m.rescue
    if (!r) { ctx.close(); return }
    const done = r.result !== null
    const diag = r.diagnosis
    const left = rescueLeft(r)
    const tele = `<section class="tk-panel tk-tele"><div class="lf-k"><span>1 · Telemetry</span>${MODEL}</div>
        ${roverSvg(r)}
        <div class="tk-legend"><span><i class="calm"></i>normal ${NOMINAL.currentA[0]}–${NOMINAL.currentA[1]} A</span><span><i class="high"></i>working hard</span><span><i class="stall"></i>stalled</span></div>
        <div class="tk-gauges">${tiltDial(r)}${tempBar(r)}</div></section>`
    const tries = r.tries.length ? `<ul class="tk-tries">${r.tries.map(t => `<li class="${t.freed ? 'ok' : 'bad'}"><b>${t.freed ? '✓' : '✕'} ${esc(FIXES[t.fix].name)}</b><span>${esc(t.text)}</span><em>${f1(t.sols)} d${t.wear ? ` · +${t.wear}% wear` : ''}</em></li>`).join('')}</ul>` : ''
    let right: string
    if (!done) {
      right = `<section class="tk-panel"><div class="lf-k"><span>2 · Diagnose</span><em>${diag ? 'you can change it' : 'what do the readings say?'}</em></div>
          <div class="tk-opts">${CAUSE_ORDER.map(c => `<button class="tk-opt" data-cause="${c}" aria-pressed="${diag === c}"><b>${esc(CAUSES[c].name)}</b><small>${esc(CAUSES[c].sign)}</small></button>`).join('')}</div>
          ${diag ? `<div class="tk-hint">Textbook fix for ${esc(CAUSES[diag].name.toLowerCase())}: <b>${esc(FIXES[CAUSES[diag].fix].name)}</b>.</div>` : ''}</section>
        <section class="tk-panel"><div class="lf-k"><span>3 · Choose a fix</span><em>${diag ? `${f1(left)} days left` : 'diagnose first'}</em></div>
          <div class="tk-opts fixes">${FIX_ORDER.map(f => {
            const info = FIXES[f], block = !diag ? 'Diagnose first' : m.fixBlock(f)
            return `<button class="tk-opt fix ${diag && CAUSES[diag].fix === f ? 'book' : ''}" data-fix="${f}" ${block ? 'disabled' : ''} title="${esc(block ?? info.does)}"><b>${esc(info.name)}</b><small>${esc(info.does)}</small>
              <span class="tk-cost"><i>${f1(info.sols)} d</i><i class="risk ${info.risk}">${RISK_WORD[info.risk]}</i></span></button>`
          }).join('')}</div>
          ${last ? `<div class="lf-block ${last.ok ? 'ok' : ''}" role="status">${esc(last.text)}</div>` : ''}${tries}</section>`
    } else {
      const truth = CAUSES[r.cause], worn = m.wheelsWorn
      const head = r.result === 'held' ? `Held for ${days(r.solsUsed)}` : r.result === 'clean' ? 'Rover free at the first try' : 'Rover free'
      const tone = r.result === 'clean' && !worn ? 'comfortable' : r.result === 'held' || worn ? 'short' : 'tight'
      right = `<section class="tk-panel tk-out"><div class="lf-k"><span>Result</span>${MODEL}</div>
          <h3>${esc(head)}</h3>
          <div class="lf-tiles">
            <div class="lf-tile"><small>Mars days held</small><b>${f1(r.solsUsed)}</b></div>
            <div class="lf-tile"><small>Wheel wear</small><b>${m.wheelWear}<i>%</i></b></div>
            <div class="lf-tile"><small>Top speed</small><b>${worn ? Math.round(WORN_SPEED * 100) : 100}<i>%</i></b></div>
          </div>
          <div class="lf-lift ${tone}"><span class="lf-verdict">${esc(truth.name)}</span><p>${esc(truth.sign)}. ${esc(truth.why)}${r.diagnosis && r.diagnosis !== r.cause ? ` You read it as ${esc(CAUSES[r.diagnosis].name.toLowerCase())}.` : ''}</p></div>
          ${worn ? `<div class="lf-block">Wheel wear passed ${WEAR_LIMIT}%: the rover drives at ${Math.round(WORN_SPEED * 100)}% speed for the rest of the mission.</div>` : ''}
          ${tries}
          <p class="tk-lesson">On Mars you diagnose from limited data, and every action costs time.</p>
          <button class="btn primary lf-go" id="closetask"><b>Back to the map</b><small>day ${m.sol} of ${m.missionSols}</small></button></section>`
    }
    frame.innerHTML = `${header(r)}
      ${cardsOpen ? `<div class="tk-cards"><div class="lf-k"><span>What really happened</span><button class="lf-x" id="cardsx" aria-label="Close">×</button></div>${(['rock-delay', 'wheel-wear', 'sand-trap'] as CardId[]).map(cardHtml).join('')}<p class="lf-popnote">${MODEL}The readings, the four causes, the fixes and their costs. Retrieved ${formatDate(ROVER_TASK_DATA.retrieved)}.</p></div>` : ''}
      <div class="tk-grid">${tele}<div class="tk-col">${right}</div></div>
      <p class="tk-simnote sim">Simulated telemetry · our model, not rover data</p>`
    bind()
    ctx.changed()
  }

  function bind() {
    $('#cards', frame).addEventListener('click', () => { cardsOpen = !cardsOpen; sound.play('ui'); render() })
    frame.querySelector('#cardsx')?.addEventListener('click', () => { cardsOpen = false; render() })
    $$('[data-cause]', frame).forEach(b => b.addEventListener('click', () => { m.diagnose(b.dataset.cause as StuckCause); last = null; sound.play('ui'); render() }))
    $$('[data-fix]', frame).forEach(b => b.addEventListener('click', () => {
      const fix = b.dataset.fix as FixId
      const err = m.tryFix(fix)
      if (err) { last = { ok: false, text: err }; sound.play('fail'); render(); return }
      const t = m.rescue!.tries[m.rescue!.tries.length - 1]
      last = { ok: t.freed, text: `${FIXES[fix].name}: ${t.text}` }
      sound.play(t.freed ? 'success' : 'alert')
      render()
    }))
    frame.querySelector('#closetask')?.addEventListener('click', () => { sound.play('ui'); ctx.close() })
  }
  render()
  return { el: s }
}

// ---------------------------------------------------------------- Sample selection
const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`
/** NASA's own picture of a sample's drill site. Only the letter is shown while the rock is unknown. */
const photo = (id: RockId) => { const f = sampleFacts(id); return `<img class="tk-rockart" src="${asset(f.image.file)}" alt="NASA photo: ${esc(f.image.shows)}" loading="lazy"/>` }

interface SampleDraft { scanned: RockId[]; picks: RockId[] }

export function sampleOverlay(ctx: TaskCtx): { el: HTMLElement } {
  const m = ctx.m, rv = m.rover!
  const s = el('<div class="tk-veil tk-task tk-samples" role="dialog" aria-modal="true" aria-label="Sample selection"><div class="tk-frame"></div></div>')
  const frame = $('.tk-frame', s)
  const draft = (m.drafts.samples ??= { scanned: [], picks: [] }) as SampleDraft
  const site = m.siteHere
  // Picks left over from another site do not belong here.
  draft.picks = draft.picks.filter(id => !!site && m.rocksLeft(site).includes(id))
  let cardsOpen = false
  let fresh: RockId | null = null
  /** Choosing rocks at this site, or looking at what the tubes hold. */
  let view: 'pick' | 'result' = m.siteOpen ? 'pick' : 'result'
  const cards = (): CardId[] => ['sample-caching', ...(rv.id === 'curiosity' ? ['curiosity-powder'] as CardId[] : []), 'sample-return']

  /** A rock with its name, its entry in NASA's catalog and why it is worth what it is worth. */
  function revealHtml(id: RockId, kept: boolean) {
    const k = rock(id), f = sampleFacts(id)
    return `<article class="tk-reveal ${kept ? 'kept' : ''}"><div class="tk-rv-pic">${photo(id)}<span class="tk-tag">${rockTag(id)}</span>${kept ? '<span class="tk-kept">In a tube</span>' : ''}</div>
      <div class="tk-rv-body"><div class="tk-rv-h"><b>${esc(f.name)}</b><em>${kept ? `+${k.value}` : `${k.value}`}</em></div>
        <p class="tk-rv-real">${REAL}Sample ${f.number} · ${esc(f.feature)} · ${f.rockType ? esc(f.rockType.toLowerCase()) : 'no rock in the tube'} · sealed ${esc(f.sealed)} (sol ${f.sol})${f.heightCm ? ` · core ${f.heightCm} cm` : ''}</p>
        <p class="tk-rv-why">${esc(k.verdict)}</p>
        <details class="about"><summary>What NASA says</summary><p class="cam-credit">Photo: ${esc(f.image.shows)} ${esc(f.image.credit)}</p>${f.story.map(x => `<p>${esc(x.text)}</p>`).join('')}${f.note ? `<p class="cam-credit">${esc(f.note)}</p>` : ''}
          <p class="cam-credit">${f.story.flatMap(x => x.backing).map(b => b.source).filter((x, i, all) => all.findIndex(y => y.url === x.url) === i).map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.provider)}</a>`).join(' · ')}</p></details></div></article>`
  }

  function render() {
    const sealed = m.samples?.picks ?? []
    const clear = m.samplesStudied
    const picking = view === 'pick' && !!site && m.siteOpen
    const cost = picking ? costPct(rv, m.tubeCost * Math.max(1, draft.picks.length)) : 0, have = spendPct(rv, m.batteryWh)
    const filled = sealed.length + (picking ? draft.picks.length : 0)
    const head = `<header class="tk-head mission"><div><div class="tk-flag"><i></i>New mission · ${site ? `sample ${esc(site.name.toLowerCase())} of ${m.sampleSites.length}` : 'sample tubes'}</div><h2>Choose wisely</h2></div>
      <div class="tk-meters">
        <div class="lf-meter"><div class="lf-meter-top"><span>Tubes</span><b>${filled} / ${TUBE_COUNT}</b></div><div class="lf-bar"><i style="width:${(filled / TUBE_COUNT) * 100}%"></i></div></div>
        <div class="lf-meter ${picking && draft.picks.length && cost > have ? 'bad' : ''}"><div class="lf-meter-top"><span>Battery</span><b>${picking && draft.picks.length ? `${have}% → ${Math.max(0, have - cost)}%` : `${have}%`}</b></div><div class="lf-bar"><i style="width:${have}%"></i></div></div>
      </div>
      <button class="lf-help" id="cards" aria-expanded="${cardsOpen}" aria-label="What NASA says about the sample tubes" title="NASA cards">?</button></header>`
    const cardBox = cardsOpen ? `<div class="tk-cards"><div class="lf-k"><span>What NASA says</span><button class="lf-x" id="cardsx" aria-label="Close">×</button></div>${cards().map(cardHtml).join('')}
      <p class="lf-popnote">${REAL}The five rocks are modelled on samples Perseverance really sealed, with NASA's own photos; ${TUBES.total} tubes went to Mars.<br/>${MODEL}The colour and texture read-outs, the science values, the three tubes, and which rocks lie at which site.</p></div>` : ''
    // What the three tubes hold: sealed ones by name, the ones being chosen by letter.
    const rack = `<div class="tk-tubes">${Array.from({ length: TUBE_COUNT }, (_, i) => {
      const done = sealed[i], pick = picking ? draft.picks[i - sealed.length] : undefined
      return `<span class="tk-tube ${done ? 'full sealed' : pick ? 'full' : ''}"><i></i>${done ? esc(sampleFacts(done).name) : pick ? `Rock ${rockTag(pick)}` : `Tube ${i + 1}`}</span>`
    }).join('')}</div>`
    // The other sites, and what is known of them.
    const others = m.sampleSites.filter(x => x.id !== site?.id).map(x => {
      const left = m.rocksLeft(x).length
      return `<span class="tk-site ${left ? '' : 'done'}"><i></i>${esc(x.name)} · ${Math.round(Math.hypot(x.x - m.pos.x, x.y - m.pos.y) / 10) * 10} m away · ${left ? `${left} rock${left === 1 ? '' : 's'}` : 'emptied'}</span>`
    }).join('')
    if (picking) {
      const block = m.sampleBlock()
      const room = m.tubesLeft - draft.picks.length
      const rocks = site!.rocks.map(id => {
        const k = rock(id), taken = sealed.includes(id), seen = draft.scanned.includes(id), slot = draft.picks.indexOf(id)
        if (taken) return `<article class="tk-rock picked"><div class="tk-rockpic">${photo(id)}<span class="tk-tag">${rockTag(id)}</span><span class="tk-kept">In a tube</span></div>
          <dl class="tk-clues"><dt>Sample</dt><dd>${esc(sampleFacts(id).name)}</dd><dt>Worth</dt><dd>+${k.value}</dd></dl></article>`
        return `<article class="tk-rock ${seen ? 'seen' : ''} ${slot >= 0 ? 'picked' : ''} ${fresh === id ? 'fresh' : ''}">
          <div class="tk-rockpic">${photo(id)}<i class="tk-scanline"></i><span class="tk-tag">${rockTag(id)}</span>${slot >= 0 ? `<span class="tk-kept">Tube ${sealed.length + slot + 1}</span>` : ''}</div>
          ${seen ? `<dl class="tk-clues"><dt>Colour</dt><dd>${esc(k.clues.colour)}</dd><dt>Texture</dt><dd>${esc(k.clues.texture)}</dd><dt>Made of</dt><dd class="${clear ? '' : 'faint'}">${esc(clear ? k.clues.composition : k.clues.faint)}${clear ? '' : ' <em>(faint)</em>'}</dd></dl>
            <button class="btn small ${slot >= 0 ? 'mint' : ''}" data-pick="${id}" ${slot < 0 && room <= 0 ? 'disabled' : ''}>${slot >= 0 ? 'Take it out' : room <= 0 ? 'Tubes full' : 'Put in a tube'}</button>`
            : `<button class="btn small" data-scan="${id}">Scan rock ${rockTag(id)}</button>`}</article>`
      }).join('')
      const n = draft.picks.length
      frame.innerHTML = `${head}${cardBox}
        <div class="tk-rocks n${site!.rocks.length}">${rocks}</div>
        <div class="tk-rack"><div>${rack}<div class="tk-sites">${others}</div></div>
          <div class="tk-rackside">${clear ? '' : '<p class="tk-hint">The instrument is not calibrated: what each rock is made of reads faintly.</p>'}
            ${block ? `<div class="lf-block" role="alert">${esc(block)}</div>` : ''}
            <button class="btn primary lf-go" id="seal" ${n && !block ? '' : 'disabled'}><b>${n > 1 ? `Seal ${n} tubes` : 'Seal 1 tube'}</b><small>${n ? `coring uses ${cost}% battery · ${m.tubesLeft - n} tube${m.tubesLeft - n === 1 ? '' : 's'} kept for other sites` : 'choose a rock, or save your tubes'}</small></button>
            <button class="btn small ghost" id="closetask">${sealed.length || n ? 'Leave for now' : 'Save the tubes for another site'}</button></div></div>
        <p class="tk-simnote sim">Real NASA photos of Perseverance's sample sites · scan read-outs and values are our model</p>`
    } else {
      const value = m.samples?.value ?? 0, full = m.tubesLeft <= 0
      const rating = cacheRating(value)
      const tone = !full ? 'tight' : rating.level === 'great' ? 'comfortable' : rating.level === 'good' ? 'tight' : rating.level === 'fair' ? 'marginal' : 'short'
      // What the rocks left behind were is told only once the last tube is sealed: until then they
      // are still a choice. Rocks the pilot never scanned stay unknown here; the debrief lists them.
      const leftBehind = full ? m.sampleSites.flatMap(x => x.rocks).filter(id => !sealed.includes(id) && draft.scanned.includes(id)) : []
      frame.innerHTML = `${head}${cardBox}
        <div class="tk-sealed"><div class="lf-lift ${tone}"><span class="lf-verdict">${full ? esc(rating.word) : `${m.tubesLeft} tube${m.tubesLeft === 1 ? '' : 's'} left`}</span>
          <p>Science value <b>${value}</b> of 100${full ? '' : ' so far'}. It fills the Rock samples check for every spot in this crater.${m.samples && !m.samples.clear ? ' The instrument was not calibrated, so the composition clues were faint.' : ''}</p></div>
          ${rack}
          <div class="tk-reveals">${sealed.map(id => revealHtml(id, true)).join('')}${leftBehind.map(id => revealHtml(id, false)).join('')}</div>
          ${full ? '' : `<div class="tk-sites">${others}</div>`}
          <p class="tk-lesson">${full ? 'Three tubes for five rocks: science means choosing what to leave behind.' : 'Each tube you keep empty is a bet on a better rock farther away.'}</p>
          <div class="tk-ends">${m.siteOpen ? '<button class="btn" id="more">Core another rock here</button>' : ''}<button class="btn primary lf-go" id="closetask"><b>Back to the map</b><small>battery ${have}%</small></button></div></div>
        <p class="tk-simnote sim">Real NASA photos of Perseverance's sample sites · values are our model</p>`
    }
    fresh = null
    bind()
    ctx.changed()
  }

  function bind() {
    $('#cards', frame).addEventListener('click', () => { cardsOpen = !cardsOpen; sound.play('ui'); render() })
    frame.querySelector('#cardsx')?.addEventListener('click', () => { cardsOpen = false; render() })
    $$('[data-scan]', frame).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.scan as RockId
      if (!draft.scanned.includes(id)) draft.scanned.push(id)
      fresh = id
      sound.play('telemetry')
      render()
    }))
    $$('[data-pick]', frame).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.pick as RockId, at = draft.picks.indexOf(id)
      if (at >= 0) draft.picks.splice(at, 1)
      else if (draft.picks.length < m.tubesLeft) draft.picks.push(id)
      sound.play('ui')
      render()
    }))
    frame.querySelector('#seal')?.addEventListener('click', () => {
      const picks = [...draft.picks]
      const err = m.collectSamples(picks)
      if (err) { sound.play('fail'); render(); return }
      draft.picks = []
      view = 'result'
      sound.play('drill')
      setTimeout(() => sound.play(m.tubesLeft <= 0 && (m.samples?.value ?? 0) >= 70 ? 'success' : 'telemetry'), 900)
      render()
    })
    frame.querySelector('#more')?.addEventListener('click', () => { view = 'pick'; sound.play('ui'); render() })
    frame.querySelector('#closetask')?.addEventListener('click', () => { sound.play('ui'); ctx.close() })
  }
  render()
  return { el: s }
}
