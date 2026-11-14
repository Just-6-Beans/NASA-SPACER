import './style.css'
import './holo.css'
import './title.css'
import { ICONS } from './ui/icons'
import type Phaser from 'phaser'
import { CARGO_REWARD, PREP_HOURS, ROUTES, SCANS, SHIPS, SITES, SUITS, byId, type ShipId, type SuitId } from './core/data'
import { Mission, PREP_COST, TASK_INFO } from './core/mission'
import { validPower, type Power } from './core/power'
import { fmt } from './core/rover'
import type { TaskId } from './core/tasks'
import { ROOM_NAME, type CrewMember } from './core/protocol'
import { sound } from './audio'
import { Coop, coopUrl } from './coop'
import { terminal } from './game/deck'
import { createGame, deckFits, type MarsScene, type StationScene, type Terminal } from './game/game'
import { bindDpad, clearHeld, input, setBlocked } from './game/input'
import { $, clearToasts, el, esc, isTouch, lower1, toast } from './ui/dom'
import type { Forecast } from './ui/forecast'
import { briefScreen, crewScreen, fleetScreen, launchScreen, titleScreen, type CrewLink, type Draft, type LinkStatus, type Mode, type TitleUi } from './ui/intro'
import { closePanel, openPanel, panelOpen, refreshPanel, type PanelCtx } from './ui/panels'
import { phaseOf, phaseRail, type Phase } from './ui/phase'
import { reportScreen, sitesScreen } from './ui/report'
import { roverScreen } from './ui/roverView'
import { NEED, STEPS, deckMap, objectiveFor, stationView, stepOf, type DeckMap } from './ui/stationHud'
// Last, so it can refine the station and rover stylesheets the modules above bring in.
import './flow.css'

type ScreenName = 'title' | 'brief' | 'fleet' | 'crew' | 'launch' | 'station' | 'rover' | 'report'

const app = $('#app')
const gameHost = el('<div id="game"></div>')
document.body.prepend(gameHost)

let draft: Draft = loadDraft()
let mission: Mission | null = null
let game: Phaser.Game | null = null
let screen: ScreenName = 'title'
let screenEl: HTMLElement | null = null
let hud: HTMLElement | null = null
let rover: ReturnType<typeof roverScreen> | null = null
let overlay: HTMLElement | null = null // sites overlay
let map: DeckMap | null = null
/** The pass flown before this one, so the planner can show what a change did. */
let lastFlight: Forecast | null = null
let shownPhase: Phase | null = null
let guideOn = (() => { try { return localStorage.getItem('spacer.guide') !== '0' } catch { return true } })()
let drawerOpen = false
let menuOpen = false
// Debug is a developer view: the backquote key, or ?debug in the address, not a button.
let debugOn = new URLSearchParams(location.search).has('debug')
let prevFault = false
const coop = new Coop()
let coopPanel: HTMLElement | null = null
let coopStatus: LinkStatus = 'offline'
let coopError = ''
let titleUi: TitleUi | null = null
let soloOnly = false // the player chose a solo mission while a co-op join was still in flight
let powerInFlight = false
let powerWanted: Power | null = null
const gameReady = createGame(gameHost).then(g => { game = g; g.loop.sleep(); return g })

const station = () => game!.scene.getScene('station') as StationScene
const mars = () => game!.scene.getScene('mars') as MarsScene

function loadDraft(): Draft {
  try {
    const d = JSON.parse(localStorage.getItem('spacer.profile') || 'null')
    if (d && SHIPS.some(s => s.id === d.ship) && SUITS.some(s => s.id === d.suit) && typeof d.callSign === 'string') return d
  } catch { /* ignore */ }
  return { callSign: 'Pilot', suit: 'ember', ship: 'odyssey' }
}
function saveDraft() { try { localStorage.setItem('spacer.profile', JSON.stringify(draft)) } catch { /* ignore */ } }

