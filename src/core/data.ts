// Static mission catalogue and game rules.
// Every number in this file is OUR MODEL for a simulated scenario. The two real inputs to the
// rover pass, the signal light time and the night temperature, come from NASA data in src/data/.
import type { RocketId } from '../data/launchVehicles'

export type ShipId = 'shuttle' | 'falcon9' | 'atlasv'
export type InstrumentId = 'ir' | 'gpr'
export type ExtraId = 'water' | 'kit' | 'cells'
export type SuitId = 'ember' | 'aurora' | 'sage' | 'violet'
export type RouteId = 'ridge' | 'basin'
export type ScanId = 'quick' | 'deep'
export type SiteId = 'shelf' | 'hollow' | 'plain'

/** What the whole mission may spend, in credits: the launch, the instruments, the supplies, and whatever the landing needs. */
export const MISSION_BUDGET = 136

/** A launch system: a real rocket and the real spacecraft it carries to the station. */
export interface Ship {
  id: ShipId
  name: string
  /** The rocket and the spacecraft on their own, for short labels. */
  rocketName: string
  craft: string
  role: string
  /** Credits the launch costs: one credit for each $10 million of NASA's cost figure for a flight
   *  of the real system (`cost` in data/nasa/launch-vehicles.json). The scale is ours. */
  launchCost: number
  /** Cargo in kilograms that a clean ascent carries with propellant to spare. More can fly on a
   *  thinner margin: the limit comes out of the ascent model in ascent.ts, not from this number. */
  payloadKg: number
  /** Credits left for instruments, supplies and the landing once the launch is paid: MISSION_BUDGET - launchCost. */
  budget: number
  battery: number
  /** Minutes the station relay adds to each signal leg, on top of the light time. */
  handoffMin: number
  /** The real launch system. Its facts are NASA data in src/data/launchVehicles.ts; every other
   *  number on this line is our model. */
  rocket: RocketId
  blurb: string
  pros: string[]
  cons: string[]
}

/** In the order they first flew crews to the station. */
export const SHIPS: Ship[] = [
  {
    id: 'shuttle', name: 'Space Shuttle', rocketName: 'Space Shuttle', craft: 'Orbiter', role: 'Heavy lift',
    launchCost: 45, payloadKg: 40, budget: 91, battery: 100, handoffMin: 2, rocket: 'space-shuttle',
    blurb: 'The orbiter is spacecraft and rocket in one, with a cargo bay nothing else matches.',
    pros: ['Carries 40 kg with propellant to spare', 'Shortest relay hand-off (2 min)'],
    cons: ['The most expensive launch', 'Winged stack: breaks up under the least sideways air load'],
  },
  {
    id: 'falcon9', name: 'Falcon 9 + Crew Dragon', rocketName: 'Falcon 9 Block 5', craft: 'Crew Dragon', role: 'Lowest cost',
    launchCost: 22, payloadKg: 25, budget: 114, battery: 92, handoffMin: 3, rocket: 'falcon-9-crew-dragon',
    blurb: 'A booster that lands and flies again, under a capsule that docks itself.',
    pros: ['The cheapest launch: most left to spend', 'Carries 25 kg with propellant to spare'],
    cons: ['Lowest thrust for its weight: slowest off the pad', 'Rover rides in the unpowered trunk: arrives at 92% charge'],
  },
  {
    id: 'atlasv', name: 'Atlas V N22 + Starliner', rocketName: 'Atlas V N22', craft: 'Starliner', role: 'Steady climb',
    launchCost: 36, payloadKg: 18, budget: 100, battery: 100, handoffMin: 3, rocket: 'atlas-v-n22-starliner',
    blurb: 'Built for crew: no nose cone, and a two-engine upper stage that flies a gentler path.',
    pros: ['Sturdiest stack: takes the roughest steering without breaking up', 'Full rover battery'],
    cons: ['Carries only 18 kg with propellant to spare', 'Mid-priced launch'],
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
    id: 'gpr', name: 'Ground Radar', code: 'GPR-2', cost: 68, massKg: 13, quickDraw: 18, baseUncertainty: 11,
    calibration: { raw: [16, 56], target: [22, 82] },
    note: 'Sees buried ice directly, but heavy and power hungry.',
  },
]

export interface Suit { id: SuitId; name: string; primary: string; shade: string; light: string }

