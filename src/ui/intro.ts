// Title screen (all DOM). Mission design, the pilot's details and the launch follow on the launch
// field (launchField.ts).
import type { ExtraId, InstrumentId, ShipId, SuitId } from '../core/data'
import { sound } from '../audio'
import { $, el, esc, isTouch } from './dom'
import { ICONS } from './icons'
import { mountBackdrop } from './titleScene'

/** What the pilot has chosen before docking: who flies, which launch system, and what is loaded on it. */
export interface Draft { callSign: string; suit: SuitId; ship: ShipId; instruments: InstrumentId[]; extras: ExtraId[] }

export type Mode = 'solo' | 'coop'
export type LinkStatus = 'offline' | 'connecting' | 'connected' | 'error'
/** What the title screen needs from the co-op service. main.ts backs it with the Colyseus room. */
export interface CrewLink {
  state(): { status: LinkStatus; error: string; url: string; room: string; roomId: string; players: number; /** This pilot decides the launch. */ host: boolean }
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
 * through the launch field, the launch and docking. The pilot who opened the room is its host and
 * chooses the launch system for both.
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
              <span class="t-d">Fly the same launch system, then share one station deck and one power grid with a crewmate, live over the co-op service.</span>
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
    <div class="foot"><span>A NASA Space Apps educational game. Scenario, terrain and ice readings are <b>simulated</b>; the signal delay, the Mars night cold and the facts about the launch systems are NASA data.</span>
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
    const key = [st.status, st.error, st.roomId, st.players, st.host].join('|')
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
      connected: '<button class="btn primary" id="lgo">Continue to the launch field →</button><button class="btn" id="lleave">Leave link</button>',
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
        ? `Room <b>${esc(st.room)} · ${esc(st.roomId)}</b> on ${esc(st.url)}. ${st.players > 1 ? 'Both seats are filled.' : 'The next pilot to open a crew link on this service joins you.'} ${st.host ? 'You are the host: you choose the launch system.' : 'The host chooses the launch system.'}`
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