function show(name: ScreenName, node: HTMLElement | null) {
  screenEl?.remove()
  screenEl = node
  screen = name
  if (node) app.append(node)
  gameHost.style.visibility = name === 'station' || name === 'rover' ? 'visible' : 'hidden'
  document.body.dataset.screen = name // the stylesheet places toasts per screen
  document.title = `SPACER · ${name[0].toUpperCase()}${name.slice(1)}`
}

// ------------------------------------------------------------------ Intro flow
function goTitle() {
  leaveGameplay()
  titleUi = titleScreen(crewLink, mode => void startMission(mode))
  show('title', titleUi.el)
}
/** Solo drops any co-op link first. Co-op keeps the link opened in the title lobby through docking. */
async function startMission(mode: Mode) {
  soloOnly = mode === 'solo'
  if (soloOnly && coop.connected) await leaveCoop()
  goBrief()
}
/** The brief comes before the spacecraft, so the first choice is made knowing what it is for. */
function goBrief() { show('brief', briefScreen(goTitle, goFleet)) }
function goFleet() { leaveGameplay(); show('fleet', fleetScreen(draft, goBrief, ship => { draft.ship = ship; saveDraft(); goCrew() })) }
function goCrew() { show('crew', crewScreen(draft, goFleet, d => { draft = d; saveDraft(); goLaunch() })) }
function goLaunch() { show('launch', launchScreen(draft, () => void dock())) }

/**
 * Starts a mission on the station. `carry` is the mission just flown: its design is kept (power,
 * instrument, date, route, scan) so the player can change one thing and fly again. Tasks and
 * crew-hours start fresh.
 */
async function dock(carry: Mission | null = null) {
  await gameReady
  if (carry?.plan && carry.pass) lastFlight = { plan: carry.plan, pass: carry.pass }
  mission = new Mission({ callSign: draft.callSign, suit: draft.suit as SuitId, ship: draft.ship as ShipId })
  const kept = carry?.plan
  if (kept) {
    mission.setPower(kept.power)
    mission.selectInstrument(kept.instrument)
    mission.setOpsDate(kept.date)
    mission.route = kept.route
    mission.scan = kept.scan
  }
  if (coop.connected && sharedPower) mission.setPower(sharedPower)
  prevFault = false
  enterStation(true)
  toast(kept ? 'Docked again with your last design. Change one thing and see what it does.' : `Docked at 408 km. Welcome aboard, ${mission.profile.callSign}. The brief and live status are at Mission Ops.`, 'ok', 5200)
  sound.play('dock')
}

// ------------------------------------------------------------------ Station
function enterStation(fresh = false) {
  const g = game!
  g.loop.wake()
  rover?.stop()
  overlay?.remove(); overlay = null
  if (g.scene.isActive('mars') || g.scene.isPaused('mars')) g.scene.sleep('mars')
  const st = station()
  if (!g.scene.isActive('station') && !g.scene.isSleeping('station')) {
    g.scene.start('station')
  } else g.scene.wake('station')
  const ready = () => {
    const s = station()
    s.setProfile(mission!.profile.callSign, mission!.profile.suit)
    wireStation(s)
    if (fresh) s.respawn()
    s.layout()
    s.setDebug(debugOn)
    s.forcePoseSend()
    pushView()
    if (coop.connected) syncCrew()
  }
  if (st.sys.settings.status >= 5 && (st as unknown as { feet?: unknown }).feet) ready()
  else st.events.once('create', ready)
  show('station', buildHud())
  setBlocked(false)
  refresh()
}

function wireStation(s: StationScene) {
  s.onNear = t => renderPrompt(t)
  s.onOpen = id => openTerminal(id)
  s.onStep = () => sound.play('step')
  s.onPose = p => { if (coop.connected && screen === 'station') coop.sendPose(p) }
  s.onBlocked = msg => toast(msg, 'warn')
  input.onInteract = () => {
    if (screen !== 'station' || panelOpen()) return
    const t = nearTerminal
    if (t) openTerminal(t.id)
  }
  input.onEscape = () => {
    if (coopPanel) return closeCoop()
    if (panelOpen()) return closeTask()
    if (menuOpen) return toggleMenu(false)
    if (drawerOpen) return toggleDrawer(false)
  }
}

