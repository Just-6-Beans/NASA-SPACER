// Co-op client. The networking SDK loads only when the player opens Co-op, so solo play works
// with the server offline.
import type { Room } from '@colyseus/sdk'
import type { ShipId } from './core/data'
import type { Power } from './core/power'
import { ROOM_NAME, type CrewMember, type FlightState, type Notice, type Pose, type PowerState, type Snapshot } from './core/protocol'

export const coopUrl = () => import.meta.env.VITE_COOP_URL || `ws://${location.hostname === 'localhost' ? '127.0.0.1' : location.hostname || '127.0.0.1'}:2567`

export interface CoopHandlers {
  onSnapshot(s: Snapshot): void
  onPower(s: PowerState): void
  /** The host, the host's rocket or the launch changed. */
  onFlight(f: FlightState): void
  onPose(m: CrewMember): void
  onCrew(list: CrewMember[]): void
  onGone(id: string): void
  onRespawn(p: { x: number; y: number }): void
  onNotice(n: Notice): void
  onClosed(reason: string): void
}

const NO_FLIGHT: FlightState = { host: '', ship: null, launched: false, launches: 0 }

export class Coop {
  room: Room | null = null
  revision = 0
  players = 0
  you = ''
  /** The room's launch decision. Outside a room it is empty and nobody is host. */
  flight: FlightState = NO_FLIGHT
  private pending: ((n: Notice) => void) | null = null

  get connected() { return !!this.room }
  get roomId() { return this.room?.roomId ?? '' }
  /** In a room, exactly one pilot is the host: the one who has been there longest. */
  get isHost() { return !!this.room && this.flight.host === this.you }

  async join(h: CoopHandlers): Promise<void> {
    const { Client } = await import('@colyseus/sdk')
    const client = new Client(coopUrl())
    const room = await Promise.race([
      client.joinOrCreate(ROOM_NAME),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ])
    this.room = room
    room.onMessage('snapshot', (s: Snapshot) => {
      this.revision = s.revision; this.players = s.players; this.you = s.you
      // A service from before the launch field sends no flight: then each pilot decides for themselves.
      this.flight = s.flight ?? { ...NO_FLIGHT, host: s.you }
      h.onSnapshot(s)
    })
    room.onMessage('flight', (f: FlightState) => { this.flight = f; h.onFlight(f) })
    room.onMessage('power', (s: PowerState) => { this.revision = s.revision; this.players = s.players; h.onPower(s) })
    room.onMessage('pose', (m: CrewMember) => { if (m.id !== this.you) h.onPose(m) })
    room.onMessage('crew', (list: CrewMember[]) => h.onCrew(list.filter(m => m.id !== this.you)))
    room.onMessage('gone', (id: string) => h.onGone(id))
    room.onMessage('respawn', (p: { x: number; y: number }) => h.onRespawn(p))
    room.onMessage('notice', (n: Notice) => {
      if (n.kind === 'transmit' && this.pending) { const p = this.pending; this.pending = null; p(n) }
      h.onNotice(n)
    })
    room.send('hello')
    room.onLeave(code => {
      this.room = null
      this.flight = NO_FLIGHT
      h.onClosed(code === 1000 || code === 4000 ? 'You left the co-op room.' : 'Lost connection to the co-op service.')
    })
  }

  sendPose(p: Pose) { this.room?.send('pose', p) }
  away() { this.room?.send('away') }
  allocate(power: Power) { this.room?.send('allocate', { power, revision: this.revision }) }
  /** Host only: the rocket now standing on the pad. */
  sendShip(ship: ShipId) { this.room?.send('ship', ship) }
  /** Host only: the countdown has started on this rocket. */
  sendLaunch(ship: ShipId) { this.room?.send('launch', ship) }

  /** Asks the server to authorize transmission against the latest power revision. */
  checkTransmit(): Promise<Notice> {
    if (!this.room) return Promise.resolve({ kind: 'transmit', ok: true, text: 'Solo' })
    return new Promise(res => {
      const timer = setTimeout(() => { this.pending = null; res({ kind: 'transmit', ok: false, text: 'Co-op server did not answer the transmit check in time. Try again.' }) }, 4000)
      this.pending = n => { clearTimeout(timer); res(n) }
      this.room!.send('transmit-check', this.revision)
    })
  }

  async leave() {
    const r = this.room
    this.room = null
    this.pending = null
    this.flight = NO_FLIGHT
    if (r) await r.leave(true).catch(() => {})
  }
}
