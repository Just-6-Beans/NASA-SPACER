// Typed view of the station geometry in src/art/geo.json (written by scripts/build-geo.mjs).
// The art generator reads the same file, so a console, its collision box and its terminal can
// only move together. No Phaser import here: the tests load this module in Node.
import geo from '../art/geo.json'
import type { BayId, LoopId } from '../core/greenhouse'
import type { BayKind } from '../core/crops'

export type BayTerminalId = `bay-${BayId}`
export type TerminalId = 'ops' | 'payload' | 'power' | 'comms' | 'calibration' | 'hab' | 'crew' | 'cupola' | 'gh-control' | 'gh-prep' | 'gh-service' | BayTerminalId
export type ModuleId = 'cupola' | 'dock' | 'node3' | 'node1' | 'lab' | 'node2' | 'greenhouse' | 'comms'
/** The three power buses, named after the fields of core Power. */
export type Bus = 'life' | 'comms' | 'research'
export type Pt = [number, number]
export type Rect = [number, number, number, number]

export interface Terminal { id: TerminalId; name: string; at: Pt; callout: number; reach?: number }
export interface Solid { id: string; rect: Rect }
export interface Prop { id: string; at: Pt; size: Pt; depth: number }
/** A pressurised module: its outer box, the height of its back wall, and its floor. */
export interface Module { id: ModuleId; name: string; label: string; x: number; y: number; w: number; h: number; wallH: number; tint: string; bus: Bus | ''; floor: Rect }
/** A way between two modules. `rect` is the floor of the passage, `art` the box its picture covers. */
export interface Link { id: string; kind: 'hatch' | 'tunnel'; a: ModuleId; b: ModuleId; rect: Rect; art: Rect }
export interface Window { module: ModuleId; kind: 'cupola' | 'pane' | 'port'; rect: Rect }
/** One greenhouse rack: its box on the deck, the substrate line of each shelf, and where each plant stands. */
export interface BayGeo { id: BayId; loop: LoopId; kind: BayKind; box: Rect; shelves: number[]; slots: number[]; leds: [number, number, number][]; lamp: Pt; tag: Pt }

export const DECK = geo.deck
export const TERMINALS = geo.deck.terminals as unknown as Terminal[]
export const SOLIDS = geo.deck.solids as unknown as Solid[]
export const PROPS = geo.deck.props as unknown as Prop[]
export const MODULES = geo.deck.modules as unknown as Module[]
export const LINKS = geo.deck.links as unknown as Link[]
export const WINDOWS = geo.deck.windows as unknown as Window[]
export const CONDUITS = geo.deck.conduits as unknown as Record<Bus, Pt[]>
export const BAYS = geo.deck.greenhouse.bays as unknown as BayGeo[]
export const LIVE = geo.deck.live
export const EXTERIOR = geo.deck.exterior
export const SPAWN = geo.deck.spawn as Pt
export const BUSES: Bus[] = ['life', 'comms', 'research']
/** How close, in deck pixels, the astronaut must stand to a terminal to use it. Bays sit closer together and use less. */
export const REACH = 78
export const reachOf = (t: Terminal) => t.reach ?? REACH

export const terminal = (id: TerminalId) => TERMINALS.find(t => t.id === id)!
export const solid = (id: string) => SOLIDS.find(s => s.id === id)!.rect
export const prop = (id: string) => PROPS.find(p => p.id === id)!
export const moduleById = (id: ModuleId) => MODULES.find(m => m.id === id)!
export const bayGeo = (id: BayId) => BAYS.find(b => b.id === id)!
export const isBayTerminal = (id: string): id is BayTerminalId => id.startsWith('bay-')
export const bayOf = (id: BayTerminalId) => id.slice(4) as BayId

export const inRect = ([x, y, w, h]: Rect | number[], px: number, py: number, pad = 0) => px >= x - pad && px <= x + w + pad && py >= y - pad && py <= y + h + pad

/** Which module a deck position is in. Inside a hatch or a tunnel it is the nearer of the two ends. */
export function moduleAt(x: number, y: number): Module {
  let best = MODULES[0], bd = Infinity
  for (const m of MODULES) {
    const dx = Math.max(m.x - x, 0, x - m.x - m.w), dy = Math.max(m.y + m.wallH - y, 0, y - m.y - m.h)
    const d = Math.hypot(dx, dy)
    if (d < bd) { bd = d; best = m }
  }
  return best
}

/** True when a position is on the greenhouse floor (used for the radiation dose and the HUD). */
export const inGreenhouse = (x: number, y: number) => inRect(moduleById('greenhouse').floor, x, y, 4)