let nearTerminal: Terminal | null = null
function renderPrompt(t: Terminal | null) {
  nearTerminal = t
  const p = hud && $('#prompt', hud)
  if (!p) return
  // Desktop shows the in-world callout; touch also gets a large on-screen prompt.
  p.classList.toggle('hidden', !t || !isTouch())
  if (t) p.innerHTML = `<span class="key">E</span> Use ${esc(t.name)}`
}

function panelCtx(): PanelCtx {
  return {
    m: mission!,
    coopOn: () => coop.connected,
    powerRevision: () => coop.revision,
    setPower: requestPower,
    done: completeTask,
    refresh,
    openRover: () => { closeTask(); goRover() },
    close: closeTask,
  }
}

function openTerminal(id: string) {
  if (!mission) return
  sound.play('ui')
  // With the link up, Rover Comms is the rover planner: no panel in between.
  if (id === 'comms' && !mission.roverAccess()) { goRover(); return }
  showPanel(id)
}
/** Opens a terminal's panel over whatever screen is up: the station, or the rover planner. */
function showPanel(id: string, tab?: string) {
  if (!mission) return
  setBlocked(true)
  openPanel(id, panelCtx(), tab)
}
function closeTask() {
  closePanel()
  setBlocked(!!coopPanel || screen !== 'station')
  refresh()
}

function completeTask(task: TaskId, detail: string) {
  if (!mission!.complete(task, detail)) return
  sound.play('success')
  const left = mission!.prepLeft
  const hours = PREP_COST[task] ? ` ${left} crew-hour${left === 1 ? '' : 's'} left.` : ''
  // Restoring the relay announces itself below, in refresh().
  if (task !== 'relay') toast(`${TASK_INFO[task].name} done: ${lower1(TASK_INFO[task].reward)}.${hours}`, 'ok')
  refresh()
}

const objective = () => objectiveFor(mission!)

/** Hands the mission state to the deck, which draws it: power buses, consoles, guide. */
function pushView() {
  if (mission && game) station().setView(stationView(mission, objective(), guideOn))
}

function buildHud(): HTMLElement {
  const m = mission!
  const suit = byId(SUITS, m.profile.suit)
  shownPhase = null
  menuOpen = false
  hud = el(`<section class="screen hud" aria-label="Station">
    <div class="ops-head"><div class="brand">SPACER</div><div class="phasewrap" id="phases"></div>
      <div class="hud-buttons">
        <button class="btn small primary hidden" id="b-report">Mission report</button>
        <button class="btn small" id="b-tasks">Tasks</button>
        <div class="menuwrap"><button class="btn small" id="b-menu" aria-haspopup="true" aria-expanded="false">Menu</button>
          <div class="hudmenu hidden" id="menu"><button class="btn small" id="b-guide"></button><button class="btn small" id="b-sound"></button><button class="btn small" id="b-coop"></button></div></div>
      </div>
      <div class="crewtag" title="${esc(m.profile.callSign)} · ${m.ship.name} · ${suit.name} suit"><span class="sw" style="background:${suit.primary}"></span><div><b>${esc(m.profile.callSign)}</b><br/><span>${m.ship.name} · ${suit.name}</span></div></div>
      <div class="crewn hidden" id="crewn-wrap">${ICONS.crew}<span id="crewn"></span></div></div>
    <div class="objcard" id="objline" role="status">
      <div class="objstep"><b id="objstep"></b><span id="objwhere"></span></div>
      <div class="objtitle" id="objtitle"></div><div class="objtext" id="obj"></div></div>
    <div class="statbar" id="meters" aria-label="Station resources"></div>
    <div class="banner hidden" id="banner" role="alert">⚠ Relay fault · choose the fix at Rover Comms</div>
    <div class="prompt hidden" id="prompt"></div>
    <div class="debugbox hidden" id="debug"><div id="dstats"></div><button class="btn small" id="d-add">+250 sprites</button> <button class="btn small" id="d-rst">Reset sprites</button><div style="margin-top:4px"><span style="color:#ff8a7a">red</span> = collision · <span style="color:#6ef2c6">mint</span> = feet · <span style="color:#ffb347">amber</span> = reach · <kbd>\`</kbd> closes</div></div>
    ${isTouch() ? `<div class="dpad" id="dpad">
      <span></span><button data-dir="up" aria-label="Up">▲</button><span></span>
      <button data-dir="left" aria-label="Left">◀</button><button data-dir="jog" aria-label="Jog">⇧</button><button data-dir="right" aria-label="Right">▶</button>
      <span></span><button data-dir="down" aria-label="Down">▼</button><span></span></div>
      <button class="act" id="touch-act" aria-label="Interact">E</button>` : ''}
  </section>`)
  $('#b-tasks', hud).addEventListener('click', () => { toggleMenu(false); toggleDrawer() })
  $('#b-menu', hud).addEventListener('click', () => toggleMenu())
  $('#b-report', hud).addEventListener('click', goReport)
  $('#b-sound', hud).addEventListener('click', () => { sound.setMuted(!sound.muted); sound.play('ui'); refresh() })
  $('#b-coop', hud).addEventListener('click', () => { toggleMenu(false); openCoop() })
  $('#b-guide', hud).addEventListener('click', () => { guideOn = !guideOn; try { localStorage.setItem('spacer.guide', guideOn ? '1' : '0') } catch { /* ignore */ } sound.play('ui'); refresh() })
  hud.addEventListener('pointerdown', e => { if (menuOpen && !(e.target as HTMLElement).closest('.menuwrap')) toggleMenu(false) })
  map = deckMap(m)
  hud.append(map.el)
  $('#d-add', hud).addEventListener('click', () => { station().addLoad(250) })
  $('#d-rst', hud).addEventListener('click', () => { station().resetLoad() })
  const dpad = $('#dpad', hud)
  if (dpad) bindDpad(dpad)
  $("#touch-act", hud)?.addEventListener('click', () => input.onInteract())
  renderPrompt(nearTerminal)
  return hud
}

