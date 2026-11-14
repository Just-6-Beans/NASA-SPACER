// SPACER co-op service: one two-player room that shares station presence, the power grid and the
// host's launch decision (which rocket, and when the countdown starts).
// Each client still simulates its own tasks, rover and mission clock.
import { Room, Server, type Client } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { DEFAULT_POWER, LIFE_NEED, powerBlock, validPower, type Power } from '../src/core/power'
import type { ShipId } from '../src/core/data'
import { ROOM_NAME, WORLD, cleanPose, validPose, validShip, type CrewMember, type FlightState, type NoticeKind } from '../src/core/protocol'

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
  /** The pilot who has been in the room longest. Only the host chooses the launch system and commits the room to it. */
  private host = ''
  private ship: ShipId | null = null
  private launched = false
  private launches = 0

  private state0() { return { power: this.power, revision: this.revision, players: this.clients.length } }
  private flight(): FlightState { return { host: this.host, ship: this.ship, launched: this.launched, launches: this.launches } }
  /** True when this client may decide the launch. Tells a guest why not. */
  private hostOnly(c: Client, value: unknown): value is ShipId {
    if (!this.allow(c, 'control')) { this.notice(c, 'limit', false, 'Too many requests.'); return false }
    if (c.sessionId !== this.host) { this.notice(c, 'flight', false, 'Only the host chooses the launch system.'); c.send('flight', this.flight()); return false }
    if (!validShip(value)) { this.notice(c, 'flight', false, 'Server rejected the launch: unknown rocket.'); return false }
    return true
  }
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
      client.send('snapshot', { ...this.state0(), crew: [...this.crew.values()], you: client.sessionId, roomId: this.roomId, flight: this.flight() })
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
    // The host is on the launch field and has a rocket on the pad. Choosing again reopens the pad.
    this.onMessage('ship', (client, value: unknown) => {
      if (!this.hostOnly(client, value)) return
      if (this.ship === value && !this.launched) return
      this.ship = value
      this.launched = false
      this.broadcast('flight', this.flight())
    })
    // The host started the countdown. Every pilot on the launch field lifts off on this rocket.
    this.onMessage('launch', (client, value: unknown) => {
      if (!this.hostOnly(client, value)) return
      this.ship = value
      this.launched = true
      this.launches++
      this.broadcast('flight', this.flight())
    })
    this.onMessage('transmit-check', (client, msg: unknown) => {
      if (!this.allow(client, 'control')) return this.notice(client, 'limit', false, 'Too many requests.')
      // { revision, lifeNeed }: a pilot whose oxygen tanks lower life support's minimum says so. A bare number is the older form.
      const m = (msg && typeof msg === 'object' ? msg : { revision: msg }) as { revision?: unknown; lifeNeed?: unknown }
      const revision = m.revision
      const lifeNeed = typeof m.lifeNeed === 'number' && Number.isInteger(m.lifeNeed) && m.lifeNeed >= 1 && m.lifeNeed <= LIFE_NEED ? m.lifeNeed : LIFE_NEED
      if (revision !== this.revision) {
        client.send('power', this.state0())
        return this.notice(client, 'transmit', false, 'Power grid changed since you looked. Review the latest allocation.')
      }
      const block = powerBlock(this.power, lifeNeed)
      this.notice(client, 'transmit', !block, block ?? `Server authorized transmission at power revision ${this.revision}.`)
    })
  }

  onJoin(client: Client) {
    this.buckets.set(client.sessionId, { pose: new Bucket(30, 40), control: new Bucket(4, 8) })
    if (!this.host) this.host = client.sessionId
    this.broadcast('power', this.state0(), { except: client })
  }

  onLeave(client: Client) {
    this.buckets.delete(client.sessionId)
    if (this.crew.delete(client.sessionId)) this.broadcast('gone', client.sessionId)
    this.broadcast('power', this.state0())
    if (client.sessionId === this.host) {
      // The remaining pilot takes over as host. Their client reports their own rocket next.
      this.host = this.clients.find(c => c.sessionId !== client.sessionId)?.sessionId ?? ''
      this.ship = null
      this.launched = false
      this.broadcast('flight', this.flight())
    }
  }
}

if (process.env.SPACER_NO_LISTEN !== '1') {
  const server = new Server({ transport: new WebSocketTransport(), greet: false })
  server.define(ROOM_NAME, PowerRoom)
  await server.listen(PORT, HOST)
  console.log(`SPACER co-op service listening on ws://${HOST}:${PORT} (room "${ROOM_NAME}")`)
}
