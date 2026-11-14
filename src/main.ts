import './style.css'
import './holo.css'
import './title.css'
import { ICONS } from './ui/icons'
import type Phaser from 'phaser'
import { SHIPS, SUITS, byId, type ShipId, type SuitId } from './core/data'
import { Mission, TASK_INFO } from './core/mission'
import { powerBlock, validPower, type Power } from './core/power'
import { fmt } from './core/rover'
import type { TaskId } from './core/tasks'
import { ROOM_NAME, type CrewMember } from './core/protocol'
import { sound } from './audio'
import { Coop, coopUrl } from './coop'
import { createGame, type MarsScene, type StationScene, type Terminal } from './game/game'
import { bindDpad, clearHeld, input, setBlocked } from './game/input'
import { $, el, esc, isTouch, toast } from './ui/dom'
import { crewScreen, fleetScreen, launchScreen, titleScreen, type CrewLink, type Draft, type LinkStatus, type Mode, type TitleUi } from './ui/intro'
import { closePanel, openPanel, panelOpen, refreshPanel, type PanelCtx } from './ui/panels'
import { reportScreen, sitesScreen } from './ui/report'
import { roverScreen } from './ui/roverView'
import { NEED, deckMap, objectiveFor, stationView, type DeckMap } from './ui/stationHud'

type ScreenName = 'title' | 'fleet' | 'crew' | 'launch' | 'station' | 'rover' | 'report'

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
let briefed = false // the mission brief at Mission Ops has been opened in this session
let guideOn = (() => { try { return localStorage.getItem('spacer.guide') !== '0' } catch { return true } })()
let drawerOpen = false
let debugOn = false
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
  goFleet()
}
function goFleet() { show('fleet', fleetScreen(draft, goTitle, ship => { draft.ship = ship; saveDraft(); goCrew() })) }
function goCrew() { show('crew', crewScreen(draft, goFleet, d => { draft = d; saveDraft(); goLaunch() })) }
function goLaunch() { show('launch', launchScreen(draft, () => void dock())) }

async function dock() {
  await gameReady
  mission = new Mission({ callSign: draft.callSign, suit: draft.suit as SuitId, ship: draft.ship as ShipId })
  if (coop.connected && sharedPower) mission.setPower(sharedPower)
  prevFault = false
  enterStation(true)
  toast(`Docked at 408 km. Welcome aboard, ${mission.profile.callSign}.`, 'ok')
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
  setBlocked(true)
  if (id === 'ops') briefed = true
  openPanel(id, panelCtx())
}
function closeTask() {
  closePanel()
  setBlocked(!!coopPanel)
  refresh()
}

function completeTask(task: TaskId, detail: string) {
  if (!mission!.complete(task, detail)) return
  sound.play('success')
  toast(`${TASK_INFO[task].name} complete: ${TASK_INFO[task].reward}.`, 'ok')
  refresh()
}

const objective = () => objectiveFor(mission!, briefed)

/** Hands the mission state to the deck, which draws it: power buses, consoles, guide. */
function pushView() {
  if (mission && game) station().setView(stationView(mission, objective(), guideOn))
}