function toggleMenu(force?: boolean) {
  menuOpen = force ?? !menuOpen
  if (!hud) return
  $('#menu', hud).classList.toggle('hidden', !menuOpen)
  $('#b-menu', hud).setAttribute('aria-expanded', String(menuOpen))
}

/** The bottom bar: the three power buses, then the two budgets the player spends, hours and credits. */
function metersHtml(m: Mission): string {
  const p = m.power
  const cell = (cls: string, icon: string, long: string, short: string, value: string, body: string, title: string) =>
    `<div class="sm ${cls}" title="${title}">${icon}<b><span class="l">${long}</span><span class="s">${short}</span><span class="v">${value}</span></b>${body}</div>`
  const bus = ([['Life support', 'Life', ICONS.leaf, 'life'], ['Comms', 'Comms', ICONS.signal, 'comms'], ['Research', 'Rsrch', ICONS.flask, 'research']] as [string, string, string, keyof Power][]).map(([n, s, ic, k]) =>
    cell(`bus-${k} ${p[k] < NEED[k] ? 'low' : ''}`, ic, n, s, `${p[k]}<span class="of">/10</span>`, `<div class="bar"><i style="width:${p[k] * 10}%"></i></div>`, `${n}: ${p[k]} of 10 units${NEED[k] ? `, needs ${NEED[k]} to transmit` : ''}`))
  const total = m.ship.budget + (m.completed.has('cargo') ? CARGO_REWARD : 0)
  const hours = cell(`res ${m.prepLeft < 1 ? 'spent' : ''}`, ICONS.clock, 'Crew-hours', 'Hours', `${m.prepLeft}/${PREP_HOURS}`,
    `<div class="pips">${Array.from({ length: PREP_HOURS }, (_, i) => `<i class="${i < m.prepLeft ? 'on' : ''}"></i>`).join('')}</div>`, `${m.prepLeft} of ${PREP_HOURS} crew-hours left. Each preparation task takes one.`)
  const credits = cell('res', ICONS.bars, 'Credits', 'Cr', `${m.funds}<span class="of"> cr</span>`, `<div class="bar"><i style="width:${Math.max(0, (m.funds / total) * 100)}%"></i></div>`, `${m.funds} of ${total} credits left for imported water and landing kits.`)
  return bus.join('') + hours + credits
}

