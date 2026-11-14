// Co-op client. The networking SDK loads only when the player opens Co-op, so solo play works
// with the server offline.
import type { Room } from '@colyseus/sdk'
import type { Power } from './core/power'
import { ROOM_NAME, type CrewMember, type Notice, type Pose, type PowerState, type Snapshot } from './core/protocol'

export const coopUrl = () => import.meta.env.VITE_COOP_URL || `ws://${location.hostname === 'localhost' ? '127.0.0.1' : location.hostname || '127.0.0.1'}:2567`

export interface CoopHandlers {
  onSnapshot(s: Snapshot): void
  onPower(s: PowerState): void
  onPose(m: CrewMember): void
  onCrew(list: CrewMember[]): void
  onGone(id: string): void
  onRespawn(p: { x: number; y: number }): void
  onNotice(n: Notice): void
  onClosed(reason: string): void
}

export class Coop {
  room: Room | null = null
  revision = 0
  players = 0
  you = ''
  private pending: ((n: Notice) => void) | null = null

  get connected() { return !!this.room }
  get roomId() { return this.room?.roomId ?? '' }

  async join(h: CoopHandlers): Promise<void> {
    const { Client } = await import('@colyseus/sdk')
    const client = new Client(coopUrl())
    const room = await Promise.race([
      client.joinOrCreate(ROOM_NAME),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ])
    this.room = room
    room.onMessage('snapshot', (s: Snapshot) => { this.revision = s.revision; this.players = s.players; this.you = s.you; h.onSnapshot(s) })
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
      h.onClosed(code === 1000 || code === 4000 ? 'You left the co-op room.' : 'Lost connection to the co-op service.')
    })
  }

  sendPose(p: Pose) { this.room?.send('pose', p) }
  away() { this.room?.send('away') }
  allocate(power: Power) { this.room?.send('allocate', { power, revision: this.revision }) }

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
    if (r) await r.leave(true).catch(() => {})
  }
}
