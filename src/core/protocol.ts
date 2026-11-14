// Messages shared by the co-op client and server, with server-side validation.
import { SHIPS, SUITS, type ShipId, type SuitId } from './data'
import type { Power } from './power'

export const ROOM_NAME = 'spacer_power'
export const WORLD = { width: 1160, height: 670, spawnX: 580, spawnY: 582 }
export type Facing = 'down' | 'up' | 'side'
export const FACINGS: Facing[] = ['down', 'up', 'side']

export interface Pose {
  x: number
  y: number
  facing: Facing
  left: boolean
  moving: boolean
  jog: boolean
  name: string
  suit: SuitId
}
export interface CrewMember extends Pose { id: string }

export interface PowerState { power: Power; revision: number; players: number }
/**
 * The launch decision a room shares. The host is the pilot who has been in the room longest; only
 * the host chooses the rocket and starts the countdown. `launches` counts the host's launches, so a
 * client can tell a new countdown from a launch that happened before it arrived.
 */
export interface FlightState { host: string; ship: ShipId | null; launched: boolean; launches: number }
export interface Snapshot extends PowerState { crew: CrewMember[]; you: string; roomId: string; flight: FlightState }
export type NoticeKind = 'allocate' | 'transmit' | 'limit' | 'flight'
export interface Notice { kind: NoticeKind; ok: boolean; text: string }

export const validShip = (v: unknown): v is ShipId => typeof v === 'string' && SHIPS.some(s => s.id === v)

const finite = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi

/** Accepts only a well-formed station pose. Unknown fields are ignored by copying known ones. */
export function validPose(v: unknown): v is Pose {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return finite(p.x, 0, WORLD.width) && finite(p.y, 0, WORLD.height)
    && typeof p.facing === 'string' && (FACINGS as string[]).includes(p.facing)
    && typeof p.left === 'boolean' && typeof p.moving === 'boolean' && typeof p.jog === 'boolean'
    && typeof p.name === 'string' && p.name.trim().length >= 1 && p.name.length <= 20
    && typeof p.suit === 'string' && SUITS.some(s => s.id === p.suit)
}

export const cleanPose = (p: Pose): Pose => ({
  x: p.x, y: p.y, facing: p.facing, left: p.left, moving: p.moving, jog: p.jog, name: p.name.trim(), suit: p.suit,
})