function refresh() {
  const m = mission
  if (!m) return
  if (m.relayFault && !prevFault) { sound.play('relay'); toast('Relay fault. Powering up the payload always knocks it out: choose the fix at Rover Comms.', 'bad', 6000) }
  if (!m.relayFault && prevFault) toast(m.relayPatched ? `Relay patched. Its hand-off is now ${m.handoffMin} min; a direct link skips it.` : 'Relay repaired. The rover planner is online.', 'ok', 5000)
  prevFault = m.relayFault
  if (hud && screen === 'station') {
    const o = objective()
    const ph = phaseOf(m)
    if (ph !== shownPhase) { $('#phases', hud).innerHTML = phaseRail(ph); shownPhase = ph }
    $('#objstep', hud).textContent = `Step ${o.step} of ${STEPS.length}`
    $('#objwhere', hud).textContent = o.target ? `→ ${terminal(o.target).name}` : '→ Mission report'
    $('#objtitle', hud).textContent = o.title
    $('#obj', hud).textContent = o.text
    $('#b-guide', hud).textContent = guideOn ? 'Floor guide: on' : 'Floor guide: off'
    $('#b-guide', hud).classList.toggle('mint', guideOn)
    $('#b-sound', hud).textContent = sound.muted ? 'Sound: off' : 'Sound: on'
    $('#b-coop', hud).textContent = coop.connected ? `Co-op · ${coop.players} / 2` : 'Co-op…'
    $('#b-coop', hud).classList.toggle('mint', coop.connected)
    $('#b-report', hud).classList.toggle('hidden', !m.landing)
    $('#meters', hud).innerHTML = metersHtml(m)
    $('#objline', hud).classList.toggle('alert', o.urgent)
    $('#crewn-wrap', hud).classList.toggle('hidden', !coop.connected)
    $('#crewn', hud).textContent = `${coop.players} / 2 CREW`
    $('#banner', hud).classList.toggle('hidden', !m.relayFault)
    $('#debug', hud).classList.toggle('hidden', !debugOn)
    // The map only earns its corner when the deck is wider than the window.
    map?.el.classList.toggle('hidden', deckFits(window.innerWidth, window.innerHeight))
    if (drawerOpen) renderDrawer()
  }
  if (screen === 'rover') rover?.powerChanged()
  pushView()
}
window.addEventListener('resize', () => { if (screen === 'station') refresh() })

// Debug read-out: frame rate, both clocks, sprite load. A developer view, off by default.
setInterval(() => {
  if (!debugOn || !mission || !hud || screen !== 'station' || !game) return
  const st = station()
  const s = Math.floor((Date.now() - mission.dockedAt) / 1000)
  const ph = st.exteriorPhase
  const ext = Math.floor(ph * 184)
  $('#dstats', hud).innerHTML = `FPS <b>${Math.round(game.loop.actualFps)}</b> · DPR ${window.devicePixelRatio.toFixed(2)}<br/>Docked <b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</b> real · Exterior 30× <b>${Math.floor(ext / 60)}:${String(ext % 60).padStart(2, '0')}</b>/3:04 ${ph < 0.62 ? 'day' : 'night'}<br/>Rover clock ${mission.pass ? `T+${fmt(mission.clock)}` : '—'} (simulated)<br/>Player ${Math.round(st.position.x)}, ${Math.round(st.position.y)} · remote crew ${st.remoteCount}<br/>Visual-only sprites <b>${st.loadCount}</b> / 3000`
}, 250)
window.addEventListener('keydown', e => {
  if (e.code !== 'Backquote' || screen !== 'station' || !game) return
  debugOn = !debugOn
  station().setDebug(debugOn)
  refresh()
})

setInterval(() => {
  if (!mission || !map || !game || screen !== 'station') return
  const st = station()
  if (st.created) map.update(st.position, objective(), st.remoteInfo())
}, 100)

