// What the station shows about the mission: the objective and where it sends the player, the
// state the live deck layer draws, and the deck map in the HUD.
import '../station.css'
import { SUITS, byId } from '../core/data'
import type { Mission } from '../core/mission'
import { fastRelay, powerBlock, type Power } from '../core/power'
import { fmt } from '../core/rover'
import { opsDate } from '../data/opsDates'
import { DECK, MODULES, SOLIDS, TERMINALS, moduleAt, terminal, type TerminalId } from '../game/deck'
import type { StationView } from '../game/stationFx'
import { el } from './dom'
import { linkMinutes } from './forecast'

/** Units each bus needs before the plan can be transmitted. Mirrors powerBlock() in core/power. */
export const NEED: Power = { life: 3, comms: 4, research: 0 }

export interface Objective {
  /** Which of the mission's steps this is, counted from 1. */
  step: number
  title: string
  text: string
  target: TerminalId | null
  urgent: boolean
}

/** The mission's steps in order, as the task list shows them. */
export const STEPS = [
  'Route station power',
  'Choose the rover instrument',
  'Fix the relay',
  'Prepare, then plan the pass',
  'Follow the rover pass',
  'Choose the landing site',
  'Read the debrief',
] as const

/** Which step the mission has reached, counted from 1. Steps before it are done. */
export function stepOf(m: Mission): number {
  if (m.relayFault) return 3
  if (!m.pass && powerBlock(m.power)) return 1
  if (!m.payloadActive) return 2
  if (!m.pass) return 4
  if (!m.passDone) return 5
  if (!m.landing) return 6
  return 7
}

/**
 * The next step, in words and as a place on the deck. The player reads the brief before
 * choosing a spacecraft, so the first step on the station is already a decision. The order
 * sweeps the deck once, from the Power Grid on the left to Rover Comms on the right, so no step
 * sends the player back across it.
 */
export function objectiveFor(m: Mission): Objective {
  const step = stepOf(m)
  const at = (target: TerminalId | null, text: string, urgent = false): Objective => ({ step, title: STEPS[step - 1], text, target, urgent })
  switch (step) {
    case 1: return at('power', 'The rover link needs Communications at 4 or more. Decide what the rest of the power buys.')
    case 2: return at('payload', m.instrumentDraft ? 'Activate the payload to lock the instrument in.' : 'Only one instrument flies. Each trades cost and battery against a sharper ice reading.')
    case 3: return at('comms', 'Powering up the payload knocked the relay out, as it always does. Patch it for free, or repair it for a crew-hour.', true)
    case 4: {
      const h = m.prepLeft
      const hours = `${h} crew-hour${h === 1 ? '' : 's'} left`
      const prep = h < 1 ? 'Your crew-hours are spent.'
        : !m.completed.has('medical') ? `${hours}. The habitat needs the crew medical check at Hab Systems.`
          : `${hours} for more preparation: see Tasks.`
      return at('comms', `${prep} When ready, plan the pass at Rover Comms.`)
    }
    case 5: return at('comms', `The rover is at work on Mars (T+${fmt(m.clock)}). Watch its signals arrive at Rover Comms.`)
    case 6: return at('comms', 'The last signal is in. Weigh the three sites at Rover Comms and commit, or wait in orbit.')
    default: return at(null, 'The mission is decided. Open the mission report to see which choices caused it.')
  }
}

/** Mission state in the shape the live deck layer draws. */
export function stationView(m: Mission, o: Objective, guide: boolean): StationView {
  // The Rover Comms screen splits the delay into its real part and our model's part.
  const d = m.plan ? opsDate(m.plan.date) : m.ops
  const direct = fastRelay(m.plan?.power ?? m.power)
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
    linkNote: d ? `${fmt(d.lightMin)} JPL HORIZONS ${direct ? '· DIRECT' : `+ ${m.plan?.handoffMin ?? m.handoffMin} RELAY`}` : 'NO OPERATIONS DATE YET',
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