/** Supplies that can be loaded on Earth. Each saves something later and weighs something now. */
export interface Extra {
  id: ExtraId
  name: string
  cost: number
  massKg: number
  note: string
  /** What it changes later in the mission. */
  effect: string
}
export const EXTRAS: Extra[] = [
  { id: 'water', name: 'Water tanks', cost: 15, massKg: 12, note: 'The landing party\'s water, carried from Earth.', effect: 'No imported water to buy at landing (26 cr if you need it then).' },
  { id: 'kit', name: 'Dust-rated power kit', cost: 8, massKg: 6, note: 'Sealed panels and filters for a dusty site.', effect: 'No kit to buy for a Meridian Plain landing (12 cr then).' },
  { id: 'cells', name: 'Spare rover cells', cost: 10, massKg: 5, note: 'Extra battery cells clipped into the rover.', effect: '+8 points of rover charge when the pass starts, up to 100%.' },
]
/** Rover charge the spare cells add, capped at a full battery. */
export const CELLS_BONUS = 8

export const SUITS: Suit[] = [
  { id: 'ember', name: 'Ember', primary: '#c8582a', shade: '#8a3618', light: '#ec8a55' },
  { id: 'aurora', name: 'Aurora', primary: '#2bb4c9', shade: '#17738a', light: '#7fe0ee' },
  { id: 'sage', name: 'Sage', primary: '#5f9b55', shade: '#3a6534', light: '#9ccc8b' },
  { id: 'violet', name: 'Violet', primary: '#8456c4', shade: '#553286', light: '#b897e6' },
]

export interface Route { id: RouteId; name: string; legMin: number; legDraw: number; note: string }
export const ROUTES: Route[] = [
  { id: 'ridge', name: 'Ridge bypass', legMin: 16, legDraw: 25, note: 'Firm footing around the ridge. Slow but gentle on the battery.' },
  { id: 'basin', name: 'Basin shortcut', legMin: 10, legDraw: 29, note: 'Straight across the dusty basin. Fast, but soft ground drains power.' },
]

export interface ScanMode { id: ScanId; name: string; minutes: number; extraDraw: number; uncertaintyCut: number }
export const SCANS: ScanMode[] = [
  { id: 'quick', name: 'Quick sweep', minutes: 4, extraDraw: 0, uncertaintyCut: 0 },
  { id: 'deep', name: 'Deep scan', minutes: 8, extraDraw: 8, uncertaintyCut: 7 },
]

// ---- Rover pass rules (our model) ----------------------------------------
export const POWER_TOTAL = 10
/** The rover never spends below this charge. A command that would cross it stops partway. */
export const RESERVE_FLOOR = 20
/** Night lows at or above this cost no heater energy. Each degree colder costs one battery point. */
export const HEATER_FREE_C = -65
/** Simulated dust front: Ares Shelf closes if the final telemetry arrives at or after this T+ minute. */
export const DUST_DEADLINE = 56
export const BALANCE_SAVING = 3

// ---- Ice evidence rules (our model) ---------------------------------------
export const ICE_ESTIMATE = 31
export const STRONG_LOW_END = 22
export const CALIBRATED_CUT = 5
export const UNCALIBRATED_PENALTY = 9
export const FILTER_CUT = 5
export const MIN_UNCERTAINTY = 3

// ---- Landing costs (our model) ---------------------------------------------
export const WATER_COST = 26
export const KIT_COST = 12
export const WATER_DISCOUNT = 8
export const CARGO_REWARD = 5

export const SITES: { id: SiteId; name: string; terrain: string; evidence: string; power: string; risk: string }[] = [
  { id: 'shelf', name: 'Ares Shelf', terrain: 'Level bedrock shelf', evidence: 'The sampled location: rover ice reading', power: `Good solar until the dust front (T+${DUST_DEADLINE})`, risk: 'Depends on the received ice range and on the rover getting home' },
  { id: 'hollow', name: 'Eos Hollow', terrain: 'Loose slopes in a shaded hollow', evidence: 'Plausible, unverified ice', power: 'Weak solar exposure', risk: 'Needs slope survey and backup power' },
  { id: 'plain', name: 'Meridian Plain', terrain: 'Relatively stable plain', evidence: 'No local ice evidence', power: 'Dust exposed: needs rated power kit', risk: 'Needs imported water + dust-rated kit' },
]

export const byId = <T extends { id: string }>(list: T[], id: string): T => {
  const found = list.find(item => item.id === id)
  if (!found) throw new Error(`Unknown id ${id}`)
  return found
}