// ------------------------------------------------------------------ Task drawer
function toggleDrawer(force?: boolean) {
  drawerOpen = force ?? !drawerOpen
  document.body.classList.toggle('drawer-open', drawerOpen) // toasts step aside for it
  $('#drawer')?.remove()
  if (drawerOpen) renderDrawer()
}
function renderDrawer() {
  const m = mission!
  $('#drawer')?.remove()
  const now = stepOf(m)
  const L = m.landing
  // What each step holds right now, in a few words.
  const notes = [
    `Life ${m.power.life} · comms ${m.power.comms} · research ${m.power.research}`,
    m.payloadActive ? `${m.instrumentInfo!.code} active` : m.instrumentDraft ? 'selected, not activated' : 'Payload, in the rover bay',
    m.relayFault ? 'Fault: patch it (free) or repair it (1 crew-hour)' : m.completed.has('relay') ? 'Repaired' : m.relayPatched ? `Patched: hand-off ${m.handoffMin} min` : 'Faults when the payload powers up',
    m.pass ? 'Plan sent' : m.ops ? `${m.ops.label} · ${byId(ROUTES, m.route).name} · ${byId(SCANS, m.scan).name}` : 'Rover Comms: date, route, scan',
    m.pass ? (m.passDone ? 'Last signal received' : `T+${fmt(m.clock)}`) : 'One pass, sent once',
    L ? (L.site === 'defer' ? 'Deferred' : byId(SITES, L.site).name) : 'After the last signal',
    m.completed.has('habitat') ? 'Habitat commissioned' : L ? 'Open the mission report' : 'Which choices caused the outcome',
  ]
  const steps = STEPS.map((name, i) => {
    const n = i + 1
    return `<div class="task ${n < now ? 'done' : n === now ? 'now' : ''}"><span class="ck">${n < now ? '✓' : n}</span><div><b>${name}</b><small>${esc(notes[i])}</small></div></div>`
  }).join('')
  const prep = (['medical', 'calibration', 'battery', 'water', 'cargo'] as TaskId[]).map(t => {
    const done = m.completed.has(t)
    const gate = done ? null : m.taskAvailable(t)
    const state = done ? 'Done' : gate ?? (m.drafts[t] ? 'Started · 1 crew-hour when finished' : '1 crew-hour')
    return `<div class="task ${done ? 'done' : gate ? 'off' : ''}"><span class="ck">${done ? '✓' : ''}</span><div><b>${TASK_INFO[t].name}${t === 'medical' && !done ? ' <em>the habitat needs it</em>' : ''}</b><small>${TASK_INFO[t].where} · ${esc(TASK_INFO[t].reward)}</small><small class="st8">${esc(state)}</small></div></div>`
  }).join('')
  const dr = el(`<aside class="drawer" id="drawer" aria-label="Tasks"><div class="row" style="justify-content:space-between"><h2 style="font-size:26px">Tasks</h2><button class="btn small" id="dclose">Close</button></div>
    <h3>Mission steps</h3>${steps}
    <h3>Preparation <span class="hrs">${m.prepLeft} of ${PREP_HOURS} crew-hours left</span></h3>
    <p class="drawer-note">Each task takes one crew-hour, and there are more tasks than hours. Choose what this mission needs.</p>${prep}</aside>`)
  $('#dclose', dr).addEventListener('click', () => toggleDrawer(false))
  hud?.append(dr)
}

// ------------------------------------------------------------------ Rover / sites / report
function goRover() {
  if (!mission) return
  const block = mission.roverAccess()
  if (block) { toast(block, 'warn'); return }
  closePanel()
  toggleDrawer(false)
  coop.away()
  game!.scene.sleep('station')
  station().clearRemotes()
  if (game!.scene.isSleeping('mars')) game!.scene.wake('mars')
  else if (!game!.scene.isActive('mars')) game!.scene.start('mars')
  rover = roverScreen({
    m: mission,
    mars,
    last: lastFlight,
    transmit: doTransmit,
    back: () => enterStation(),
    sites: goSites,
    report: goReport,
    openPanel: showPanel,
    refresh: () => {},
  })
  show('rover', rover.el)
  setBlocked(true)
  const init = () => { rover!.layoutMap(); rover!.render() }
  const ms = mars()
  if ((ms as unknown as { rover?: unknown }).rover) requestAnimationFrame(init)
  else ms.events.once('create', () => requestAnimationFrame(init))
}