function buildHud(): HTMLElement {
  const m = mission!
  const suit = byId(SUITS, m.profile.suit)
  hud = el(`<section class="screen hud" aria-label="Station">
    <div class="ops-head"><div class="brand">SPACER</div><div class="sect">ORBITAL OPERATIONS</div>
      <div class="hud-buttons"><button class="btn small" id="b-tasks">Tasks</button><button class="btn small" id="b-guide"></button><button class="btn small" id="b-sound"></button><button class="btn small" id="b-debug">Debug</button><button class="btn small" id="b-coop">Co-op</button></div>
      <div class="crewtag" title="${esc(m.profile.callSign)} · ${m.ship.name} · ${suit.name} suit"><span class="sw" style="background:${suit.primary}"></span><div><b>${esc(m.profile.callSign)}</b><br/><span>${m.ship.name} · ${suit.name}</span></div></div>
      <div class="crewn">${ICONS.crew}<span id="crewn">1 / 2 CREW</span></div></div>
    <div class="ops-sub">
      <div class="objline" id="objline" role="status"><span class="box"></span><span id="obj"></span></div>
    </div>
    <div class="statbar" id="meters" aria-label="Station power"></div>
    <div class="clocks" id="clocks"></div>
    <div class="banner hidden" id="banner" role="alert">⚠ Relay fault · Mars link down · Repair at Rover Comms</div>
    <div class="prompt hidden" id="prompt"></div>
    <div class="debugbox hidden" id="debug"><div id="dstats"></div><button class="btn small" id="d-add">+250 sprites</button> <button class="btn small" id="d-rst">Reset sprites</button><div style="margin-top:4px"><span style="color:#ff8a7a">red</span> = collision · <span style="color:#6ef2c6">mint</span> = feet · <span style="color:#ffb347">amber</span> = reach</div></div>
    ${isTouch() ? `<div class="dpad" id="dpad">
      <span></span><button data-dir="up" aria-label="Up">▲</button><span></span>
      <button data-dir="left" aria-label="Left">◀</button><button data-dir="jog" aria-label="Jog">⇧</button><button data-dir="right" aria-label="Right">▶</button>
      <span></span><button data-dir="down" aria-label="Down">▼</button><span></span></div>
      <button class="act" id="touch-act" aria-label="Interact">E</button>` : ''}
  </section>`)
  $('#b-tasks', hud).addEventListener('click', () => toggleDrawer())
  $('#b-sound', hud).addEventListener('click', () => { sound.setMuted(!sound.muted); sound.play('ui'); refresh() })
  $('#b-debug', hud).addEventListener('click', () => { debugOn = !debugOn; station().setDebug(debugOn); refresh() })
  $('#b-coop', hud).addEventListener('click', openCoop)
  $('#b-guide', hud).addEventListener('click', () => { guideOn = !guideOn; try { localStorage.setItem('spacer.guide', guideOn ? '1' : '0') } catch { /* ignore */ } sound.play('ui'); refresh() })
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

function refresh() {
  const m = mission
  if (!m) return
  if (m.relayFault && !prevFault) { sound.play('relay'); toast('Relay fault! The Mars link dropped when the payload powered up.', 'bad', 6000) }
  if (!m.relayFault && prevFault) toast('Relay restored. Rover planner online.', 'ok')
  prevFault = m.relayFault
  if (hud && screen === 'station') {
    $('#obj', hud).textContent = objective().text
    $('#b-guide', hud).textContent = guideOn ? 'Guide: on' : 'Guide: off'
    $('#b-guide', hud).classList.toggle('mint', guideOn)
    $('#b-sound', hud).textContent = sound.muted ? 'Sound: off' : 'Sound: on'
    $('#b-debug', hud).classList.toggle('mint', debugOn)
    $('#b-coop', hud).textContent = coop.connected ? `Co-op · ${coop.players}` : 'Co-op'
    $('#b-coop', hud).classList.toggle('mint', coop.connected)
    const p = m.power
    $('#meters', hud).innerHTML = ([['Life support', ICONS.leaf, 'life'], ['Comms', ICONS.signal, 'comms'], ['Research', ICONS.flask, 'research']] as [string, string, keyof Power][]).map(([n, ic, k]) =>
      `<div class="sm bus-${k} ${p[k] < NEED[k] ? 'low' : ''}" title="${n}: ${p[k]} of 10 units${NEED[k] ? `, needs ${NEED[k]} to transmit` : ''}">${ic}<b>${n}<span>${p[k]}/10</span></b><div class="bar"><i style="width:${p[k] * 10}%"></i></div></div>`).join('')
    $('#objline', hud).classList.toggle('alert', m.relayFault)
    $('#crewn', hud).textContent = `${coop.connected ? coop.players : 1} / 2 CREW`
    $('#banner', hud).classList.toggle('hidden', !m.relayFault)
    $('#debug', hud).classList.toggle('hidden', !debugOn)
    if (drawerOpen) renderDrawer()
  }
  pushView()
}

// clocks + debug readout
setInterval(() => {
  if (!mission || !hud || screen !== 'station') return
  const s = Math.floor((Date.now() - mission.dockedAt) / 1000)
  const st = game && station()
  const ph = st?.exteriorPhase ?? 0
  const ext = Math.floor(ph * 184)
  $('#clocks', hud).innerHTML = `Docked <b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</b> real · Exterior 30× <b>${Math.floor(ext / 60)}:${String(ext % 60).padStart(2, '0')}</b>/3:04 ${ph < 0.62 ? 'day' : 'night'}<br/>Rover <b>${mission.pass ? `T+${fmt(mission.clock)}` : 'not transmitted'}</b>`
  if (debugOn && st) {
    $('#dstats', hud).innerHTML = `FPS <b>${Math.round(game!.loop.actualFps)}</b> · DPR ${window.devicePixelRatio.toFixed(2)}<br/>Docked clock ${s}s real · Exterior ${(ph * 100).toFixed(0)}% of 30× orbit<br/>Rover clock ${mission.pass ? `T+${fmt(mission.clock)}` : '—'} (simulated)<br/>Player ${Math.round(st.position.x)}, ${Math.round(st.position.y)} · remote crew ${st.remoteCount}<br/>Visual-only sprites <b>${st.loadCount}</b> / 3000`
  }
}, 250)

setInterval(() => {
  if (!mission || !map || !game || screen !== 'station') return
  const st = station()
  if (st.created) map.update(st.position, objective(), st.remoteInfo())
}, 100)

// ------------------------------------------------------------------ Task drawer
function toggleDrawer(force?: boolean) {
  drawerOpen = force ?? !drawerOpen
  $('#drawer')?.remove()
  if (drawerOpen) renderDrawer()
}
function renderDrawer() {
  const m = mission!
  $('#drawer')?.remove()
  const item = (done: boolean, name: string, where: string, prog: string, em = false) =>
    `<div class="task ${done ? 'done' : ''} ${em && !done ? 'em' : ''}"><span class="ck"></span><div><b>${esc(name)}</b><small>${esc(where)} · ${esc(prog)}</small></div></div>`
  const d = (k: string) => m.drafts[k] as Record<string, unknown> | undefined
  const prog = (t: TaskId) => m.completed.has(t) ? 'complete' : d(t) ? 'in progress (draft saved)' : 'not started'
  const routine = (['battery', 'cargo', 'water', 'medical'] as TaskId[]).map(t => item(m.completed.has(t), TASK_INFO[t].name, TASK_INFO[t].where, `${prog(t)} · ${TASK_INFO[t].reward}`)).join('')
  const missionItems = [
    item(briefed, 'Read the mission brief', 'Mission Ops', briefed ? 'read' : 'not read'),
    item(m.payloadActive, 'Select & activate payload', 'Payload', m.payloadActive ? `${m.instrumentInfo!.code} active` : m.instrumentDraft ? 'instrument selected' : 'not started'),
    item(!powerBlock(m.power), 'Route transmission power', 'Power Grid', `life ${m.power.life}/3 · comms ${m.power.comms}/4`),
    item(m.completed.has('calibration'), 'Two-point calibration (optional)', 'Calibration', prog('calibration')),
    item(!!m.pass, 'Transmit rover plan', 'Rover Comms', m.pass ? `sent · T+${fmt(m.clock)}` : 'not sent'),
    item(!!m.landing, 'Landing decision', 'Rover Comms', m.landing ? m.landing.site : m.passDone ? 'ready' : 'awaiting telemetry'),
    item(m.completed.has('habitat'), 'Habitat commissioning', 'Mission Report', m.completed.has('habitat') ? 'complete' : m.landing?.approved ? (m.completed.has('medical') ? 'available' : 'needs medical clearance') : 'needs approved landing'),
  ].join('')
  const emergency = m.payloadActive ? item(m.completed.has('relay'), 'Relay repair', 'Rover Comms', m.relayFault ? 'FAULT ACTIVE' : 'repaired', true) : '<div class="task"><span></span><small>No emergencies.</small></div>'
  const dr = el(`<aside class="drawer" id="drawer" aria-label="Tasks"><div class="row" style="justify-content:space-between"><h2 style="font-size:26px">Tasks</h2><button class="btn small" id="dclose">Close</button></div>
    <h3>Emergency</h3>${emergency}<h3>Mission</h3>${missionItems}<h3>Routine (optional)</h3>${routine}
    <p style="font-size:12px;color:#b9ae95">Routine tasks are optional, but each one changes what you can afford or accomplish.</p></aside>`)
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
    transmit: doTransmit,
    back: () => enterStation(),
    sites: goSites,
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
  overlay = sitesScreen(mission!, () => { overlay?.remove(); overlay = null }, () => { overlay?.remove(); overlay = null; goReport() })
  document.body.append(overlay)
}

function goReport() {
  rover?.stop()
  game?.scene.sleep('mars')
  coop.away()
  show('report', reportScreen(mission!, panelCtx(), replay, goTitle))
}

function replay() {
  closePanel()
  dock()
}

function leaveGameplay() {
  rover?.stop()
  closePanel()
  overlay?.remove(); overlay = null
  drawerOpen = false
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
    rover?.powerChanged()
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
