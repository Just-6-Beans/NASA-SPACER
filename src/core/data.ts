// Static mission catalogue. Every number here is a game rule for a SIMULATED scenario.

export type ShipId = 'odyssey' | 'atlas' | 'vector'
export type InstrumentId = 'ir' | 'gpr'
export type SuitId = 'ember' | 'aurora' | 'sage' | 'violet'
export type RouteId = 'ridge' | 'basin'
export type ScanId = 'quick' | 'deep'
export type SiteId = 'shelf' | 'hollow' | 'plain'

export interface Ship {
  id: ShipId
  name: string
  role: string
  payloadKg: number
  budget: number
  battery: number
  relayMin: number
  blurb: string
  pros: string[]
  cons: string[]
}

export const SHIPS: Ship[] = [
  {
    id: 'odyssey', name: 'Odyssey', role: 'Survey transport', payloadKg: 18, budget: 100, battery: 100, relayMin: 8,
    blurb: 'A balanced survey hauler with a full-charge rover cradle.',
    pros: ['Full rover battery', 'Carries either instrument'],
    cons: ['Middling supply budget'],
  },
  {
    id: 'atlas', name: 'Atlas', role: 'Heavy logistics', payloadKg: 25, budget: 113, battery: 92, relayMin: 8,
    blurb: 'Deep cargo bays and the richest supply line in the fleet.',
    pros: ['Largest payload', 'Largest supply budget'],
    cons: ['Rover arrives at 92% charge'],
  },
  {
    id: 'vector', name: 'Vector', role: 'Fast-response shuttle', payloadKg: 12, budget: 88, battery: 100, relayMin: 7,
    blurb: 'A lean shuttle with a high-gain relay and a tight cargo cage.',
    pros: ['Fastest relay (7 min)', 'Full rover battery'],
    cons: ['Too small for Ground Radar', 'Smallest budget'],
  },
]

export interface Instrument {
  id: InstrumentId
  name: string
  code: string
  cost: number
  massKg: number
  quickDraw: number
  baseUncertainty: number
  calibration: { raw: [number, number]; target: [number, number] }
  note: string
}

export const INSTRUMENTS: Instrument[] = [
  {
    id: 'ir', name: 'IR Spectrometer', code: 'IR-S1', cost: 42, massKg: 7, quickDraw: 6, baseUncertainty: 19,
    calibration: { raw: [20, 60], target: [27, 77] },
    note: 'Light and frugal. Reads surface hydration bands.',
  },
  {
    id: 'gpr', name: 'Ground Radar', code: 'GPR-2', cost: 68, massKg: 13, quickDraw: 14, baseUncertainty: 11,
    calibration: { raw: [16, 56], target: [22, 82] },
    note: 'Sees buried ice directly, but heavy and power hungry.',
  },
]

export interface Suit { id: SuitId; name: string; primary: string; shade: string; light: string }

export const SUITS: Suit[] = [
  { id: 'ember', name: 'Ember', primary: '#c8582a', shade: '#8a3618', light: '#ec8a55' },
  { id: 'aurora', name: 'Aurora', primary: '#2bb4c9', shade: '#17738a', light: '#7fe0ee' },
  { id: 'sage', name: 'Sage', primary: '#5f9b55', shade: '#3a6534', light: '#9ccc8b' },
  { id: 'violet', name: 'Violet', primary: '#8456c4', shade: '#553286', light: '#b897e6' },
]

export interface Route { id: RouteId; name: string; legMin: number; legDraw: number; note: string }
export const ROUTES: Route[] = [
  { id: 'ridge', name: 'Ridge bypass', legMin: 16, legDraw: 25, note: 'Firm footing around the ridge. Slow but gentle on the battery.' },
  { id: 'basin', name: 'Basin shortcut', legMin: 10, legDraw: 36, note: 'Straight across the dusty basin. Fast, but soft ground drains power.' },
]

export interface ScanMode { id: ScanId; name: string; minutes: number; extraDraw: number; uncertaintyCut: number }
export const SCANS: ScanMode[] = [
  { id: 'quick', name: 'Quick sweep', minutes: 4, extraDraw: 0, uncertaintyCut: 0 },
  { id: 'deep', name: 'Deep scan', minutes: 8, extraDraw: 8, uncertaintyCut: 7 },
]

export const SITES: { id: SiteId; name: string; terrain: string; evidence: string; power: string; risk: string }[] = [
  { id: 'shelf', name: 'Ares Shelf', terrain: 'Level bedrock shelf', evidence: 'The sampled location: rover ice reading', power: 'Good solar until the dust front (T+54)', risk: 'Depends on the received ice range' },
  { id: 'hollow', name: 'Eos Hollow', terrain: 'Loose slopes in a shaded hollow', evidence: 'Plausible, unverified ice', power: 'Weak solar exposure', risk: 'Needs slope survey and backup power' },
  { id: 'plain', name: 'Meridian Plain', terrain: 'Relatively stable plain', evidence: 'No local ice evidence', power: 'Dust exposed: needs rated power kit', risk: 'Needs imported water + dust-rated kit' },
]

export const byId = <T extends { id: string }>(list: T[], id: string): T => {
  const found = list.find(item => item.id === id)
  if (!found) throw new Error(`Unknown id ${id}`)
  return found
}

// Gameplay constants (simulated scenario).
export const POWER_TOTAL = 10
export const RESERVE_FLOOR = 20
export const ICE_ESTIMATE = 31
export const STRONG_LOW_END = 22
export const DUST_DEADLINE = 54
export const WATER_COST = 26
export const KIT_COST = 12
export const WATER_DISCOUNT = 8
export const CARGO_REWARD = 5
export const BALANCE_SAVING = 3