async function doTransmit(): Promise<string | null> {
  const m = mission!
  const local = m.transmitBlock()
  if (local) return local
  if (coop.connected) {
    const n = await coop.checkTransmit()
    if (!n.ok) return n.text
    toast(n.text, 'ok')
  }
  return m.transmit()
}

function goSites() {
  overlay?.remove()
  clearToasts() // nothing sits on top of the landing decision
  const shut = () => { overlay?.remove(); overlay = null }
  overlay = sitesScreen(mission!, shut, () => { shut(); goReport() }, () => { shut(); enterStation() })
  document.body.append(overlay)
}

function goReport() {
  if (!mission) return
  rover?.stop()
  closePanel()
  toggleDrawer(false)
  clearToasts()
  if (game?.scene.isActive('station')) game.scene.sleep('station')
  game?.scene.sleep('mars')
  coop.away()
  setBlocked(true)
  show('report', reportScreen(mission, panelCtx(), {
    refly: () => { closePanel(); void dock(mission) },
    newMission: goFleet,
    title: goTitle,
  }))
}

function leaveGameplay() {
  rover?.stop()
  closePanel()
  overlay?.remove(); overlay = null
  toggleDrawer(false)
  hud = null
  map = null
  if (game) {
    if (game.scene.isActive('station')) game.scene.sleep('station')
    if (game.scene.isActive('mars')) game.scene.sleep('mars')
    game.loop.sleep()
    station()?.clearRemotes?.()
  }
  coop.away()
  setBlocked(true)
  clearHeld()
}

// ------------------------------------------------------------------ Co-op
let sharedPower: Power | null = null

function syncCrew() { /* remotes arrive via pose/crew messages after we announce ourselves */ }

function requestPower(p: Power) {
  const m = mission!
  if (!validPower(p)) { toast('Allocation must stay within 10 units.', 'warn'); return }
  if (!coop.connected) { m.setPower(p); refresh(); return }
  if (powerInFlight) { powerWanted = p; return }
  powerInFlight = true
  m.setPower(p) // optimistic; the server broadcast (or a rejection snapshot) settles it
  coop.allocate(p)
  refresh()
}

function applyShared(power: Power) {
  sharedPower = power
  powerInFlight = false
  if (mission) {
    mission.setPower(power)
    refresh()
    if (panelOpen()) refreshPanel(panelCtx())
  }
  if (powerWanted) { const w = powerWanted; powerWanted = null; requestPower(w) }
}

function openCoop() {
  closeCoop()
  setBlocked(true)
  coopPanel = el(`<div class="overlay" role="dialog" aria-modal="true" aria-label="Co-op"><div class="panel" style="width:min(520px,100%)">
    <div class="panel-head"><div style="flex:1"><div class="loc">TWO-PLAYER STATION</div><h2>Co-op</h2></div><button class="btn small" id="cclose">Close · Esc</button></div>
    <div class="panel-body" id="cbody"></div></div></div>`)
  document.body.append(coopPanel)
  $('#cclose', coopPanel).addEventListener('click', closeCoop)
  coopPanel.addEventListener('pointerdown', e => { if (e.target === coopPanel) closeCoop() })
  renderCoop()
}
function closeCoop() {
  coopPanel?.remove(); coopPanel = null
  setBlocked(panelOpen())
  refresh()
}
/** The title lobby's view of the co-op service: the same Colyseus room the in-station Co-op panel uses. */
const crewLink: CrewLink = {
  state: () => ({ status: coopStatus, error: coopError, url: coopUrl(), room: ROOM_NAME, roomId: coop.roomId, players: coop.players }),
  join: () => void joinCoop(),
  leave: leaveCoop,
}

