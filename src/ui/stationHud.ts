// What the station shows about the mission: the objective and where it sends the player, the
// state the live deck layer draws, and the deck map in the HUD.
import '../station.css'
import { SUITS, byId } from '../core/data'
import type { Mission } from '../core/mission'
import { fastRelay, powerBlock, type Power } from '../core/power'
import { spendPct } from '../core/survey'
import { DECK, LINKS, MODULES, SOLIDS, TERMINALS, moduleAt, terminal, type TerminalId } from '../game/deck'
import type { StationView } from '../game/stationFx'
import { el } from './dom'

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** Units each bus needs before the rover can be sent out. Mirrors powerBlock() in core/power. */
export const NEED: Power = { life: 3, comms: 4, research: 0 }

export interface Objective { text: string; target: TerminalId | null; urgent: boolean }

/** The next step, in words and as a place on the deck. */
export function objectiveFor(m: Mission, briefed: boolean): Objective {
  const at = (target: TerminalId, text: string, urgent = false): Objective => ({ text, target, urgent })
  // The brief comes first, but a player who walks past it and starts work is not sent back.
  if (!briefed && !m.instrumentDraft && !m.payloadActive) return at('ops', 'Read the mission brief at the Mission Ops table in the US Lab (down the hatch, then left).')
  if (!m.payloadActive) return at('payload', m.instrumentDraft ? 'Activate the payload at the Payload terminal in the rover bay (US Lab).' : 'Choose a rover instrument at the Payload terminal in the rover bay (US Lab).')
  if (m.relayFault) return at('comms', 'EMERGENCY: repair the relay at Rover Comms (Comms module, below Node 2).', true)
  if (m.base) return { text: 'Mission decided. Review the report.', target: null, urgent: false }
  const pb = powerBlock(m.power, m.lifeNeed)
  const rv = m.rover
  if (!rv) return pb ? at('power', `Route power at the Power Grid (Node 1): ${pb}`) : at('comms', 'Open Rover Comms (Comms module, below Node 2) and choose your rover.')
  if (pb) return at('power', `Route power at the Power Grid (Node 1): ${pb}`)
  if (m.charging) return at('comms', `${rv.name} is recharging (${spendPct(rv, m.batteryWh)}%). Do station tasks meanwhile, or watch the timer at Rover Comms.`)
  if (m.timeUp) return at('comms', `The ${m.missionSols} Mars days are over. Choose the base at Rover Comms.`)
  if (m.stranded || !m.canDrive) return at('comms', `${rv.name} is low on battery. Recharge it or choose the base at Rover Comms.`)
  if (!m.calibrated && !m.drives.length) return at('comms', 'Optional: calibrate at the Calibration bench (US Lab). Then drive your rover at Rover Comms.')
  return at('comms', `Plan ${rv.name}'s drive on the map at Rover Comms (day ${m.sol} of ${m.missionSols}).`)
}

/** Mission state in the shape the live deck layer draws. */
export function stationView(m: Mission, o: Objective, guide: boolean): StationView {
  // The Rover Comms screen splits the delay into its real part and our model's part.
  const d = m.ops
  const direct = fastRelay(m.power)
  const rv = m.rover
  return {
    ship: m.ship.id,
    power: { ...m.power },
    need: { ...NEED, life: m.lifeNeed },
    relayFault: m.relayFault,
    instrument: m.instrument,
    instrumentDraft: m.instrumentDraft,
    calibrated: m.calibrated,
    // The rover bay screen: the rover's battery gauge once a rover is chosen, the cradle charge before.
    battery: rv ? spendPct(rv, m.batteryWh) : m.ship.battery,
    linkMin: m.signalMin,
    linkNote: `${fmt(d.lightMin)} JPL HORIZONS ${direct ? '· DIRECT' : `+ ${m.ship.handoffMin} RELAY`}`,
    // The rover expedition has no timed pass, so the deck never shows one in progress.
    passClock: null,
    passDone: false,
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

/** A small plan of the station: where you are, where your crewmate is, where to go next. */
export function deckMap(m: Mission): DeckMap {
  const suit = byId(SUITS, m.profile.suit)
  const isTerminal = (id: string) => TERMINALS.some(t => t.id === id)
  const root = el(`<div class="deckmap" aria-hidden="true"><svg viewBox="20 70 ${DECK.width - 40} ${DECK.height - 90}">
    ${LINKS.map(l => `<rect x="${l.rect[0] - (l.kind === 'tunnel' ? 14 : 0)}" y="${l.rect[1] - (l.kind === 'hatch' ? 14 : 0)}" width="${l.rect[2] + (l.kind === 'tunnel' ? 28 : 0)}" height="${l.rect[3] + (l.kind === 'hatch' ? 28 : 0)}" class="link"/>`).join('')}
    ${MODULES.map(n => `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="44" class="hull"/><rect x="${n.floor[0]}" y="${n.floor[1]}" width="${n.floor[2]}" height="${n.floor[3]}" rx="18" fill="${n.tint}" fill-opacity=".16"/>`).join('')}
    ${SOLIDS.filter(s => isTerminal(s.id)).map(s => `<rect x="${s.rect[0]}" y="${s.rect[1]}" width="${s.rect[2]}" height="${s.rect[3]}" rx="8" class="station"/>`).join('')}
    <g id="mm-crew"></g>
    <circle id="mm-ring" r="46" class="ring"/><circle id="mm-goal" r="27" class="goal"/>
    <circle id="mm-me" r="30" fill="${suit.light}" stroke="#05121c" stroke-width="9"/>
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
      const here = moduleAt(pos.x, pos.y)
      const sig = `${o.target}|${o.urgent}|${crew.map(c => `${Math.round(c.x)},${Math.round(c.y)}`).join(';')}|${here.id}`
      if (sig === last) return
      last = sig
      for (const c of [goal, ring]) {
        c.style.display = t ? '' : 'none'
        if (t) { c.setAttribute('cx', String(t.at[0])); c.setAttribute('cy', String(t.at[1])) }
        c.classList.toggle('urgent', o.urgent)
      }
      crewG.innerHTML = crew.map(c => `<circle cx="${Math.round(c.x)}" cy="${Math.round(c.y)}" r="27" class="mate"/>`).join('')
      node.textContent = here.name
      next.textContent = t ? `→ ${t.name}` : ''
      next.classList.toggle('urgent', o.urgent)
    },
  }
}
