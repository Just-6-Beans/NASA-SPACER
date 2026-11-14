// Typed view of the station geometry in src/art/geo.json. The art generator reads the same file,
// so a console, its collision box and its terminal can only move together. No Phaser import
// here: the tests load this module in Node.
import geo from '../art/geo.json'

export type TerminalId = 'ops' | 'payload' | 'power' | 'comms' | 'calibration' | 'hab'
/** The three power buses, named after the fields of core Power. */
export type Bus = 'life' | 'comms' | 'research'
export type Pt = [number, number]
export type Rect = [number, number, number, number]

export interface Terminal { id: TerminalId; name: string; at: Pt; callout: number }
export interface Solid { id: string; rect: Rect }
export interface Prop { id: string; at: Pt; size: Pt; depth: number }
export interface Module { id: string; name: string; x: number; w: number; tint: string; bus: Bus | '' }

export const DECK = geo.deck
export const TERMINALS = geo.deck.terminals as Terminal[]
export const SOLIDS = geo.deck.solids as Solid[]
export const PROPS = geo.deck.props as Prop[]
export const MODULES = geo.deck.modules as Module[]
export const WINDOWS = geo.deck.windows as Rect[]
export const CONDUITS = geo.deck.conduits as Record<Bus, Pt[]>
export const LIVE = geo.deck.live
export const SPAWN = geo.deck.spawn as Pt
export const BUSES: Bus[] = ['life', 'comms', 'research']
/** How close, in deck pixels, the astronaut must stand to a terminal to use it. */
export const REACH = 78

export const terminal = (id: TerminalId) => TERMINALS.find(t => t.id === id)!
export const solid = (id: string) => SOLIDS.find(s => s.id === id)!.rect
export const prop = (id: string) => PROPS.find(p => p.id === id)!

/** Which node of the station a deck x position is in (bulkheads count as the node to their left). */
export const moduleAt = (x: number) => MODULES.find(m => x < m.x + m.w + 12) ?? MODULES[MODULES.length - 1]