async function leaveCoop() {
  await coop.leave()
  coopStatus = 'offline'
  if (game) station().clearRemotes()
  renderCoop()
  refresh()
}

/** Redraws whichever co-op view is on screen: the title lobby, the in-station panel, or neither. */
function renderCoop() {
  if (screen === 'title') titleUi?.update()
  if (!coopPanel) return
  const b = $('#cbody', coopPanel)
  const statusText = { offline: 'Not connected', connecting: 'Connecting…', connected: 'Connected', error: 'Connection failed' }[coopStatus]
  b.innerHTML = `<p class="lead">Share the station deck and the power grid with a second pilot in another tab or device. Each pilot keeps their own tasks, rover, clock and landing decision.</p>
    <div class="ledger"><span>Status</span><b style="color:${coop.connected ? '#6ef2c6' : coopStatus === 'error' ? '#ff5a4a' : '#b9ae95'}">${statusText}</b>
    <span>Service</span><b>${esc(coopUrl())}</b><span>Room</span><b>${coop.connected ? `spacer_power · ${esc(coop.roomId)}` : '—'}</b><span>Players</span><b>${coop.connected ? `${coop.players} / 2` : '—'}</b><span>Power revision</span><b>${coop.connected ? coop.revision : '—'}</b></div>
    ${coopStatus === 'error' ? `<div class="feedback bad">${esc(coopError)}<br/>Start the local service in a terminal with <code>npm run server</code>, keep it running, then retry.</div>` : ''}
    <div class="actions">${coop.connected ? '<button class="btn" id="cleave">Leave room</button>' : `<button class="btn primary" id="cjoin" ${coopStatus === 'connecting' ? 'disabled' : ''}>${coopStatus === 'error' ? 'Retry' : 'Join co-op room'}</button>`}</div>`
  $('#cjoin', b)?.addEventListener('click', joinCoop)
  $('#cleave', b)?.addEventListener('click', async () => { await leaveCoop(); toast('Left co-op. Solo play continues.', 'info') })
}

// The room can be joined from the title lobby, before the station scene exists, so every handler
// that touches the deck checks that the player is actually on it.
async function joinCoop() {
  if (coopStatus === 'connecting' || coop.connected) return
  soloOnly = false
  coopStatus = 'connecting'; renderCoop()
  try {
    await coop.join({
      onSnapshot: s => {
        coopStatus = 'connected'
        applyShared(s.power)
        if (screen === 'station') {
          for (const c of s.crew) if (c.id !== s.you) station().upsertRemote(c)
          station().forcePoseSend()
        }
        renderCoop()
        toast(`Joined co-op room ${s.roomId} (${s.players}/2).`, 'ok')
      },
      onPower: s => { applyShared(s.power); renderCoop() },
      onPose: (c: CrewMember) => { if (screen === 'station') station().upsertRemote(c) },
      onCrew: list => { if (screen !== 'station') return; for (const c of list) station().upsertRemote(c) },
      onGone: id => { if (game) station().removeRemote(id) },
      onRespawn: p => { if (screen !== 'station') return; station().respawn(p.x, p.y); toast('Moved aside so you do not overlap your crewmate.', 'info') },
      onNotice: n => {
        if (n.kind === 'allocate' && !n.ok) { powerInFlight = false; toast(n.text, 'warn') }
        if (n.kind === 'limit') toast(n.text, 'warn')
      },
      onClosed: reason => {
        coopStatus = 'offline'
        powerInFlight = false
        if (game) station().clearRemotes()
        toast(reason, 'warn')
        renderCoop(); refresh()
      },
    })
    if (soloOnly) await leaveCoop() // the join landed after the player had already started a solo mission
  } catch (e) {
    coopStatus = 'error'
    coopError = `Could not reach the co-op service at ${coopUrl()} (${(e as Error).message || 'offline'}).`
    renderCoop()
  }
}

// expose a tiny read-only hook for automated testing
;(window as unknown as { __spacer: unknown }).__spacer = {
  get mission() { return mission }, get screen() { return screen }, station: () => game && station(), coop,
}

goTitle()
