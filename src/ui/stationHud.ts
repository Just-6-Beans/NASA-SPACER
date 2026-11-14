// What the station shows about the mission: the objective and where it sends the player, the
// state the live deck layer draws, and the deck map in the HUD.
import '../station.css'
import { SUITS, byId } from '../core/data'
import type { Mission } from '../core/mission'
import { powerBlock, type Power } from '../core/power'
import { fmt } from '../core/rover'
import { DECK, MODULES, SOLIDS, TERMINALS, moduleAt, terminal, type TerminalId } from '../game/deck'
import type { StationView } from '../game/stationFx'
import { el } from './dom'
import { linkMinutes } from './forecast'

/** Units each bus needs before the plan can be transmitted. Mirrors powerBlock() in core/power. */
export const NEED: Power = { life: 3, comms: 4, research: 0 }

export interface Objective { text: string; target: TerminalId | null; urgent: boolean }

/** The next step, in words and as a place on the deck. */
export function objectiveFor(m: Mission, briefed: boolean): Objective {
  const at = (target: TerminalId, text: string, urgent = false): Objective => ({ text, target, urgent })
  // The brief comes first, but a player who walks past it and starts work is not sent back.
  if (!briefed && !m.instrumentDraft && !m.payloadActive) return at('ops', 'Read the mission brief at the Mission Ops table (centre, under the cupola).')
  if (!m.payloadActive) return at('payload', m.instrumentDraft ? 'Activate the payload at the Payload terminal in the rover bay.' : 'Choose a rover instrument at the Payload terminal in the rover bay (centre).')
  if (m.relayFault) return at('comms', 'EMERGENCY: repair the relay at Rover Comms (node C, rear right).', true)
  if (!m.pass) {
    const pb = powerBlock(m.power)
    if (pb) return at('power', `Route power at the Power Grid (node A, rear left): ${pb}`)
    if (!m.calibrated) return at('comms', 'Optional: calibrate at the Calibration bench (node C, front right). Then plan and transmit at Rover Comms.')
    return at('comms', 'Plan the Drive → Scan → Return pass and transmit at Rover Comms.')
  }
  if (!m.passDone) return at('comms', `Rover pass under way (T+${fmt(m.clock)}). Follow telemetry at Rover Comms.`)
  if (!m.landing) return at('comms', 'Final telemetry received. Choose a landing site at Rover Comms.')
  return { text: 'Mission decided. Review the report.', target: null, urgent: false }
}

/** Mission state in the shape the live deck layer draws. */
export function stationView(m: Mission, o: Objective, guide: boolean): StationView {
  return {
    ship: m.ship.id,
    power: { ...m.power },
    need: NEED,
    relayFault: m.relayFault,
    instrument: m.instrument,
    instrumentDraft: m.instrumentDraft,
    calibrated: m.calibrated,
    battery: m.ship.battery,
    linkMin: linkMinutes(m),
    passClock: m.pass ? m.clock : null,
    passDone: m.passDone,
    water: m.completed.has('water'),
    medical: m.completed.has('medical'),
    target: o.target,
    urgent: o.urgent,
    guide,
  }
}

export interface DeckMap {
  el: HTMLElement
  update(me: { x: number; y: number }, o: Objective, crew: { x: number; y: number }[]): void
}

/** A small plan of the three nodes: where you are, where your crewmate is, where to go next. */
export function deckMap(m: Mission): DeckMap {
  const top = DECK.wallY - 30
  const suit = byId(SUITS, m.profile.suit)
  const isTerminal = (id: string) => TERMINALS.some(t => t.id === id)
  const root = el(`<div class="deckmap" aria-hidden="true"><svg viewBox="0 ${top} ${DECK.width} ${DECK.height - top}">
    <rect x="2" y="${top + 2}" width="${DECK.width - 4}" height="${DECK.height - top - 4}" rx="26" class="hull"/>
    ${MODULES.map(n => `<rect x="${n.x}" y="${DECK.wallY}" width="${n.w}" height="${DECK.frontY - DECK.wallY}" fill="${n.tint}" fill-opacity=".13"/>
      <text x="${n.x + n.w / 2}" y="${DECK.frontY - 16}" text-anchor="middle" fill="${n.tint}">${n.id}</text>`).join('')}
    ${SOLIDS.filter(s => !s.id.startsWith('wall')).map(s => `<rect x="${s.rect[0]}" y="${s.rect[1]}" width="${s.rect[2]}" height="${s.rect[3]}" rx="6" class="${isTerminal(s.id) ? 'station' : 'block'}"/>`).join('')}
    <g id="mm-crew"></g>
    <circle id="mm-ring" r="26" class="ring"/><circle id="mm-goal" r="15" class="goal"/>
    <circle id="mm-me" r="17" fill="${suit.light}" stroke="#05121c" stroke-width="5"/>
  </svg><div class="deckmap-cap"><span id="mm-node"></span><span id="mm-next"></span></div></div>`)
  const q = (id: string) => root.querySelector(`#${id}`) as SVGElement
  const me = q('mm-me'), goal = q('mm-goal'), ring = q('mm-ring'), crewG = q('mm-crew')
  const node = root.querySelector('#mm-node') as HTMLElement, next = root.querySelector('#mm-next') as HTMLElement
  let last = ''
  return {
    el: root,
    update(pos, o, crew) {
      me.setAttribute('cx', String(Math.round(pos.x)))
      me.setAttribute('cy', String(Math.round(pos.y)))
      const t = o.target ? terminal(o.target) : null
      const here = moduleAt(pos.x)
      const sig = `${o.target}|${o.urgent}|${crew.map(c => `${Math.round(c.x)},${Math.round(c.y)}`).join(';')}|${here.id}`
      if (sig === last) return
      last = sig
      for (const c of [goal, ring]) {
        c.style.display = t ? '' : 'none'
        if (t) { c.setAttribute('cx', String(t.at[0])); c.setAttribute('cy', String(t.at[1])) }
        c.classList.toggle('urgent', o.urgent)
      }
      crewG.innerHTML = crew.map(c => `<circle cx="${Math.round(c.x)}" cy="${Math.round(c.y)}" r="15" class="mate"/>`).join('')
      node.textContent = `Node ${here.id}`
      next.textContent = t ? `→ ${t.name}` : ''
      next.classList.toggle('urgent', o.urgent)
    },
  }
}
