// SPACER co-op service: one two-player room that shares station presence and the power grid.
// Each client still simulates its own tasks, rover and mission clock.
import { Room, Server, type Client } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { DEFAULT_POWER, powerBlock, validPower, type Power } from '../src/core/power'
import { ROOM_NAME, WORLD, cleanPose, validPose, type CrewMember, type NoticeKind } from '../src/core/protocol'

const HOST = process.env.HOST || '127.0.0.1'
const PORT = Number(process.env.PORT || 2567)

class Bucket {
  private tokens: number
  private last = Date.now()
  constructor(private rate: number, private burst: number) { this.tokens = burst }
  take() {
    const now = Date.now()
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate)
    this.last = now
    if (this.tokens < 1) return false
    this.tokens--
    return true
  }
}

export class PowerRoom extends Room {
  maxClients = 2
  private power: Power = { ...DEFAULT_POWER }
  private revision = 0
  private crew = new Map<string, CrewMember>()
  private buckets = new Map<string, { pose: Bucket; control: Bucket }>()

  private state0() { return { power: this.power, revision: this.revision, players: this.clients.length } }
  private notice(c: Client, kind: NoticeKind, ok: boolean, text: string) { c.send('notice', { kind, ok, text }) }
  private allow(c: Client, kind: 'pose' | 'control') { return this.buckets.get(c.sessionId)?.[kind].take() ?? false }

  /** Spread a newly arriving pose away from crewmates so avatars do not overlap. */
  private separate(id: string, m: CrewMember): CrewMember {
    for (const other of this.crew.values()) {
      if (other.id === id) continue
      if (Math.hypot(other.x - m.x, other.y - m.y) < 40) {
        m.x = Math.min(WORLD.width - 60, Math.max(60, m.x + (m.x <= other.x ? -70 : 70)))
      }
    }
    return m
  }

  onCreate() {
    // The client asks for its initial snapshot once its message handlers are registered.
    this.onMessage('hello', client => {
      if (!this.allow(client, 'control')) return
      client.send('snapshot', { ...this.state0(), crew: [...this.crew.values()], you: client.sessionId, roomId: this.roomId })
    })
    this.onMessage('pose', (client, value: unknown) => {
      if (!this.allow(client, 'pose') || !validPose(value)) return
      const id = client.sessionId // identity always comes from the room session, never the payload
      const first = !this.crew.has(id)
      let member: CrewMember = { id, ...cleanPose(value) }
      if (first) {
        member = this.separate(id, member)
        if (member.x !== value.x) client.send('respawn', { x: member.x, y: member.y })
      }
      this.crew.set(id, member)
      this.broadcast('pose', member, { except: client })
      if (first) this.broadcast('crew', [...this.crew.values()])
    })
    this.onMessage('away', client => {
      if (!this.allow(client, 'control')) return
      if (this.crew.delete(client.sessionId)) this.broadcast('gone', client.sessionId)
    })
    this.onMessage('allocate', (client, value: unknown) => {
      if (!this.allow(client, 'control')) return this.notice(client, 'limit', false, 'Too many power changes. Wait a moment.')
      const v = value as { power?: unknown; revision?: unknown } | null
      if (!v || !validPower(v.power)) {
        this.notice(client, 'allocate', false, 'Server rejected allocation: whole units only, total at most 10.')
        return client.send('power', this.state0())
      }
      if (v.revision !== this.revision) {
        this.notice(client, 'allocate', false, 'Stale allocation: your crewmate changed the grid first. Showing the latest settings.')
        return client.send('power', this.state0())
      }
      const { life, comms, research } = v.power
      this.power = { life, comms, research }
      this.revision++
      this.broadcast('power', this.state0())
    })
    this.onMessage('transmit-check', (client, revision: unknown) => {
      if (!this.allow(client, 'control')) return this.notice(client, 'limit', false, 'Too many requests.')
      if (revision !== this.revision) {
        client.send('power', this.state0())
        return this.notice(client, 'transmit', false, 'Power grid changed since you looked. Review the latest allocation.')
      }
      const block = powerBlock(this.power)
      this.notice(client, 'transmit', !block, block ?? `Server authorized transmission at power revision ${this.revision}.`)
    })
  }

  onJoin(client: Client) {
    this.buckets.set(client.sessionId, { pose: new Bucket(30, 40), control: new Bucket(4, 8) })
    this.broadcast('power', this.state0(), { except: client })
  }

  onLeave(client: Client) {
    this.buckets.delete(client.sessionId)
    if (this.crew.delete(client.sessionId)) this.broadcast('gone', client.sessionId)
    this.broadcast('power', this.state0())
  }
}

if (process.env.SPACER_NO_LISTEN !== '1') {
  const server = new Server({ transport: new WebSocketTransport(), greet: false })
  server.define(ROOM_NAME, PowerRoom)
  await server.listen(PORT, HOST)
  console.log(`SPACER co-op service listening on ws://${HOST}:${PORT} (room "${ROOM_NAME}")`)
}
