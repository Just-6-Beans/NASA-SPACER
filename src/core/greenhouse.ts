// The station greenhouse: a pressurised plant module on the orbital station. Plain TypeScript,
// no DOM and no Phaser, so the tests can run it and the panels and the deck only read it.
//
// REAL AND MODEL. The crop list and the idea of the module follow NASA plant research (the Veggie
// and Advanced Plant Habitat chambers on the ISS, and NASA's controlled-environment crop studies).
// Every number here is OUR GAME MODEL: setpoints, rates, yields, failure timings and the score.
// The starter settings (101 kPa, 21 % oxygen, 22 °C, 60 % humidity, 1,000 ppm CO2, pH 6.0,
// 1.6 mS/cm, 250 µmol/m²/s for 16 hours) are game presets, not validated crop prescriptions.
//
// CLOCKS. Three are kept apart on purpose:
//   - `t`: real seconds the module has been running. Failures, drifts and repairs use it.
//   - crop days: growth is a cooldown. One crop day passes every GH.secondsPerCropDay real
//     seconds in good conditions, so a 30-day lettuce is ready in about 30 seconds. This has
//     nothing to do with the station clock or the Mars clock.
//   - station hours: energy is integrated on the station's 30× clock, the same one the windows
//     show, so the battery breathes with the orbit: kWh = kW × hours.
import { CROPS, CROP_IDS, crop, defaultPpfd, dli, type BayKind, type Crop, type CropId, type ProcessStep, type Stage } from './crops'

// ------------------------------------------------------------------ Model constants
export const GH = {
  /** Real seconds per crop day at full growth. The cooldown rate. */
  secondsPerCropDay: 1,
  /** Station time runs this many times faster than real time, as in the exterior view. */
  stationRate: 30,
  /** One orbit of the exterior view, in real seconds (92 minutes at 30×), and the sunlit share of it. */
  orbitSeconds: 184,
  orbitOffset: 8,
  sunlitShare: 0.62,
  /** REAL: sunlight at Earth's distance, W/m² (the solar constant). */
  solarFluxWm2: 1361,

  // module
  volumeM3: 120,
  areaM2: { tier: 4.8, tall: 2.4 } as Record<BayKind, number>,
  plants: { tier: 8, tall: 3 } as Record<BayKind, number>,

  // starter recipe (game presets)
  recipe: { tempLitC: 22, tempDarkC: 19, rhPct: 60, co2Ppm: 1000, photoperiodH: 16, eclipseDim: false },
  rhBand: [55, 70] as [number, number],
  pressureKpa: 101,
  o2Pct: 21,
  ph: 6.0,
  phBand: [5.5, 6.5] as [number, number],
  ec: 1.6,
  rootTempC: 20,

  // power, kW and kWh
  arrayKw: 7.2,
  batteryKwh: 6,
  batteryStart: 0.82,
  /** µmol of useful photons per joule of electricity at the fixtures. */
  efficacy: 3,
  loadKw: { controls: 0.15, air: 0.35, pump: 0.12, thermalBase: 0.25, thermalPerHeatKw: 0.15, processor: 0.6 },
  backupKw: 2, backupSeconds: 60, backupUses: 2,

  // water, litres
  tankL: 650,
  tankCapacityL: 800,
  rootL: { tier: 30, tall: 24 } as Record<BayKind, number>,
  /** Litres a full-grown, lit tier bay takes up each real second. */
  uptakeLps: 0.3,
  /** Share of taken-up water that stays in the plant. The rest is transpired. */
  biomassShare: 0.05,
  /** Share of transpired water the dehumidifier condenses and returns. */
  recovery: 0.95,
  makeupL: 150, makeupUses: 3,

  // gas, kilograms
  airKg: 143,
  reserveKg: 40,

  // consumables
  nutrientStock: 4,
  sanitizer: 3,
  seedsPerPacket: 1,
  startSeeds: 3,
  unlockSeeds: 2,
  seedSaveGain: 3,

  /** MODEL: kcal one crew member eats in a day. */
  crewDayKcal: 2700,
} as const

export type BayId = 'A1' | 'A2' | 'A3' | 'A4' | 'B1' | 'B2' | 'B3' | 'B4'
export type LoopId = 'A' | 'B'
export const BAY_IDS: BayId[] = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4']
/** Bay hardware: which rack band and loop it is on, what it is built for, and the tier that opens it. */
export const BAY_PLAN: Record<BayId, { loop: LoopId; kind: BayKind; tier: 1 | 2 | 3 }> = {
  A1: { loop: 'A', kind: 'tier', tier: 1 }, A2: { loop: 'A', kind: 'tier', tier: 1 }, A3: { loop: 'A', kind: 'tall', tier: 1 }, A4: { loop: 'A', kind: 'tall', tier: 2 },
  B1: { loop: 'B', kind: 'tier', tier: 2 }, B2: { loop: 'B', kind: 'tier', tier: 2 }, B3: { loop: 'B', kind: 'tall', tier: 3 }, B4: { loop: 'B', kind: 'tall', tier: 3 },
}

export type FactorId = 'temperature' | 'light' | 'water' | 'nutrient' | 'gas'
export const FACTOR_IDS: FactorId[] = ['temperature', 'light', 'water', 'nutrient', 'gas']
/** What the leaves show. A clue, not a diagnosis: wilting can be water or heat, yellowing several things. */
export type Symptom = 'none' | 'wilt' | 'yellow' | 'spots'

export interface Planting {
  crop: CropId
  stage: Stage
  /** Crop days since sowing, counted only while the plant grows. */
  ageDays: number
  /** 0..1 toward the next harvest. */
  progress: number
  /** Crop days still to go to the next harvest at full growth. */
  daysLeft: number
  /** 0..100. Falls only after stress has stayed high; a dead plant stays dead. */
  health: number
  /** 0..100. Builds while a growth factor is short, eases when conditions return. */
  stress: number
  symptom: Symptom
  /** The five growth factors, each 0..1, as last computed. Growth = their product. */
  factors: Record<FactorId, number>
  /** The lowest factor when it is holding the plant back, else null. */
  limiting: FactorId | null
  /** Flowers are open and waiting for the crew (tomato, pepper). */
  needsPollination: boolean
  pollinated: boolean
  /** Cuts or picks taken so far. */
  harvests: number
  /** Kept for seed: the harvest becomes seed packets instead of food. */
  forSeed: boolean
  /** No more harvests will come: clear the bay. */
  spent: boolean
}

export interface Bay {
  id: BayId
  loop: LoopId
  kind: BayKind
  areaM2: number
  unlocked: boolean
  planting: Planting | null
  /** Light setting at the canopy, µmol/m²/s. */
  ppfd: number
  /** The crew's light switch for this bay. */
  lightsOn: boolean
  /** Light actually reaching the plants now, 0..1 of the setting (0 when shed or switched off). */
  lit: number
  /** Isolation valve closed: the bay is cut from the shared loop and runs on what it holds. */
  isolated: boolean
  /** Root-zone water, 0..1 of what the bay holds. */
  moisture: number
  /** Irrigation flow reaching the bay, 0..1 of normal. */
  flow: number
  /** 0..1 root-zone contamination. */
  contamination: number
  /** 0..1 leaf disease from long, humid air. */
  disease: number
}

export type LoadId = 'controls' | 'air' | 'pumps' | 'thermal' | 'lightsA' | 'lightsB' | 'processor'
export interface Load {
  id: LoadId
  name: string
  /** What it draws now, kW. Zero while switched off or shed. */
  kw: number
  /** What it would draw if it ran, kW. */
  wantKw: number
  /** The crew's switch. Controls cannot be switched off. */
  on: boolean
  /** Dropped by the power controller because the battery is empty. */
  shed: boolean
  essential: boolean
}

export type ReadingId = 'temp' | 'rh' | 'pressure' | 'o2' | 'co2' | 'ph' | 'ec' | 'rootTemp' | 'tank' | 'battery' | 'reserve'
export interface Reading {
  id: ReadingId
  label: string
  unit: string
  value: number
  /** The setpoint, when there is one. */
  target: number | null
  /** The band the reading should stay in, when there is one. */
  band: [number, number] | null
  /** Change per minute of real time, from the last ten seconds. */
  trend: number
  status: 'ok' | 'warn' | 'bad'
}

export type FaultKind = 'arrayFeather' | 'arrayString' | 'irrigation' | 'climate' | 'humidity' | 'nutrient' | 'leak' | 'contamination' | 'radiation'
export const FAULT_KINDS: FaultKind[] = ['arrayFeather', 'arrayString', 'irrigation', 'climate', 'humidity', 'nutrient', 'leak', 'contamination', 'radiation']
/** The four stages every problem moves through. Recovering one system does not restore the others. */
export type AlertLevel = 'warning' | 'degraded' | 'damage' | 'recovery'
export interface Alert {
  id: number
  kind: FaultKind | 'crop' | 'battery' | 'water'
  level: AlertLevel
  /** Short name, e.g. "Bay A2 irrigation". */
  title: string
  /** What is wrong, in a sentence that says what is known, e.g. "Bay A2 irrigation flow low. Reservoir is adequate." */
  problem: string
  /** Which way the reading is going, e.g. "Root-zone water 62 % and falling". */
  trend: string
  bay: BayId | null
  /** What to do next, e.g. "Inspect pump or blocked line." */
  action: string
  /** The cause, once someone has diagnosed it. */
  cause: string | null
  diagnosed: boolean
  acknowledged: boolean
  /** Real seconds `t` when it was raised. */
  since: number
  /** A crop alert only: what is stressing the plant. One alert speaks for every bay with the same trouble. */
  factor?: FactorId | 'disease' | 'radiation'
}

export type RepairId = 'pumpA' | 'pumpB' | 'thermal' | 'dehumidifier' | 'seal' | 'array'
export type JobKind = 'diagnose' | 'repair' | 'clearLine' | 'treat' | 'mix' | 'flush' | 'process' | 'recycle' | 'resupply' | 'makeup' | 'labTest'
/** Something that takes time. Jobs run on their own once started. */
export interface Job { id: number; kind: JobKind; label: string; target: string; total: number; left: number }

export interface Inventory {
  /** Seed packets by crop. One packet plants one bay. */
  seeds: Record<CropId, number>
  /** Harvested and ready to eat, kg by crop. */
  food: Record<CropId, number>
  /** Harvested staples waiting to be processed, kg by crop. */
  raw: Record<CropId, number>
  kcal: number
  proteinG: number
  /** Fresh crops harvested at least once. */
  variety: CropId[]
  residueKg: number
  nutrientStock: number
  sanitizer: number
}

export interface Recipe { tempLitC: number; tempDarkC: number; rhPct: number; co2Ppm: number; photoperiodH: number; eclipseDim: boolean }
export const RECIPE_LIMITS = { tempLitC: [16, 30], tempDarkC: [14, 26], rhPct: [40, 85], co2Ppm: [400, 2000], photoperiodH: [8, 20] } as const

export interface Exterior {
  /** 0..1 of full sun on the array. */
  sunlight: number
  sunlit: boolean
  orbit: number
  /** Real seconds until the next sunrise or sunset. */
  nextChange: number
  /** 0..1 of what the array should make in this light. */
  arrayHealth: number
  arrayState: 'tracking' | 'feathered' | 'string offline'
  radiation: 'quiet' | 'watch' | 'storm'
}

export interface Tier { level: 1 | 2 | 3 | 4; name: string; text: string; needs: string; unlocks: string }
export const TIERS: Tier[] = [
  { level: 1, name: 'Seedling experiment', text: 'Three bays, three crops: leaf harvest, root harvest and repeated fruit harvest.', needs: 'The module as docked.', unlocks: 'Lettuce, radish and dwarf tomato in bays A1 to A3.' },
  { level: 2, name: 'Reliable fresh greens', text: 'More shelves and more kinds of fresh food.', needs: '2 harvests stored.', unlocks: 'Bays A4, B1 and B2. Mizuna, kale and compact pepper.' },
  { level: 3, name: 'Staple crops and food processing', text: 'Calories and protein, which need threshing, milling and cooking.', needs: '5 harvests stored, from at least 3 different fresh crops.', unlocks: 'Bays B3 and B4. Potato, dwarf wheat and soybean. The food processor.' },
  { level: 4, name: 'Resource recovery and automation', text: 'The module looks after its own solution and turns crop residue back into nutrients.', needs: 'One staple harvest processed into food.', unlocks: 'Automatic pH and nutrient dosing, the residue recycler, better water recovery.' },
]
/** Beyond one module. Shown as where the idea leads; nothing in the game builds them. */
export const BEYOND = ['Several isolated greenhouse modules', 'Enclosed settlement gardens', 'Regional or planetary engineering (speculative)']

export interface ScorePart { id: 'variety' | 'calories' | 'protein' | 'health' | 'reliability' | 'water' | 'progress'; label: string; points: number; max: number; why: string }
export interface Score { total: number; parts: ScorePart[] }

export interface GhLog { at: number; text: string; kind: 'crop' | 'alert' | 'system' | 'food' }

/** What the outside world tells the module each tick. All optional: the module has its own orbit clock. */
export interface TickInput {
  /** 0..1 around the orbit, from the deck's exterior view, so power follows what the windows show. */
  orbitPhase?: number
  /** The astronaut is standing inside the module (for the radiation dose). */
  crewInside?: boolean
  /** Nobody is watching the deck: plants keep growing, but no new failure starts. */
  quiet?: boolean
}

export interface GreenhouseOptions {
  /** Seed for the failure schedule. The same seed gives the same run. */
  seed?: number
  /** False switches the random failures off (tests inject their own). */
  events?: boolean
}

/** Plain-JSON copy of the whole module, for save and reload. */
export type GreenhouseSnapshot = { v: 1 } & Record<string, unknown>

// ------------------------------------------------------------------ Model rates
/** MODEL: how fast things happen. Tuned so a failure leaves time to notice, decide and act. */
export const RATES = {
  /** Largest step the module takes at once, real seconds. */
  step: 0.25,
  // root zone: seconds to refill with flow, and to drain back to the tank
  fillTau: 1.7,
  drainTau: 42,
  // solution drift per real second, for each full-grown two-shelf bay on the loop
  ecDrift: 0.0015,
  phDrift: 0.0008,
  balanceDrift: 0.0005,
  // air
  thermalTau: 8,
  driftTau: 40,
  stationTempC: 21,
  heatCPerKw: 6,
  rhTau: 6,
  rhDriftTau: 35,
  rhMax: 95,
  diseaseAboveRh: 78,
  diseaseRate: 0.012,
  healBelowRh: 70,
  diseaseHeal: 0.004,
  co2Tau: 5,
  co2DriftTau: 40,
  co2Floor: 250,
  // gas
  leakKgps: 0.5,
  droopKpa: 100,
  refillKgps: 1,
  repressKg: 3,
  // stress and health
  stressBelow: 0.75,
  stressGain: 6,
  stressEase: 2.5,
  darkShare: 0.3,
  harmAbove: 60,
  harmRate: 0.06,
  healBelow: 15,
  healRate: 0.4,
  scarShare: 0.3,
  symptomAbove: 40,
  symptomClear: 20,
  // failures
  featherSeconds: 150,
  featherHealth: 0.25,
  stringHealth: 0.65,
  stringChance: 0.6,
  contaminationRate: 0.03,
  spreadSeconds: 12,
  watchSeconds: 15,
  stormSeconds: 40,
  doseMsvPerS: 0.02,
  doseLimitMsv: 0.3,
  firstFault: [50, 65],
  faultGap: [55, 85],
  recoveryLimit: 120,
  // jobs, real seconds
  job: { diagnose: 5, diagnoseFlow: 4, diagnoseLeak: 8, pump: 10, thermal: 12, dehumidifier: 10, seal: 14, array: 8, clearLine: 6, treat: 10, mix: 6, flush: 6, labTest: 5, makeup: 8, processStep: 5, recycle: 8, resupply: 90 },
  // amounts
  doseEc: 0.3,
  doseStock: 0.25,
  dosePh: 0.3,
  flushL: 80,
  resupplyPackets: 2,
  /** Oxygen a square metre of full, growing canopy makes in a crop day, kg. */
  o2KgPerM2Day: 0.035,
} as const

// ------------------------------------------------------------------ Pure rules
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** Moves v toward target with time constant tau. */
const approach = (v: number, target: number, dt: number, tau: number) => target + (v - target) * Math.exp(-dt / tau)
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
/** Value on the line through (x0, y0) and (x1, y1), held flat outside it. */
const ramp = (v: number, x0: number, y0: number, x1: number, y1: number) => y0 + (y1 - y0) * clamp((v - x0) / (x1 - x0), 0, 1)
const outside = (v: number, lo: number, hi: number) => (v < lo ? lo - v : v > hi ? v - hi : 0)

/** Electrical kW to light `areaM2` at `ppfd` µmol/m²/s with fixtures of GH.efficacy µmol/J. 250 over 40 m² is 3.33 kW. */
export const lightingKw = (ppfd: number, areaM2: number) => (ppfd * areaM2) / GH.efficacy / 1000
/** The daily light a crop wants, mol/m²/day: its light band held for 16 hours. */
export const dliBand = (c: Crop): [number, number] => [dli(c.ppfd[0], 16), dli(c.ppfd[1], 16)]

/** 1 well inside the crop's band, 0.9 at its edges, 0 at 8 °C outside it. */
export function temperatureFactor(c: Crop, tempC: number) {
  const [lo, hi] = c.tempC
  if (tempC >= lo + 1 && tempC <= hi - 1) return 1
  if (tempC >= lo && tempC <= hi) return 0.9 + 0.1 * Math.min(tempC - lo, hi - tempC)
  return Math.max(0, 0.9 * (1 - outside(tempC, lo, hi) / 8))
}
/** From the daily light integral: rises to 1 at the low end of the band, eases to 0.7 at twice the high end. */
export function lightFactor(c: Crop, dailyLight: number) {
  const [lo, hi] = dliBand(c)
  if (dailyLight <= 0) return 0
  if (dailyLight < lo) return dailyLight / lo
  if (dailyLight <= hi * 1.3) return 1
  return ramp(dailyLight, hi * 1.3, 1, hi * 2, 0.7)
}
/** From root-zone water, 0..1 of what the bay holds: 1 from 55 % up, 0 at 15 %. */
export const waterFactor = (moisture: number) => clamp((moisture - 0.15) / 0.4, 0, 1)
/** The worst of pH, conductivity, nutrient balance, root temperature and contamination. */
export function nutrientFactor(c: Crop, ph: number, ec: number, balance: number, rootTempC: number, contamination: number) {
  const phTerm = Math.max(0.2, 1 - 0.8 * outside(ph, GH.phBand[0], GH.phBand[1]))
  const ecTerm = Math.max(0.3, 1 - 0.7 * (outside(ec, c.ec[0], c.ec[1]) / 1.2))
  // a little drift costs nothing: the term is full down to a balance of 0.85
  const balanceTerm = 0.4 + 0.6 * clamp(balance / 0.85, 0, 1)
  const rootTerm = Math.max(0.4, 1 - 0.6 * (outside(rootTempC, 17, 23) / 8))
  const cleanTerm = 1 - 0.8 * clamp(contamination, 0, 1)
  return Math.min(phTerm, ecTerm, balanceTerm, rootTerm, cleanTerm)
}
/** The worst of CO2, oxygen and pressure. */
export function gasFactor(co2Ppm: number, o2Pct: number, kpa: number) {
  const co2 = co2Ppm <= 400 ? ramp(co2Ppm, 200, 0.2, 400, 0.8) : co2Ppm <= 800 ? ramp(co2Ppm, 400, 0.8, 800, 1) : ramp(co2Ppm, 2000, 1, 5000, 0.8)
  const o2 = o2Pct < 15 ? ramp(o2Pct, 10, 0, 15, 1) : o2Pct > 23.5 ? 0.8 : 1
  return Math.min(co2, o2, ramp(kpa, 20, 0, 70, 1))
}

// ------------------------------------------------------------------ Private state shapes
type Cause = FactorId | 'disease' | 'radiation' | ''

/** What the module remembers about a bay beyond what the panels read. */
interface Aux {
  /** Litres held in the root zone, and litres locked inside the plant. */
  rootL: number
  plantL: number
  /** Crop days grown toward the first harvest, regrown since the last cut, and spent bolting for seed. */
  first: number
  regrow: number
  bolt: number
  /** Crop days already behind this harvest when bolting began. */
  base: number
  bolting: boolean
  /** Health lost so far. Part of it never comes back. */
  damage: number
  /** Growth now, 0..1 of full. */
  rate: number
  /** Stress being added now, per second, and what is driving it. */
  gain: number
  cause: Cause
  /** Stress has been high long enough for the leaves to show it. */
  sick: boolean
  /** Root-zone water one second ago, for the trend. */
  was: number
}
const newAux = (): Aux => ({ rootL: 0, plantL: 0, first: 0, regrow: 0, bolt: 0, base: 0, bolting: false, damage: 0, rate: 1, gain: 0, cause: '', sick: false, was: 0 })

interface Fault {
  kind: FaultKind
  /** What is broken: 'array', 'pumpA', 'pumpB', 'line:A2', 'thermal', 'dehumidifier', 'solution', 'seal', a bay id, or 'sun'. */
  target: string
  /** nutrient: 'doser', 'ph' or 'balance'. radiation: 'watch' then 'storm'. */
  variant: string
  alertId: number
  since: number
  fixed: boolean
  fixedAt: number
  /** It reached the damage stage at some point. */
  damaged: boolean
  /** arrayFeather and radiation: when the current phase ends. */
  until: number
  /** leak */
  located: boolean
  repaired: boolean
  place: string
  /** contamination: when it next jumps to another bay. */
  nextSpread: number
  /** radiation: the crew dose when it began. */
  dose0: number
  /** nutrient balance: the nutrient that ran short. */
  short: string
  /** Bays it has touched, for the recovery stage. */
  bays: BayId[]
}

const READING_IDS: ReadingId[] = ['temp', 'rh', 'pressure', 'o2', 'co2', 'ph', 'ec', 'rootTemp', 'tank', 'battery', 'reserve']
const LEVEL_RANK: Record<AlertLevel, number> = { recovery: 0, warning: 1, degraded: 2, damage: 3 }
const NUTRIENTS = ['Nitrogen', 'Phosphorus', 'Potassium', 'Calcium', 'Magnesium']
const LEAK_PLACES = ['the vestibule hatch gasket', 'a utility penetration in the service bay', 'an observation window seal on rack band A', 'the end-cap seal behind rack band B']
const LOADS: [LoadId, string][] = [
  ['controls', 'Controls and sensors'], ['air', 'Air loop: fans, CO2, dehumidifier'], ['pumps', 'Irrigation pumps'], ['thermal', 'Thermal control'],
  ['lightsA', 'Lights, rack band A'], ['lightsB', 'Lights, rack band B'], ['processor', 'Food processor'],
]
const REPAIRS: Record<RepairId, { label: string; seconds: number; healthy: string }> = {
  pumpA: { label: 'Repair pump A', seconds: RATES.job.pump, healthy: 'Pump A is healthy.' },
  pumpB: { label: 'Repair pump B', seconds: RATES.job.pump, healthy: 'Pump B is healthy.' },
  thermal: { label: 'Repair the thermal unit', seconds: RATES.job.thermal, healthy: 'The thermal unit is healthy.' },
  dehumidifier: { label: 'Repair the dehumidifier', seconds: RATES.job.dehumidifier, healthy: 'The dehumidifier is healthy.' },
  seal: { label: 'Repair the seal', seconds: RATES.job.seal, healthy: 'No leak has been found.' },
  array: { label: 'Reset the array string', seconds: RATES.job.array, healthy: 'The array is healthy.' },
}
const lower = (c: Crop) => c.name.toLowerCase()
const rackName = (k: BayKind) => (k === 'tall' ? 'tall trellis bay' : 'two-shelf rack')
const needsHelp = (c: Crop) => c.pollination === 'vibrate' || c.pollination === 'assist'

/** Leaf cover, 0..1: what drives water use, nutrient use and oxygen. */
function canopy(p: Planting, a: Aux, c: Crop) {
  if (p.stage === 'dead') return 0
  if (p.spent) return 0.5
  if (p.stage === 'postharvest' && c.harvest.kind === 'cut') return 0.6 + 0.4 * clamp(a.regrow / c.harvest.regrowDays, 0, 1)
  return Math.pow(clamp(a.first / (c.timerDays * c.phases[3]), 0, 1), 1.5)
}

// ------------------------------------------------------------------ The module
export class Greenhouse {
  /** Real seconds the module has run. */
  t = 0
  /** True once the first crop is planted. Before that nothing drifts and nothing fails. */
  commissioned = false
  tier: 1 | 2 | 3 | 4 = 1
  recipe: Recipe = { ...GH.recipe }
  bays: Bay[] = []
  loads: Load[] = []
  /** Most protected first. When the battery is empty the controller sheds from the end. */
  priority: LoadId[] = ['controls', 'air', 'pumps', 'thermal', 'lightsA', 'lightsB', 'processor']
  inventory!: Inventory
  alerts: Alert[] = []
  jobs: Job[] = []
  log: GhLog[] = []
  exterior!: Exterior

  // interior air
  tempC: number = GH.recipe.tempLitC
  rhPct: number = GH.recipe.rhPct
  pressureKpa: number = GH.pressureKpa
  o2Pct: number = GH.o2Pct
  co2Ppm: number = GH.recipe.co2Ppm
  /** Makeup air left in the reserve tanks, kg. */
  reserveKg: number = GH.reserveKg
  /** The leaking compartment's hatch is closed. */
  compartmentClosed = false

  // nutrient loop
  tankL: number = GH.tankL
  ph: number = GH.ph
  ec: number = GH.ec
  rootTempC: number = GH.rootTempC
  /** 0..1: how well the dissolved nutrients match what plants need. Conductivity alone cannot show it. */
  balance = 1
  /** The last lab test of the solution, or null if none has been run. */
  labTest: { at: number; balance: number; note: string } | null = null
  transpiredL = 0
  recoveredL = 0
  lostL = 0
  makeupL = 0
  makeupUsesLeft: number = GH.makeupUses
  /** Water that left the loop inside harvested or cleared plants, litres. */
  harvestedL = 0

  // power
  batteryKwh: number = GH.batteryKwh * GH.batteryStart
  generationKw = 0
  loadKw = 0
  backupLeft = 0
  backupUsesLeft: number = GH.backupUses

  // totals for the score and the debrief
  harvestCount = 0
  plantsLost = 0
  o2MadeKg = 0
  /** Crew radiation dose picked up inside the module during particle events, mSv (game value). */
  doseMsv = 0
  /** Staple harvests turned into food by the processor. */
  staplesProcessed = 0

  // Everything below is plain data too, so a snapshot is one JSON copy of the object.
  private rng: number
  private eventsOn: boolean
  private commissionedAt = 0
  private nextFaultAt = 0
  private lastFault: FaultKind | '' = ''
  private faults: Fault[] = []
  private pastFaults: { kind: FaultKind; damaged: boolean }[] = []
  private aux = {} as Record<BayId, Aux>
  private hist = {} as Record<ReadingId, number[]>
  private sampleAcc = 0
  private ids = 0
  private healthSum = 0
  private healthN = 0
  private purifier = false
  private lastPhase = -1
  /** Litres a second leaving the leaves now. */
  private transpiring = 0
  /** What the processor is working on. */
  private batch: { crop: CropId | ''; kg: number; residueKg: number } = { crop: '', kg: 0, residueKg: 0 }

  constructor(opts: GreenhouseOptions = {}) {
    this.rng = (opts.seed ?? 1) | 0
    this.eventsOn = opts.events !== false
    this.bays = BAY_IDS.map(id => {
      const plan = BAY_PLAN[id]
      return { id, loop: plan.loop, kind: plan.kind, areaM2: GH.areaM2[plan.kind], unlocked: plan.tier <= this.tier, planting: null, ppfd: plan.kind === 'tier' ? 250 : 500, lightsOn: true, lit: 0, isolated: false, moisture: 0, flow: 0, contamination: 0, disease: 0 }
    })
    for (const id of BAY_IDS) this.aux[id] = newAux()
    this.loads = LOADS.map(([id, name]) => ({ id, name, kw: 0, wantKw: 0, on: true, shed: false, essential: id === 'controls' }))
    const zero = () => Object.fromEntries(CROP_IDS.map(c => [c, 0])) as Record<CropId, number>
    this.inventory = { seeds: zero(), food: zero(), raw: zero(), kcal: 0, proteinG: 0, variety: [], residueKg: 0, nutrientStock: GH.nutrientStock, sanitizer: GH.sanitizer }
    for (const c of CROPS) if (c.tier === 1) this.inventory.seeds[c.id] = GH.startSeeds
    this.exterior = { sunlight: 1, sunlit: true, orbit: 1, nextChange: 0, arrayHealth: 1, arrayState: 'tracking', radiation: 'quiet' }
    this.updateExterior({})
    this.updatePower(0)
    for (const id of READING_IDS) this.hist[id] = [this.value(id)]
  }

  // ---- reading the module -------------------------------------------------
  bay(id: BayId): Bay { return this.bays.find(b => b.id === id)! }

  private value(id: ReadingId): number {
    switch (id) {
      case 'temp': return this.tempC
      case 'rh': return this.rhPct
      case 'pressure': return this.pressureKpa
      case 'o2': return this.o2Pct
      case 'co2': return this.co2Ppm
      case 'ph': return this.ph
      case 'ec': return this.ec
      case 'rootTemp': return this.rootTempC
      case 'tank': return this.tankL
      case 'battery': return this.batteryPct
      case 'reserve': return this.reserveKg
    }
  }
  /** Change per minute of real time, from the last ten seconds of samples. */
  private trendOf(id: ReadingId) {
    const h = this.hist[id], k = Math.min(10, h.length - 1)
    return k > 0 ? ((h[h.length - 1] - h[h.length - 1 - k]) * 60) / k : 0
  }
  private dir(id: ReadingId, eps: number) { const d = this.trendOf(id); return d > eps ? 'rising' : d < -eps ? 'falling' : 'steady' }
  /** The air temperature the thermal unit is asked to hold: the lit setpoint while any bay is lit. */
  private tempTarget() { return this.bays.some(b => b.lit > 0) ? this.recipe.tempLitC : this.recipe.tempDarkC }
  /** The conductivity every planted crop is happy with: where their bands overlap. */
  private ecBand(): [number, number] {
    const live = this.bays.filter(b => this.alive(b)).map(b => crop(b.planting!.crop).ec)
    if (!live.length) return [1.2, 2.0]
    return [Math.max(...live.map(e => e[0])), Math.min(...live.map(e => e[1]))]
  }

  /** The eleven readings, each with target, band, trend and status. */
  readings(): Record<ReadingId, Reading> {
    const band = (v: number, [lo, hi]: [number, number], margin: number): Reading['status'] => (outside(v, lo, hi) <= 0 ? 'ok' : outside(v, lo, hi) <= margin ? 'warn' : 'bad')
    const floor = (v: number, ok: number, warn: number): Reading['status'] => (v >= ok ? 'ok' : v >= warn ? 'warn' : 'bad')
    const mk = (id: ReadingId, label: string, unit: string, target: number | null, b: [number, number] | null, status: Reading['status']): Reading => ({ id, label, unit, value: this.value(id), target, band: b, trend: this.trendOf(id), status })
    const tt = this.tempTarget(), off = Math.abs(this.tempC - tt), co2 = this.recipe.co2Ppm, ecb = this.ecBand()
    return {
      temp: mk('temp', 'Air temperature', '°C', tt, [tt - 1.5, tt + 1.5], off <= 1.5 ? 'ok' : off <= 4 ? 'warn' : 'bad'),
      rh: mk('rh', 'Relative humidity', '%', this.recipe.rhPct, [...GH.rhBand], band(this.rhPct, [...GH.rhBand], 8)),
      pressure: mk('pressure', 'Pressure', 'kPa', GH.pressureKpa, [100.5, 102], this.pressureKpa >= 100.5 ? 'ok' : this.pressureKpa >= 90 ? 'warn' : 'bad'),
      o2: mk('o2', 'Oxygen', '%', GH.o2Pct, [19.5, 23.5], band(this.o2Pct, [19.5, 23.5], 1.5)),
      co2: mk('co2', 'CO2', 'ppm', co2, [co2 - 150, co2 + 150], Math.abs(this.co2Ppm - co2) <= 150 ? 'ok' : this.co2Ppm >= 400 && this.co2Ppm <= 2000 ? 'warn' : 'bad'),
      ph: mk('ph', 'Nutrient pH', '', GH.ph, [...GH.phBand], band(this.ph, [...GH.phBand], 0.4)),
      ec: mk('ec', 'Conductivity', 'mS/cm', GH.ec, ecb, band(this.ec, ecb, 0.4)),
      rootTemp: mk('rootTemp', 'Root solution', '°C', GH.rootTempC, [17, 23], band(this.rootTempC, [17, 23], 3)),
      tank: mk('tank', 'Clean water', 'L', null, [60, GH.tankCapacityL], floor(this.tankL, 120, 60)),
      battery: mk('battery', 'Battery', '%', null, [20, 100], floor(this.batteryPct, 40, 20)),
      reserve: mk('reserve', 'Makeup air', 'kg', null, [10, GH.reserveKg], floor(this.reserveKg, 25, 10)),
    }
  }
  /** Last 60 one-second samples of a reading, oldest first. */
  history(id: ReadingId): number[] { return [...this.hist[id]] }
  get batteryPct(): number { return (this.batteryKwh / GH.batteryKwh) * 100 }
  /** Hours of station time the battery lasts at the current net draw, or null while it is charging. */
  get enduranceH(): number | null { const net = this.generationKw - this.loadKw; return net < -1e-9 ? this.batteryKwh / -net : null }
  /** Share of transpired water returned to the tank so far, 0..100. */
  get recoveryPct(): number { return this.transpiredL > 0 ? (this.recoveredL / this.transpiredL) * 100 : 0 }
  /** Planted surface in m², counted apart from floor and aisle. */
  get plantedM2(): number { return r1(this.bays.reduce((s, b) => s + (this.alive(b) ? b.areaM2 : 0), 0)) }
  /** Surface of the bays that are unlocked. */
  get openM2(): number { return r1(this.bays.reduce((s, b) => s + (b.unlocked ? b.areaM2 : 0), 0)) }
  /** Stored food in kg, ready to eat. */
  get foodKg(): number { return Object.values(this.inventory.food).reduce((s, kg) => s + kg, 0) }
  /** Stored food as days of one crew member's calories. */
  get crewDays(): number { return this.inventory.kcal / GH.crewDayKcal }
  /** Calories the module has made per crop day since it was commissioned, as a share of one crew member's needs, 0..100+. */
  get foodCoveragePct(): number {
    const days = this.commissioned ? (this.t - this.commissionedAt) / GH.secondsPerCropDay : 0
    return days >= 1 ? (this.inventory.kcal / days / GH.crewDayKcal) * 100 : 0
  }
  /** Where every litre is: the conservation check. `total` never changes. */
  waterBudget() {
    const roots = BAY_IDS.reduce((s, id) => s + this.aux[id].rootL, 0), plants = BAY_IDS.reduce((s, id) => s + this.aux[id].plantL, 0)
    return { tank: this.tankL, roots, plants, harvested: this.harvestedL, lost: this.lostL, makeup: this.makeupL, total: this.tankL + roots + plants + this.harvestedL + this.lostL - this.makeupL }
  }
  /** Share of light reaching a bay that counts for growth: off is 0, eclipse dimming is averaged over the orbit. */
  private growLight(b: Bay) { return b.lightsOn && this.powered(b.loop === 'A' ? 'lightsA' : 'lightsB') ? (this.recipe.eclipseDim ? 1 - 0.5 * (1 - GH.sunlitShare) : 1) : 0 }
  /** Daily light integral a bay gets, mol/m²/day, from its light setting and the photoperiod. */
  dliOf(id: BayId): number { const b = this.bay(id); return dli(b.ppfd * this.growLight(b), this.recipe.photoperiodH) }
  /** Real seconds until this bay's next harvest at the current growth rate, or null. */
  secondsToHarvest(id: BayId): number | null {
    const p = this.bay(id)?.planting
    if (!p || p.stage === 'dead' || p.spent) return null
    if (p.stage === 'ready') return 0
    const rate = this.aux[id].rate
    return rate > 0.01 ? (p.daysLeft * GH.secondsPerCropDay) / rate : null
  }
  /** Crops the current tier offers. */
  cropsOpen(): CropId[] { return CROPS.filter(c => c.tier <= this.tier).map(c => c.id) }
  /** One line for the HUD: how many bays are growing, ready, and in trouble. */
  summary(): { planted: number; ready: number; alerts: number; worst: AlertLevel | null; pollinate: number } {
    const live = this.bays.filter(b => this.alive(b))
    const worst = this.alerts.reduce<AlertLevel | null>((w, a) => (w === null || LEVEL_RANK[a.level] > LEVEL_RANK[w] ? a.level : w), null)
    return { planted: live.length, ready: live.filter(b => b.planting!.stage === 'ready').length, alerts: this.alerts.length, worst, pollinate: live.filter(b => b.planting!.needsPollination).length }
  }
  /** Whether the next tier can be unlocked now, and what is still missing if not. */
  unlockStatus(): { next: Tier | null; ready: boolean; missing: string } {
    if (this.tier >= 4) return { next: null, ready: false, missing: 'Every tier is open.' }
    const next = TIERS[this.tier]
    const parts: string[] = []
    if (next.level === 2 && this.harvestCount < 2) parts.push(`${plural(2 - this.harvestCount, 'more harvest')} to store`)
    if (next.level === 3) {
      if (this.harvestCount < 5) parts.push(`${plural(5 - this.harvestCount, 'more harvest')} to store`)
      if (this.inventory.variety.length < 3) parts.push(`${plural(3 - this.inventory.variety.length, 'more kind')} of fresh crop`)
    }
    if (next.level === 4 && this.staplesProcessed < 1) parts.push('one staple harvest processed into food')
    return { next, ready: !parts.length, missing: parts.length ? `Still needed: ${parts.join(', and ')}.` : '' }
  }
  score(): Score {
    const inv = this.inventory
    const kinds = inv.variety.length
    const meanHealth = this.healthN ? this.healthSum / this.healthN : 0
    // a failure fixed before any crop was hurt counts in full, one fixed after damage counts half, an open one nothing
    const marks: number[] = [...this.pastFaults.map(f => (f.damaged ? 0.5 : 1)), ...this.faults.map(f => (f.fixed ? (f.damaged ? 0.5 : 1) : 0))]
    const open = this.faults.filter(f => !f.fixed).length
    let reliability = !this.commissioned ? 0 : marks.length ? (15 * marks.reduce((s, m) => s + m, 0)) / marks.length : 8
    const overDose = this.doseMsv > RATES.doseLimitMsv
    if (overDose) reliability = Math.max(0, reliability - 3)
    const rec = this.recoveryPct
    const part = (id: ScorePart['id'], label: string, points: number, max: number, why: string): ScorePart => ({ id, label, points: r1(clamp(points, 0, max)), max, why })
    const parts = [
      part('variety', 'Fresh-food variety', 4 * kinds, 20, kinds ? `${plural(kinds, 'kind')} of fresh food harvested (${inv.variety.map(c => lower(crop(c))).join(', ')}). 4 points each, up to 20.` : 'No fresh crop harvested yet. 4 points for each kind, up to 20.'),
      part('calories', 'Calories', 15 * Math.min(1, inv.kcal / 25000), 15, `${Math.round(inv.kcal).toLocaleString('en-US')} kcal stored of a 25,000 kcal target: ${r1(this.crewDays)} crew-days.`),
      part('protein', 'Protein', 10 * Math.min(1, inv.proteinG / 600), 10, `${Math.round(inv.proteinG)} g of protein stored of a 600 g target.`),
      part('health', 'Crop health', this.healthN ? 20 * (meanHealth / 100) - 3 * this.plantsLost : 0, 20, this.healthN ? `Crops averaged ${Math.round(meanHealth)} % health at harvest${this.plantsLost ? `; ${plural(this.plantsLost, 'planting')} lost, 3 points each` : ''}.` : `Nothing harvested yet${this.plantsLost ? `, and ${plural(this.plantsLost, 'planting')} lost` : ''}.`),
      part('reliability', 'Reliability', reliability, 15, (!this.commissioned ? 'Nothing planted yet.' : !marks.length ? 'No failure so far: 8 of 15 until the module has been tested.' : `${plural(marks.filter(m => m === 1).length, 'failure')} fixed before any crop was hurt, ${marks.filter(m => m === 0.5).length} fixed after damage, ${open} still open.`) + (overDose ? ` Crew dose ${r2(this.doseMsv)} mSv in the module during a particle event: 3 points off.` : '')),
      part('water', 'Water recovery', this.transpiredL >= 20 ? (10 * (rec - 80)) / 15 : 0, 10, this.transpiredL >= 20 ? `${r1(rec)} % of transpired water returned to the tank. 80 % scores nothing, 95 % scores 10.` : 'Counted once the crops have transpired 20 litres.'),
      part('progress', 'Progress', [0, 3, 6, 10][this.tier - 1], 10, `Tier ${this.tier} of 4: ${TIERS[this.tier - 1].name.toLowerCase()}.`),
    ]
    return { total: Math.round(parts.reduce((s, p) => s + p.points, 0)), parts }
  }
  /** The task counts as attempted once a crop is planted and complete once a harvest is stored. */
  get attempted(): boolean { return this.commissioned }
  get complete(): boolean { return this.harvestCount > 0 }

  // ---- bays -----------------------------------------------------------------
  // Every action returns null when it worked, or the reason it could not be done.
  private alive(b: Bay) { return !!b.planting && b.planting.stage !== 'dead' }

  plant(id: BayId, cropId: CropId): string | null {
    const b = this.bay(id), c = crop(cropId)
    if (!b) return 'Unknown bay.'
    if (!c) return 'Unknown crop.'
    if (!b.unlocked) return `Bay ${id} is not open yet: unlock "${TIERS[BAY_PLAN[id].tier - 1].name}" first.`
    if (b.planting) return b.planting.stage === 'dead' || b.planting.spent ? `Clear bay ${id} first.` : `Bay ${id} already holds ${lower(crop(b.planting.crop))}.`
    if (c.bay !== b.kind) return `${c.name} needs a ${rackName(c.bay)}. Bay ${id} is a ${rackName(b.kind)}.`
    if (c.tier > this.tier) return `${c.name} seed is not on board yet: unlock "${TIERS[c.tier - 1].name}" first.`
    if (this.inventory.seeds[cropId] < 1) return `No ${lower(c)} seed left. Keep a planting for seed, or ask for resupply.`
    this.inventory.seeds[cropId]--
    const a = (this.aux[id] = newAux())
    a.rootL = Math.min(GH.rootL[b.kind], this.tankL)
    this.tankL -= a.rootL
    b.moisture = a.was = a.rootL / GH.rootL[b.kind]
    b.ppfd = defaultPpfd(c)
    b.lightsOn = true
    b.disease = 0
    b.planting = {
      crop: cropId, stage: 'seed', ageDays: 0, progress: 0, daysLeft: c.timerDays, health: 100, stress: 0, symptom: 'none',
      factors: { temperature: 1, light: 1, water: 1, nutrient: 1, gas: 1 }, limiting: null, needsPollination: false, pollinated: false, harvests: 0, forSeed: false, spent: false,
    }
    if (!this.commissioned) {
      this.commissioned = true
      this.commissionedAt = this.t
      this.nextFaultAt = this.t + this.between(RATES.firstFault)
      this.note('Greenhouse commissioned: the first crop is sown.', 'system')
    }
    this.note(`Bay ${id}: ${lower(c)} sown.`, 'crop')
    this.updatePower(0)
    return null
  }

  /** 'cut' or 'pick' leaves the plant to regrow; 'whole' takes it. Defaults to the crop's usual harvest. */
  harvest(id: BayId, mode?: 'cut' | 'pick' | 'whole'): string | null {
    const b = this.bay(id), p = b?.planting
    if (!b) return 'Unknown bay.'
    if (!p) return `Bay ${id} is empty.`
    const c = crop(p.crop), h = c.harvest, a = this.aux[id]
    if (p.stage === 'dead') return `The ${lower(c)} in bay ${id} is dead. Clear the bay.`
    if (p.spent) return `The ${lower(c)} in bay ${id} is spent. Clear the bay.`
    if (p.stage !== 'ready') return `Bay ${id} is not ready to harvest yet.`
    const m = mode ?? h.kind
    if (m === 'whole' ? !(h.kind === 'whole' || h.wholeToo) : m !== h.kind) return `${c.name} cannot be harvested that way.`
    const fruitSet = needsHelp(c) && !p.pollinated ? c.unaidedSet : 1
    const share = m === 'whole' ? (p.harvests === 0 ? 1 : Math.max(h.share, 1 - h.share * p.harvests)) : h.share
    const kg = c.yieldKgM2 * b.areaM2 * share * (p.health / 100) * fruitSet
    const pulled = m === 'whole' || a.bolting
    if (p.forSeed) {
      this.inventory.seeds[c.id] += GH.seedSaveGain
      this.note(`Bay ${id}: ${lower(c)} kept for seed, +${plural(GH.seedSaveGain, 'seed packet')}. No food from this harvest.`, 'crop')
    } else {
      if (c.processing.length) this.inventory.raw[c.id] += kg
      else this.store(c, kg)
      this.harvestCount++
      this.healthSum += p.health
      this.healthN++
      this.note(`Bay ${id}: ${r1(kg)} kg of ${lower(c)} harvested at ${Math.round(p.health)} % health${needsHelp(c) && !p.pollinated ? ', with few fruit set because the flowers got no help' : ''}${c.processing.length ? '. It needs processing before it is food' : ''}.`, 'food')
    }
    this.inventory.residueKg += pulled ? 0.3 * c.yieldKgM2 * b.areaM2 : 0.3 * kg
    if (pulled) { this.emptyBay(b); this.updatePower(0); return null }
    const out = a.plantL * share
    a.plantL -= out
    this.harvestedL += out
    p.harvests++
    p.forSeed = false
    p.stage = 'postharvest'
    a.regrow = 0
    if (p.harvests >= h.max) { p.spent = true; this.note(`Bay ${id}: the ${lower(c)} has given its last harvest. Clear the bay.`, 'crop') }
    this.refresh(b)
    return null
  }
  /** Adds ready-to-eat food to the store, with its calories and protein. */
  private store(c: Crop, kg: number) {
    const inv = this.inventory
    inv.food[c.id] += kg
    inv.kcal += kg * c.kcalPerKg
    inv.proteinG += kg * c.proteinGPerKg
    if (c.fresh && kg > 0 && !inv.variety.includes(c.id)) inv.variety.push(c.id)
  }
  /** Takes the plant out: its root water drains to the tank, the water inside it leaves the loop. */
  private emptyBay(b: Bay) {
    const a = this.aux[b.id]
    this.tankL += a.rootL
    this.harvestedL += a.plantL
    this.aux[b.id] = newAux()
    b.planting = null
    b.moisture = b.flow = b.lit = b.disease = 0
    this.alerts = this.alerts.filter(x => !(x.kind === 'crop' && x.bay === b.id))
  }

  /** Removes a dead or spent plant. The residue goes to the recycler. */
  clear(id: BayId): string | null {
    const b = this.bay(id), p = b?.planting
    if (!b) return 'Unknown bay.'
    if (!p) return `Bay ${id} is already empty.`
    const c = crop(p.crop)
    if (p.stage !== 'dead' && !p.spent) return `The ${lower(c)} in bay ${id} is still growing. Harvest it first.`
    this.inventory.residueKg += 0.3 * c.yieldKgM2 * b.areaM2 * clamp(this.aux[id].first / c.timerDays, 0.1, 1)
    this.note(`Bay ${id}: ${p.stage === 'dead' ? 'dead' : 'spent'} ${lower(c)} cleared.`, 'crop')
    this.emptyBay(b)
    this.updatePower(0)
    return null
  }

  /** The vibration tool for tomato flowers, gentle help for pepper flowers. */
  pollinate(id: BayId): string | null {
    const b = this.bay(id), p = b?.planting
    if (!b) return 'Unknown bay.'
    if (!p || p.stage === 'dead') return `Nothing is flowering in bay ${id}.`
    const c = crop(p.crop)
    if (!needsHelp(c)) return `${c.name} sets ${c.pollination === 'self' ? 'on its own' : 'no fruit'}: nothing to do.`
    if (p.pollinated) return `The ${lower(c)} flowers in bay ${id} are already set.`
    if (!p.needsPollination) return `The ${lower(c)} in bay ${id} is not flowering now.`
    p.pollinated = true
    p.needsPollination = false
    this.note(`Bay ${id}: ${lower(c)} flowers ${c.pollination === 'vibrate' ? 'vibrated to shed pollen' : 'helped to set'}.`, 'crop')
    return null
  }

  /** Keep this planting for seed instead of food. */
  setForSeed(id: BayId, on: boolean): string | null {
    const b = this.bay(id), p = b?.planting
    if (!b) return 'Unknown bay.'
    if (!p) return `Bay ${id} is empty.`
    if (p.stage === 'dead' || p.spent) return `Clear bay ${id} first.`
    if (p.forSeed === on) return null
    const c = crop(p.crop), a = this.aux[id]
    if (c.seedDays > 0) {
      if (!on && a.bolting) return `The ${lower(c)} in bay ${id} has bolted: it can only give seed now.`
      // a leaf or root crop that was ready to eat is left to bolt and flower
      if (on && p.stage === 'ready') { a.bolting = true; a.bolt = 0; a.base = 0; p.stage = 'reproductive' }
    }
    p.forSeed = on
    this.refresh(b)
    return null
  }

  setLight(id: BayId, ppfd: number): string | null {
    const b = this.bay(id)
    if (!b) return 'Unknown bay.'
    if (!Number.isFinite(ppfd) || ppfd < 50 || ppfd > 1000) return 'Light can be set from 50 to 1,000 µmol/m²/s.'
    b.ppfd = Math.round(ppfd / 10) * 10
    this.updatePower(0)
    return null
  }
  setLightsOn(id: BayId, on: boolean): string | null {
    const b = this.bay(id)
    if (!b) return 'Unknown bay.'
    b.lightsOn = !!on
    this.updatePower(0)
    return null
  }
  /** Closes or opens the bay's isolation valve. */
  isolate(id: BayId, on: boolean): string | null {
    const b = this.bay(id)
    if (!b) return 'Unknown bay.'
    if (!b.unlocked) return `Bay ${id} is not open yet.`
    b.isolated = !!on
    this.updatePower(0)
    return null
  }
  /** Clears a blocked supply line to the bay. Takes time. */
  clearLine(id: BayId): string | null {
    if (!this.bay(id)) return 'Unknown bay.'
    if (!this.broken('irrigation', `line:${id}`)) return `The supply line to bay ${id} is clear.`
    return this.start('clearLine', `Clear the line to bay ${id}`, id, RATES.job.clearLine)
  }
  /** Sterilises a contaminated root zone. Takes time and one dose of sanitiser. */
  treat(id: BayId): string | null {
    const b = this.bay(id)
    if (!b) return 'Unknown bay.'
    if (b.contamination <= 0.05) return `Bay ${id} is not contaminated.`
    if (this.busy('treat', id)) return `Bay ${id} is already being treated.`
    if (this.inventory.sanitizer < 1) return 'No sanitiser left. The next cargo run brings one dose.'
    this.inventory.sanitizer--
    return this.start('treat', `Treat the root zone of bay ${id}`, id, RATES.job.treat)
  }

  // ---- climate, solution, power --------------------------------------------
  setRecipe(patch: Partial<Recipe>): string | null {
    const names: Record<keyof typeof RECIPE_LIMITS, string> = { tempLitC: 'Lit temperature', tempDarkC: 'Dark temperature', rhPct: 'Humidity', co2Ppm: 'CO2', photoperiodH: 'Photoperiod' }
    for (const k of Object.keys(RECIPE_LIMITS) as (keyof typeof RECIPE_LIMITS)[]) {
      const v = patch[k]
      if (v === undefined) continue
      const [lo, hi] = RECIPE_LIMITS[k]
      if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) return `${names[k]} must be between ${lo} and ${hi}.`
    }
    if (patch.eclipseDim !== undefined && typeof patch.eclipseDim !== 'boolean') return 'Eclipse dimming is on or off.'
    this.recipe = { ...this.recipe, ...patch }
    this.updatePower(0)
    return null
  }
  /** A fresh, balanced batch: conductivity and pH back on target. Takes time and one unit of nutrient stock. */
  mix(): string | null {
    if (this.busy('mix')) return 'A batch is already being mixed.'
    if (this.inventory.nutrientStock < 1) return 'A fresh batch needs one unit of nutrient stock. Recycle crop residue, or wait for the next cargo run.'
    this.inventory.nutrientStock -= 1
    return this.start('mix', 'Mix a fresh nutrient batch', 'solution', RATES.job.mix)
  }
  dose(what: 'nutrient' | 'phUp' | 'phDown'): string | null {
    if (what === 'nutrient') {
      if (this.inventory.nutrientStock < RATES.doseStock) return 'No nutrient stock left. Recycle crop residue, or wait for the next cargo run: a seed resupply brings one unit.'
      this.inventory.nutrientStock = r2(this.inventory.nutrientStock - RATES.doseStock)
      this.ec = Math.min(3.2, r2(this.ec + RATES.doseEc))
    } else if (what === 'phUp') this.ph = Math.min(8, r2(this.ph + RATES.dosePh))
    else if (what === 'phDown') this.ph = Math.max(4, r2(this.ph - RATES.dosePh))
    else return 'Unknown dose.'
    return null
  }
  /** Dumps part of the solution to dilute salts. Costs water. */
  flush(): string | null {
    if (this.busy('flush')) return 'A flush is already running.'
    if (this.tankL < 20) return 'Too little water in the tank to flush.'
    return this.start('flush', 'Flush the nutrient loop', 'solution', RATES.job.flush)
  }
  /** Sends a sample to the lab: shows the nutrient balance that conductivity cannot. */
  testSolution(): string | null {
    if (this.busy('labTest')) return 'A sample is already at the lab.'
    return this.start('labTest', 'Lab test of the nutrient solution', 'solution', RATES.job.labTest)
  }
  /** Tops the tank up from the station's supply. A limited number of times. */
  requestMakeup(): string | null {
    if (this.busy('makeup')) return 'Makeup water is already on its way.'
    if (this.makeupUsesLeft < 1) return 'The station has no more water to spare.'
    if (this.tankL > GH.tankCapacityL - 10) return 'The tank is full.'
    this.makeupUsesLeft--
    return this.start('makeup', `Makeup water from the station, ${GH.makeupL} L`, 'tank', RATES.job.makeup)
  }
  repair(what: RepairId): string | null {
    const r = REPAIRS[what]
    if (!r) return 'Unknown equipment.'
    const fault = what === 'pumpA' || what === 'pumpB' ? this.open('irrigation', what) : what === 'thermal' ? this.open('climate') : what === 'dehumidifier' ? this.open('humidity') : what === 'seal' ? this.open('leak') : this.open('arrayString')
    if (!fault || (what === 'seal' && fault.repaired)) return what === 'array' && this.open('arrayFeather') ? 'The array is feathered for a visiting vehicle. It tracks again by itself.' : r.healthy
    if (what === 'seal' && !fault.located) return 'Locate the leak first: diagnose the pressure alert.'
    if (this.busy('repair', what)) return `${r.label}: already under way.`
    return this.start('repair', r.label, what, r.seconds)
  }
  setLoadOn(id: LoadId, on: boolean): string | null {
    const l = this.loads.find(x => x.id === id)
    if (!l) return 'Unknown load.'
    if (l.essential && !on) return 'Controls and sensors stay on.'
    l.on = !!on
    if (on) l.shed = false
    this.updatePower(0)
    return null
  }
  /** Moves a load one place up (more protected) or down the shedding order. */
  movePriority(id: LoadId, dir: -1 | 1): string | null {
    const i = this.priority.indexOf(id), j = i + dir
    if (i < 0) return 'Unknown load.'
    if (id === 'controls') return 'Controls and sensors always come first.'
    if (j < 1 || j >= this.priority.length) return dir < 0 ? 'Only the controls are protected more.' : 'Already the first to be shed.'
    const next = [...this.priority]
    ;[next[i], next[j]] = [next[j], next[i]]
    this.priority = next
    return null
  }
  /** Ties in the station's main bus for a short while. A limited number of times. */
  useBackup(): string | null {
    if (this.backupLeft > 0) return 'The station bus is already tied in.'
    if (this.backupUsesLeft < 1) return 'The station cannot spare more power.'
    this.backupUsesLeft--
    this.backupLeft = GH.backupSeconds
    this.note(`Station bus tied in: +${GH.backupKw} kW for ${GH.backupSeconds} s.`, 'system')
    this.updatePower(0)
    return null
  }
  /** Closes or opens the hatch of the compartment a located leak is in. */
  closeCompartment(on: boolean): string | null {
    if (on === this.compartmentClosed) return null
    if (on) {
      const leak = this.open('leak')
      if (!leak) return 'There is no leak to close off.'
      if (!leak.located) return 'Locate the leak first: diagnose the pressure alert.'
      this.compartmentClosed = true
      this.note(`Compartment closed at ${leak.place}.`, 'system')
      return null
    }
    // the closed compartment vented; filling it again comes out of the reserve, or out of the cabin
    this.compartmentClosed = false
    const from = Math.min(RATES.repressKg, this.reserveKg)
    this.reserveKg -= from
    this.pressureKpa -= ((RATES.repressKg - from) / GH.airKg) * GH.pressureKpa
    this.note(`Compartment reopened: ${RATES.repressKg} kg of air to fill it again.`, 'system')
    return null
  }

  // ---- alerts -----------------------------------------------------------------
  acknowledge(alertId: number): string | null {
    const al = this.alerts.find(x => x.id === alertId)
    if (!al) return 'That alert has cleared.'
    al.acknowledged = true
    return null
  }
  /** Finds the cause behind an alert. Takes time. */
  diagnose(alertId: number): string | null {
    const al = this.alerts.find(x => x.id === alertId)
    if (!al) return 'That alert has cleared.'
    if (al.diagnosed) return 'Already diagnosed.'
    if (this.busy('diagnose', String(alertId))) return 'Diagnosis already under way.'
    const seconds = al.kind === 'leak' ? RATES.job.diagnoseLeak : al.kind === 'irrigation' ? RATES.job.diagnoseFlow : RATES.job.diagnose
    return this.start('diagnose', al.kind === 'leak' ? 'Locate the leak' : `Diagnose: ${al.title}`, String(alertId), seconds)
  }

  // ---- food, seeds, progress ---------------------------------------------------
  /** Runs a harvested staple through its steps (thresh, mill, shell, cook) into food. */
  process(cropId: CropId): string | null {
    const c = crop(cropId)
    if (!c) return 'Unknown crop.'
    if (!c.processing.length) return `${c.name} is eaten fresh: nothing to process.`
    if (this.tier < 3) return `The food processor comes with "${TIERS[2].name}".`
    if (this.busy('process') || this.busy('recycle')) return 'The processor is busy.'
    const kg = this.inventory.raw[cropId]
    if (kg <= 0) return `No harvested ${lower(c)} is waiting.`
    this.inventory.raw[cropId] = 0
    this.batch = { crop: cropId, kg, residueKg: 0 }
    return this.start('process', `${c.name}: ${c.processing.join(', ')}`, cropId, RATES.job.processStep * c.processing.length)
  }
  /** Turns crop residue into nutrient stock, with losses. Needs tier 4. */
  recycle(): string | null {
    if (this.tier < 4) return `The residue recycler comes with "${TIERS[3].name}".`
    if (this.busy('process') || this.busy('recycle')) return 'The processor is busy.'
    if (this.inventory.residueKg < 2) return 'The recycler needs at least 2 kg of crop residue.'
    const kg = Math.min(4, this.inventory.residueKg)
    this.inventory.residueKg -= kg
    this.batch = { crop: '', kg: 0, residueKg: kg }
    return this.start('recycle', `Recycle ${r1(kg)} kg of crop residue`, 'residue', RATES.job.recycle)
  }
  /** Asks the next cargo run for seed. Takes a while. */
  resupply(cropId: CropId): string | null {
    const c = crop(cropId)
    if (!c) return 'Unknown crop.'
    if (c.tier > this.tier) return `${c.name} seed is not on the manifest yet.`
    if (this.busy('resupply')) return 'A cargo run is already on its way.'
    return this.start('resupply', `Cargo run: ${lower(c)} seed`, cropId, RATES.job.resupply)
  }
  /** Opens the next tier when its needs are met. */
  unlock(): string | null {
    const s = this.unlockStatus()
    if (!s.next) return 'Every tier is already open.'
    if (!s.ready) return s.missing
    this.tier = s.next.level
    for (const b of this.bays) b.unlocked = BAY_PLAN[b.id].tier <= this.tier
    for (const c of CROPS) if (c.tier === this.tier) this.inventory.seeds[c.id] += GH.unlockSeeds
    this.note(`Unlocked: ${s.next.name}. ${s.next.unlocks}`, 'system')
    return null
  }
  /** The station's water purifier is working (the Hab Systems task): better water recovery. */
  setPurifier(on: boolean): void { this.purifier = !!on }

  // ---- time ---------------------------------------------------------------------
  /** Advances the module by `dt` real seconds. Safe with large steps: it sub-steps. */
  tick(dt: number, input: TickInput = {}): void {
    let left = Number.isFinite(dt) ? Math.max(0, dt) : 0
    while (left > 1e-9) {
      const h = Math.min(RATES.step, left)
      this.step(h, input)
      left -= h
    }
  }
  /**
   * Starts a failure now. For tests and for showing the module to someone. `target` is a bay
   * (a blocked line, or where contamination starts) or a loop (a failed pump); `variant` picks
   * the nutrient problem: 'doser', 'ph' or 'balance'.
   */
  inject(kind: FaultKind, target?: BayId | LoopId, variant?: string): string | null {
    if (!FAULT_KINDS.includes(kind)) return 'Unknown failure.'
    return this.startFault(kind, target, variant)
  }
  /** The failures in progress, for the debug readout. */
  activeFaults(): { kind: FaultKind; target: string; level: AlertLevel }[] {
    return this.faults.map(f => ({ kind: f.kind, target: f.target, level: this.alerts.find(a => a.id === f.alertId)?.level ?? 'warning' }))
  }

  // ---- save and reload ------------------------------------------------------------
  snapshot(): GreenhouseSnapshot { return { ...(JSON.parse(JSON.stringify(this)) as Record<string, unknown>), v: 1 } }
  static restore(snap: GreenhouseSnapshot): Greenhouse {
    const g = new Greenhouse()
    const { v: _v, ...data } = JSON.parse(JSON.stringify(snap)) as GreenhouseSnapshot
    void _v
    Object.assign(g, data)
    return g
  }

  // ================================================================== inside
  private rand() {
    const a = (this.rng = (this.rng + 0x6d2b79f5) | 0)
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  private between([lo, hi]: readonly [number, number]) { return lo + this.rand() * (hi - lo) }
  private pick<T>(list: T[]): T { return list[Math.min(list.length - 1, Math.floor(this.rand() * list.length))] }
  private note(text: string, kind: GhLog['kind']) { this.log.push({ at: r1(this.t), text, kind }) }

  private load(id: LoadId) { return this.loads.find(l => l.id === id)! }
  /** Switched on and not shed. */
  private powered(id: LoadId) { const l = this.load(id); return l.on && !l.shed }
  /** The unfixed failure of this kind (and target), if there is one. */
  private open(kind: FaultKind, target?: string) { return this.faults.find(f => f.kind === kind && !f.fixed && (target === undefined || f.target === target)) }
  private broken(kind: FaultKind, target?: string) { return !!this.open(kind, target) }
  private busy(kind: JobKind, target?: string) { return this.jobs.some(j => j.kind === kind && (target === undefined || j.target === target)) }
  private start(kind: JobKind, label: string, target: string, seconds: number): string | null {
    this.jobs.push({ id: ++this.ids, kind, label, target, total: seconds, left: seconds })
    return null
  }

  private step(dt: number, input: TickInput) {
    this.t += dt
    this.updateExterior(input)
    this.stepJobs(dt)
    if (this.commissioned) {
      this.stepFaults(dt, input)
      this.updatePower(dt)
      this.stepWater(dt)
      this.stepSolution(dt)
      this.stepAir(dt)
      this.stepBays(dt)
      this.stepAlerts()
    } else this.updatePower(0)
    this.sampleAcc += dt
    while (this.sampleAcc >= 1) { this.sampleAcc -= 1; this.sample() }
  }

  /** Once a real second: the reading histories, the root-water trend, and the wording of every alert. */
  private sample() {
    for (const id of READING_IDS) {
      const h = this.hist[id]
      h.push(this.value(id))
      if (h.length > 60) h.shift()
    }
    this.retext()
    for (const b of this.bays) this.aux[b.id].was = b.moisture
  }

  // ---- outside ----------------------------------------------------------------
  private updateExterior(input: TickInput) {
    const e = this.exterior
    const phase = clamp(input.orbitPhase ?? ((this.t + GH.orbitOffset) % GH.orbitSeconds) / GH.orbitSeconds, 0, 0.999999)
    if (this.lastPhase >= 0 && phase < this.lastPhase - 0.5) e.orbit++
    this.lastPhase = phase
    const edge = 0.02
    e.sunlit = phase < GH.sunlitShare
    e.sunlight = e.sunlit ? clamp(phase / edge, 0, 1) * clamp((GH.sunlitShare - phase) / edge, 0, 1) : 0
    e.nextChange = (e.sunlit ? GH.sunlitShare - phase : 1 - phase) * GH.orbitSeconds
    const feather = this.broken('arrayFeather'), string = this.broken('arrayString')
    e.arrayHealth = feather ? RATES.featherHealth : string ? RATES.stringHealth : 1
    e.arrayState = feather ? 'feathered' : string ? 'string offline' : 'tracking'
    const spe = this.open('radiation')
    e.radiation = !spe ? 'quiet' : spe.variant === 'storm' ? 'storm' : 'watch'
  }

  // ---- power --------------------------------------------------------------------
  /** Sets what every load draws, sheds if the battery is empty, and (for dt > 0) charges or drains the battery. */
  private updatePower(dt: number) {
    const dim = this.recipe.eclipseDim && !this.exterior.sunlit ? 0.5 : 1
    const duty = this.recipe.photoperiodH / 24
    const want: Record<LoadId, number> = { controls: GH.loadKw.controls, air: GH.loadKw.air, pumps: 0, thermal: 0, lightsA: 0, lightsB: 0, processor: 0 }
    for (const loop of ['A', 'B'] as LoopId[]) if (!this.broken('irrigation', `pump${loop}`) && this.bays.some(b => b.loop === loop && this.alive(b) && !b.isolated)) want.pumps += GH.loadKw.pump
    for (const b of this.bays) if (this.alive(b) && b.lightsOn) want[b.loop === 'A' ? 'lightsA' : 'lightsB'] += lightingKw(b.ppfd, b.areaM2) * duty * dim
    if (this.busy('process') || this.busy('recycle')) want.processor = GH.loadKw.processor
    for (const l of this.loads) l.wantKw = want[l.id]
    if (this.batteryPct > 10) for (const l of this.loads) l.shed = false
    const runs = (l: Load) => l.on && !l.shed
    const thermal = this.load('thermal'), lightsA = this.load('lightsA'), lightsB = this.load('lightsB')
    const total = () => {
      const heat = (runs(lightsA) ? lightsA.wantKw : 0) + (runs(lightsB) ? lightsB.wantKw : 0)
      thermal.wantKw = this.broken('climate') ? 0 : GH.loadKw.thermalBase + GH.loadKw.thermalPerHeatKw * heat
      return this.loads.reduce((s, l) => s + (runs(l) ? l.wantKw : 0), 0)
    }
    const gen = GH.arrayKw * this.exterior.sunlight * this.exterior.arrayHealth + (this.backupLeft > 0 ? GH.backupKw : 0)
    let load = total()
    if (this.commissioned && this.batteryKwh <= 1e-9 && gen < load) {
      for (let i = this.priority.length - 1; i >= 0 && gen < load; i--) {
        const l = this.load(this.priority[i])
        if (l.essential || !runs(l) || l.wantKw <= 0) continue
        l.shed = true
        load = total()
      }
    }
    for (const l of this.loads) l.kw = runs(l) ? l.wantKw : 0
    this.generationKw = gen
    this.loadKw = load
    if (dt > 0) {
      this.batteryKwh = clamp(this.batteryKwh + ((gen - load) * dt * GH.stationRate) / 3600, 0, GH.batteryKwh)
      this.backupLeft = Math.max(0, this.backupLeft - dt)
    }
    for (const b of this.bays) b.lit = this.alive(b) && b.lightsOn && runs(b.loop === 'A' ? lightsA : lightsB) ? dim : 0
  }

  // ---- water --------------------------------------------------------------------
  private stepWater(dt: number) {
    const drying = !this.broken('humidity') && this.powered('air')
    const back = Math.min(0.99, GH.recovery + (this.purifier ? 0.02 : 0) + (this.tier >= 4 ? 0.02 : 0))
    const pumps = this.powered('pumps')
    let out = 0
    for (const b of this.bays) {
      const p = b.planting, a = this.aux[b.id]
      if (!p) { b.flow = 0; continue }
      const cap = GH.rootL[b.kind]
      b.flow = pumps && !b.isolated && !this.broken('irrigation', `pump${b.loop}`) && !this.broken('irrigation', `line:${b.id}`) && this.tankL > 5 ? 1 : 0
      if (b.flow > 0) {
        const add = Math.min((cap - a.rootL) * (1 - Math.exp(-dt / RATES.fillTau)), this.tankL)
        a.rootL += add
        this.tankL -= add
      }
      if (!b.isolated) {
        const drain = a.rootL * (1 - Math.exp(-dt / RATES.drainTau))
        a.rootL -= drain
        this.tankL += drain
      }
      if (p.stage !== 'dead') {
        const up = Math.min(GH.uptakeLps * canopy(p, a, crop(p.crop)) * (b.areaM2 / GH.areaM2.tier) * b.lit * dt, a.rootL)
        const kept = up * GH.biomassShare, air = up - kept
        a.rootL -= up
        a.plantL += kept
        this.transpiredL += air
        out += air
        const returned = drying ? air * back : 0
        this.tankL += returned
        this.recoveredL += returned
        this.lostL += air - returned
      }
      b.moisture = a.rootL / cap
    }
    this.transpiring = dt > 0 ? out / dt : 0
  }

  // ---- nutrient solution ------------------------------------------------------------
  private stepSolution(dt: number) {
    let cover = 0
    for (const b of this.bays) if (this.alive(b) && !b.isolated) cover += canopy(b.planting!, this.aux[b.id], crop(b.planting!.crop)) * (b.areaM2 / GH.areaM2.tier)
    this.ec = Math.max(0, this.ec - RATES.ecDrift * cover * dt)
    this.ph = Math.min(8, this.ph + RATES.phDrift * cover * dt)
    this.balance = Math.max(0, this.balance - RATES.balanceDrift * cover * dt)
    if (this.tier >= 4) {
      // automatic dosing: holds pH and conductivity, at half the stock a hand dose uses. Balance still needs a fresh mix.
      if (this.ec < GH.ec - 0.02) {
        const add = Math.min(0.05 * dt, GH.ec - this.ec), cost = ((add / RATES.doseEc) * RATES.doseStock) / 2
        if (this.inventory.nutrientStock >= cost) { this.ec += add; this.inventory.nutrientStock -= cost }
      }
      if (Math.abs(this.ph - GH.ph) > 0.02) this.ph += Math.sign(GH.ph - this.ph) * Math.min(0.03 * dt, Math.abs(GH.ph - this.ph))
    }
    this.rootTempC = approach(this.rootTempC, GH.rootTempC + 0.5 * (this.tempC - GH.recipe.tempLitC), dt, 20)
  }

  // ---- air ------------------------------------------------------------------------
  private stepAir(dt: number) {
    const air = this.powered('air')
    const heatKw = this.load('lightsA').kw + this.load('lightsB').kw
    if (!this.broken('climate') && this.powered('thermal')) this.tempC = approach(this.tempC, this.tempTarget(), dt, RATES.thermalTau)
    else this.tempC = approach(this.tempC, RATES.stationTempC + RATES.heatCPerKw * heatKw, dt, RATES.driftTau)
    if (air && !this.broken('humidity')) this.rhPct = approach(this.rhPct, this.recipe.rhPct, dt, RATES.rhTau)
    else if (this.transpiring > 1e-6) this.rhPct = approach(this.rhPct, RATES.rhMax, dt, RATES.rhDriftTau)
    for (const b of this.bays) {
      if (!this.alive(b)) { b.disease = 0; continue }
      if (this.rhPct > RATES.diseaseAboveRh) b.disease = Math.min(1, b.disease + ((this.rhPct - RATES.diseaseAboveRh) / (100 - RATES.diseaseAboveRh)) * RATES.diseaseRate * dt)
      else if (this.rhPct < RATES.healBelowRh) b.disease = Math.max(0, b.disease - RATES.diseaseHeal * dt)
    }
    const litLeaves = this.bays.some(b => b.lit > 0)
    if (air) {
      this.co2Ppm = approach(this.co2Ppm, this.recipe.co2Ppm, dt, RATES.co2Tau)
      this.o2Pct = approach(this.o2Pct, GH.o2Pct, dt, 10)
    } else if (litLeaves) {
      this.co2Ppm = approach(this.co2Ppm, RATES.co2Floor, dt, RATES.co2DriftTau)
      this.o2Pct = Math.min(23.5, this.o2Pct + 0.02 * dt)
    }
    // pressure: the air in the module, the leak, and the regulator feeding from the reserve
    const leak = this.open('leak')
    if (leak && !leak.repaired && !this.compartmentClosed) {
      const loss = RATES.leakKgps * (this.pressureKpa / GH.pressureKpa) * dt
      const fed = Math.min(loss, this.reserveKg)
      this.reserveKg -= fed
      this.pressureKpa = Math.max(0, this.pressureKpa - ((loss - fed) / GH.airKg) * GH.pressureKpa)
      // while the reserve lasts the regulator holds a little under the setpoint: the droop is the first clue
      if (this.reserveKg > 0 && this.pressureKpa > RATES.droopKpa) this.pressureKpa = approach(this.pressureKpa, RATES.droopKpa, dt, 4)
    } else if (this.pressureKpa < GH.pressureKpa && this.reserveKg > 0) {
      const add = Math.min(((GH.pressureKpa - this.pressureKpa) / GH.pressureKpa) * GH.airKg, RATES.refillKgps * dt, this.reserveKg)
      this.reserveKg -= add
      this.pressureKpa += (add / GH.airKg) * GH.pressureKpa
    }
  }

  // ---- plants -----------------------------------------------------------------------
  private stepBays(dt: number) {
    const storm = this.exterior.radiation === 'storm'
    for (const b of this.bays) {
      const p = b.planting
      if (!p || p.stage === 'dead') continue
      const c = crop(p.crop), a = this.aux[b.id], f = p.factors
      f.temperature = temperatureFactor(c, this.tempC)
      f.light = lightFactor(c, dli(b.ppfd * this.growLight(b), this.recipe.photoperiodH))
      f.water = waterFactor(b.moisture)
      f.nutrient = nutrientFactor(c, this.ph, this.ec, this.balance, this.rootTempC, b.contamination)
      f.gas = gasFactor(this.co2Ppm, this.o2Pct, this.pressureKpa)
      let low: FactorId = 'temperature'
      for (const id of FACTOR_IDS) if (f[id] < f[low]) low = id
      p.limiting = f[low] < 0.95 ? low : null
      a.rate = f.temperature * f.light * f.water * f.nutrient * f.gas * (1 - 0.5 * b.disease)
      this.grow(b, p, c, a, (dt / GH.secondsPerCropDay) * a.rate)

      // stress builds while a factor is short, slowly; darkness alone counts for less
      let gain = 0
      let cause: Cause = ''
      for (const id of FACTOR_IDS) {
        const g = (RATES.stressBelow - f[id]) * RATES.stressGain * (id === 'light' ? RATES.darkShare : 1)
        if (g > gain) { gain = g; cause = id }
      }
      const ill = b.disease > 0.3 ? (b.disease - 0.3) * 3 : 0
      if (ill > gain) cause = 'disease'
      gain += ill
      if (storm) { if (gain <= 0) cause = 'radiation'; gain += 0.5 }
      gain *= c.stressRate
      a.gain = gain
      if (gain > 0) { a.cause = cause; p.stress = Math.min(100, p.stress + gain * dt) } else p.stress = Math.max(0, p.stress - RATES.stressEase * dt)
      // health falls only after stress has stayed high, and part of the loss is permanent
      if (p.stress > RATES.harmAbove) {
        const loss = (p.stress - RATES.harmAbove) * RATES.harmRate * dt
        p.health -= loss
        a.damage += loss
      } else if (p.stress < RATES.healBelow) p.health = Math.max(p.health, Math.min(100 - RATES.scarShare * a.damage, p.health + RATES.healRate * dt))
      // the leaves show it late, and only hint at the cause
      if (p.stress > RATES.symptomAbove) a.sick = true
      else if (p.stress < RATES.symptomClear) a.sick = false
      p.symptom = !a.sick ? 'none' : a.cause === 'water' || a.cause === 'temperature' ? 'wilt' : a.cause === 'disease' || (a.cause === 'nutrient' && b.contamination > 0.3) ? 'spots' : 'yellow'
      if (p.health <= 0) this.die(b, p, c, a)
    }
  }

  /** Adds `days` crop days of growth and moves the plant through its stages. */
  private grow(b: Bay, p: Planting, c: Crop, a: Aux, days: number) {
    if (p.stage !== 'ready' && !p.spent && days > 0) {
      p.ageDays += days
      this.o2MadeKg += RATES.o2KgPerM2Day * canopy(p, a, c) * b.areaM2 * days
      if (a.bolting) {
        a.bolt += days
        if (a.bolt >= c.seedDays) p.stage = 'ready'
      } else if (p.stage === 'postharvest') {
        a.regrow += days
        if (a.regrow >= c.harvest.regrowDays) this.ripen(p, c, a, c.harvest.regrowDays)
      } else {
        a.first = Math.min(c.timerDays, a.first + days)
        const x = a.first / c.timerDays, [seed, germ, seedling, veg] = c.phases
        if (x >= 1) this.ripen(p, c, a, c.timerDays)
        else p.stage = x < seed ? 'seed' : x < germ ? 'germination' : x < seedling ? 'seedling' : x < veg ? 'vegetative' : 'reproductive'
      }
    }
    this.refresh(b)
  }
  /** The run-up is over: ready to harvest, or on into bolting when a leaf or root crop is kept for seed. */
  private ripen(p: Planting, c: Crop, a: Aux, counted: number) {
    if (p.forSeed && c.seedDays > 0) { a.bolting = true; a.bolt = 0; a.base = counted; p.stage = 'reproductive' } else p.stage = 'ready'
  }
  /** Progress toward the next harvest, the days left, and whether the flowers are waiting. */
  private refresh(b: Bay) {
    const p = b.planting
    if (!p || p.stage === 'dead') return
    const c = crop(p.crop), a = this.aux[b.id]
    const extra = p.forSeed && c.seedDays > 0 ? c.seedDays : 0
    let done = 0, span = 0
    if (p.stage === 'ready') done = span = 1
    else if (p.spent) span = 0
    else if (a.bolting) { done = a.base + a.bolt; span = a.base + c.seedDays }
    else if (p.stage === 'postharvest') { done = a.regrow; span = c.harvest.regrowDays + extra }
    else { done = a.first; span = c.timerDays + extra }
    p.progress = span > 0 ? clamp(done / span, 0, 1) : 0
    p.daysLeft = p.stage === 'ready' || p.spent ? 0 : Math.max(0, span - done)
    p.needsPollination = needsHelp(c) && !p.pollinated && !p.spent && !a.bolting && (p.stage === 'reproductive' || p.stage === 'postharvest')
  }
  private die(b: Bay, p: Planting, c: Crop, a: Aux) {
    p.health = 0
    p.stage = 'dead'
    p.symptom = 'none'
    p.limiting = null
    p.needsPollination = false
    p.progress = p.daysLeft = 0
    this.plantsLost++
    for (const f of this.faults) if (!f.fixed && this.blames(f, b, a.cause)) f.damaged = true
    const why = this.causeWord(b, c, a.cause)
    this.note(`Bay ${b.id}: the ${lower(c)} died of ${why}.`, 'crop')
    this.alerts = this.alerts.filter(x => !(x.kind === 'crop' && x.bay === b.id))
    this.raise('crop', { title: `Bay ${b.id} ${lower(c)} lost`, problem: `The ${lower(c)} in bay ${b.id} died of ${why}.`, trend: 'A dead plant does not come back when the system is repaired.', action: 'Clear the bay before replanting.', bay: b.id }, 'damage')
  }
  private causeWord(b: Bay, c: Crop, cause: Cause) {
    switch (cause) {
      case 'temperature': return this.tempC > c.tempC[1] ? 'heat stress' : 'cold stress'
      case 'light': return 'lack of light'
      case 'water': return 'water stress'
      case 'nutrient': return b.contamination > 0.3 ? 'root contamination' : 'a nutrient problem'
      case 'gas': return 'bad air'
      case 'disease': return 'leaf disease'
      case 'radiation': return 'radiation stress'
      default: return 'stress'
    }
  }

  // ---- jobs -------------------------------------------------------------------------
  private stepJobs(dt: number) {
    for (const j of [...this.jobs]) {
      if ((j.kind === 'process' || j.kind === 'recycle') && !this.powered('processor')) continue
      j.left = Math.max(0, j.left - dt)
      if (j.kind === 'process' && this.batch.crop) {
        const steps = crop(this.batch.crop).processing, i = Math.min(steps.length - 1, Math.floor(((j.total - j.left) / j.total) * steps.length))
        j.label = `${crop(this.batch.crop).name}: ${steps[i]} (step ${i + 1} of ${steps.length})`
      }
      if (j.left > 0) continue
      this.jobs = this.jobs.filter(x => x !== j)
      this.finish(j)
    }
  }
  private finish(j: Job) {
    const inv = this.inventory
    switch (j.kind) {
      case 'diagnose': {
        const al = this.alerts.find(x => x.id === Number(j.target))
        if (!al) return
        const f = this.faults.find(x => x.alertId === al.id)
        if (f?.kind === 'leak') f.located = true
        al.diagnosed = true
        al.cause = f ? this.causeOf(f) : al.kind === 'crop' && al.bay ? this.explainCrop(this.bay(al.bay)) : al.kind === 'battery' ? this.explainBattery() : this.explainWater()
        this.note(`Diagnosis, ${al.title}: ${al.cause}`, 'alert')
        if (f) this.retextFault(f, al)
        return
      }
      case 'repair': {
        const what = j.target as RepairId
        const f = what === 'pumpA' || what === 'pumpB' ? this.open('irrigation', what) : what === 'thermal' ? this.open('climate') : what === 'dehumidifier' ? this.open('humidity') : what === 'seal' ? this.open('leak') : this.open('arrayString')
        if (!f) return
        if (f.kind === 'leak') { f.repaired = true; this.note('Seal repaired.', 'system') } else this.fix(f)
        return
      }
      case 'clearLine': { const f = this.open('irrigation', `line:${j.target}`); if (f) this.fix(f); return }
      case 'treat': this.bay(j.target as BayId).contamination = 0; this.note(`Bay ${j.target}: root zone treated.`, 'system'); return
      case 'mix': this.ec = GH.ec; this.ph = GH.ph; this.balance = 1; this.note('Fresh nutrient batch mixed: pH, conductivity and balance on target.', 'system'); return
      case 'flush': {
        const out = Math.min(RATES.flushL, this.tankL)
        this.tankL -= out / 2
        this.lostL += out / 2
        this.ec += (1 - this.ec) * 0.6
        for (const b of this.bays) if (!b.isolated) b.contamination /= 2
        this.note(`Loop flushed: ${Math.round(out)} L out, half of it recovered. Conductivity ${r1(this.ec)} mS/cm.`, 'system')
        return
      }
      case 'labTest': {
        const bal = this.open('nutrient')
        const short = bal?.variant === 'balance' ? bal.short : 'Nitrogen'
        const note = this.balance >= 0.85 ? 'Balanced.' : this.balance >= 0.6 ? `${short} is running low. A fresh mix will be needed soon.` : `${short} low: the solution is out of balance. Mix a fresh batch.`
        this.labTest = { at: r1(this.t), balance: r2(this.balance), note }
        this.note(`Lab test: nutrient balance ${Math.round(this.balance * 100)} %. ${note}`, 'system')
        if (bal?.variant === 'balance') { const al = this.alerts.find(x => x.id === bal.alertId); if (al) { al.diagnosed = true; al.cause = this.causeOf(bal) } }
        return
      }
      case 'makeup': {
        const add = Math.min(GH.makeupL, GH.tankCapacityL - this.tankL)
        this.tankL += add
        this.makeupL += add
        this.note(`Makeup water: +${Math.round(add)} L from the station.`, 'system')
        return
      }
      case 'process': {
        const c = crop(j.target as CropId)
        this.store(c, this.batch.kg)
        this.staplesProcessed++
        this.note(`${r1(this.batch.kg)} kg of ${lower(c)} processed into food: ${c.processing.join(', ')}.`, 'food')
        this.batch = { crop: '', kg: 0, residueKg: 0 }
        return
      }
      case 'recycle': {
        const stock = this.batch.residueKg * 0.25
        inv.nutrientStock = r2(inv.nutrientStock + stock)
        this.note(`${r1(this.batch.residueKg)} kg of residue recycled into ${r2(stock)} units of nutrient stock. The rest is lost.`, 'system')
        this.batch = { crop: '', kg: 0, residueKg: 0 }
        return
      }
      case 'resupply': {
        const c = crop(j.target as CropId)
        inv.seeds[c.id] += RATES.resupplyPackets
        inv.nutrientStock = r2(inv.nutrientStock + 1)
        inv.sanitizer += 1
        this.note(`Cargo run arrived: +${plural(RATES.resupplyPackets, 'packet')} of ${lower(c)} seed, one unit of nutrient stock, one dose of sanitiser.`, 'system')
        return
      }
    }
  }

  // ---- failures -----------------------------------------------------------------------
  private startFault(kind: FaultKind, target?: string, variant?: string): string | null {
    if (this.faults.some(f => f.kind === kind)) return 'That failure is already in progress.'
    const live = this.bays.filter(b => this.alive(b))
    const f: Fault = { kind, target: '', variant: '', alertId: 0, since: this.t, fixed: false, fixedAt: 0, damaged: false, until: 0, located: false, repaired: false, place: '', nextSpread: 0, dose0: this.doseMsv, short: '', bays: [] }
    switch (kind) {
      case 'arrayFeather': f.target = 'array'; f.until = this.t + RATES.featherSeconds; break
      case 'arrayString': f.target = 'array'; break
      case 'irrigation': {
        if (target === 'A' || target === 'B') f.target = `pump${target}`
        else if (target) f.target = `line:${target}`
        else {
          if (!live.length) return 'No crop is planted.'
          const b = this.pick(live)
          f.target = this.rand() < 0.5 ? `pump${b.loop}` : `line:${b.id}`
        }
        break
      }
      case 'climate': f.target = 'thermal'; break
      case 'humidity': f.target = 'dehumidifier'; break
      case 'nutrient': {
        f.target = 'solution'
        f.variant = variant === 'doser' || variant === 'ph' || variant === 'balance' ? variant : this.pick(['doser', 'ph', 'balance'])
        f.short = this.pick(NUTRIENTS)
        if (f.variant === 'doser') this.ec = Math.max(this.ec, 2.9)
        else if (f.variant === 'ph') this.ph = Math.min(this.ph, 4.9)
        else this.balance = Math.min(this.balance, 0.35)
        break
      }
      case 'leak': f.target = 'seal'; f.place = this.pick(LEAK_PLACES); break
      case 'contamination': {
        const b = target && target.length === 2 ? this.bay(target as BayId) : live.length ? this.pick(live) : undefined
        if (!b || !this.alive(b)) return 'Contamination needs a planted bay to start in.'
        f.target = b.id
        b.contamination = Math.max(b.contamination, 0.1)
        f.nextSpread = this.t + RATES.spreadSeconds
        break
      }
      case 'radiation': f.target = 'sun'; f.variant = 'watch'; f.until = this.t + RATES.watchSeconds; break
    }
    this.faults.push(f)
    this.lastFault = kind
    this.updateExterior({ orbitPhase: this.lastPhase < 0 ? undefined : this.lastPhase })
    const al = this.raise(kind, this.describe(f), 'warning')
    f.alertId = al.id
    return null
  }
  private fix(f: Fault) {
    if (f.fixed) return
    f.fixed = true
    f.fixedAt = this.t
    const al = this.alerts.find(x => x.id === f.alertId)
    if (al) { al.level = 'recovery'; this.note(`${al.title}: ${f.kind === 'arrayFeather' ? 'the array is tracking the Sun again' : f.kind === 'radiation' ? 'the particle event has passed' : 'fixed'}.`, 'alert') }
  }

  private stepFaults(dt: number, input: TickInput) {
    for (const f of [...this.faults]) {
      if (f.fixed) continue
      switch (f.kind) {
        case 'arrayFeather':
          if (this.t >= f.until) {
            this.fix(f)
            // sometimes a string does not reconnect: the output stays low until someone resets it
            if (this.rand() < RATES.stringChance) this.startFault('arrayString')
          }
          break
        case 'radiation':
          if (f.variant === 'watch') {
            if (this.t >= f.until) { f.variant = 'storm'; f.until = this.t + RATES.stormSeconds; this.note('Solar particle event under way: radiation is high in the module.', 'alert') }
          } else {
            if (input.crewInside) this.doseMsv += RATES.doseMsvPerS * dt
            if (this.doseMsv - f.dose0 >= RATES.doseLimitMsv) f.damaged = true
            if (this.t >= f.until) this.fix(f)
          }
          break
        case 'contamination': {
          for (const b of this.bays) {
            if (b.contamination <= 0) continue
            // it grows on living roots and dies back in an empty bay
            b.contamination = this.alive(b) ? Math.min(1, b.contamination + RATES.contaminationRate * dt) : Math.max(0, b.contamination - 0.02 * dt)
          }
          if (this.t >= f.nextSpread) {
            f.nextSpread = this.t + RATES.spreadSeconds
            const loops = this.bays.filter(b => b.contamination > 0.3 && !b.isolated).map(b => b.loop)
            const targets = this.bays.filter(b => loops.includes(b.loop) && b.contamination <= 0 && !b.isolated && this.alive(b))
            if (targets.length) this.pick(targets).contamination = 0.06
          }
          if (this.bays.every(b => b.contamination <= 0.05)) { for (const b of this.bays) b.contamination = 0; this.fix(f) }
          break
        }
        case 'nutrient':
          if (f.variant === 'doser' ? this.ec <= 2.2 : f.variant === 'ph' ? this.ph >= GH.phBand[0] - 1e-9 && this.ph <= GH.phBand[1] + 1e-9 : this.balance >= 0.8) this.fix(f)
          break
        case 'leak':
          if (f.repaired && !this.compartmentClosed) this.fix(f)
          break
      }
    }
    this.updateExterior({ orbitPhase: this.lastPhase })

    // the schedule of new failures
    if (!this.eventsOn) return
    if (input.quiet) { this.nextFaultAt = Math.max(this.nextFaultAt, this.t + 20); return }
    if (this.faults.filter(f => !f.fixed).length >= 2) { this.nextFaultAt = Math.max(this.nextFaultAt, this.t + 15); return }
    if (this.t < this.nextFaultAt) return
    if (!this.bays.some(b => this.alive(b))) { this.nextFaultAt = this.t + 15; return }
    const pool: FaultKind[] = ['irrigation', 'humidity', 'nutrient', 'arrayFeather']
    if (this.tier >= 2) pool.push('climate', 'contamination', 'leak', 'radiation')
    const active = this.faults.map(f => f.kind)
    const choices = pool.filter(k => k !== this.lastFault && !active.includes(k) && !(k === 'arrayFeather' && active.includes('arrayString')))
    if (choices.length) this.startFault(this.pick(choices))
    this.nextFaultAt = this.t + this.between(RATES.faultGap)
  }

  /** The living plantings a failure reaches. */
  private affected(f: Fault): Bay[] {
    const live = this.bays.filter(b => this.alive(b))
    switch (f.kind) {
      case 'irrigation': return f.target.startsWith('line:') ? live.filter(b => b.id === f.target.slice(5)) : live.filter(b => b.loop === f.target.slice(4) && !b.isolated)
      case 'nutrient': return live.filter(b => !b.isolated)
      case 'contamination': return live.filter(b => b.contamination > 0.05)
      default: return live
    }
  }
  /** True when this failure explains that kind of stress on that bay. */
  private blames(f: Fault, b: Bay, cause: Cause): boolean {
    switch (f.kind) {
      case 'arrayFeather':
      case 'arrayString':
        return (cause === 'light' && b.lit < 1) || (cause === 'water' && !this.powered('pumps')) || (cause === 'temperature' && !this.powered('thermal')) || ((cause === 'gas' || cause === 'disease') && !this.powered('air'))
      case 'irrigation': return cause === 'water' && (f.target.startsWith('line:') ? b.id === f.target.slice(5) : b.loop === f.target.slice(4) && !b.isolated)
      case 'climate': return cause === 'temperature'
      case 'humidity': return cause === 'disease'
      case 'nutrient': return cause === 'nutrient' && !b.isolated
      case 'contamination': return cause === 'nutrient' && (b.contamination > 0.05 || f.bays.includes(b.id))
      case 'leak': return cause === 'gas' && this.pressureKpa < 70
      case 'radiation': return cause === 'radiation'
    }
  }
  /** Warning until it cuts growth, degraded until it costs health, damage from then on, recovery once fixed. */
  private levelOf(f: Fault): AlertLevel {
    if (f.fixed) return 'recovery'
    const hit = this.affected(f)
    for (const b of hit) if (!f.bays.includes(b.id)) f.bays.push(b.id)
    if (hit.some(b => b.planting!.stress > RATES.harmAbove && this.blames(f, b, this.aux[b.id].cause))) f.damaged = true
    if (f.damaged) return 'damage'
    let cutting = false
    switch (f.kind) {
      case 'arrayFeather':
      case 'arrayString': cutting = this.loads.some(l => l.shed) || hit.some(b => b.lit < 1); break
      case 'irrigation': cutting = hit.some(b => b.planting!.factors.water < 0.95); break
      case 'climate': cutting = Math.abs(this.tempC - this.tempTarget()) > 1.5 && hit.some(b => b.planting!.factors.temperature < 0.85); break
      case 'humidity': cutting = this.rhPct > RATES.diseaseAboveRh || hit.some(b => b.disease > 0.05); break
      case 'nutrient':
      case 'contamination': cutting = hit.some(b => b.planting!.factors.nutrient < 0.95); break
      case 'leak': cutting = this.reserveKg <= 0 || this.pressureKpa < 95; break
      case 'radiation': cutting = f.variant === 'storm'; break
    }
    return cutting ? 'degraded' : 'warning'
  }
  /** Recovery is over when the plants it touched have calmed down, or something else is now troubling them. */
  private recovered(f: Fault): boolean {
    if (f.kind === 'radiation') return true
    if (this.t - f.fixedAt > RATES.recoveryLimit) return true
    if (f.kind === 'climate' && Math.abs(this.tempC - this.tempTarget()) > 2) return false
    if (f.kind === 'humidity' && this.rhPct > 72) return false
    return f.bays.every(id => {
      const b = this.bay(id), a = this.aux[id]
      return !this.alive(b) || b.planting!.stress < RATES.healBelow || (a.gain > 0 && !this.blames(f, b, a.cause))
    })
  }

  // ---- alerts ---------------------------------------------------------------------------
  private raise(kind: Alert['kind'], text: Pick<Alert, 'title' | 'problem' | 'trend' | 'action' | 'bay'>, level: AlertLevel): Alert {
    const al: Alert = { id: ++this.ids, kind, level, ...text, cause: null, diagnosed: false, acknowledged: false, since: r1(this.t) }
    this.alerts.push(al)
    this.note(`${al.problem} ${al.action}`, 'alert')
    return al
  }
  private stepAlerts() {
    // failures: move each through its stages, and let go of the ones that have recovered
    for (const f of [...this.faults]) {
      const al = this.alerts.find(x => x.id === f.alertId)
      const level = this.levelOf(f)
      if (al) al.level = level
      if (f.fixed && this.recovered(f)) {
        this.pastFaults.push({ kind: f.kind, damaged: f.damaged })
        this.faults = this.faults.filter(x => x !== f)
        this.alerts = this.alerts.filter(x => x.id !== f.alertId)
        if (al && f.kind !== 'radiation') this.note(`${al.title}: back to normal.`, 'alert')
      }
    }
    // crops in trouble that no failure explains (a wrong setpoint, a switched-off light, an empty tank)
    for (const b of this.bays) {
      const p = b.planting
      if (!p || p.stage === 'dead') continue
      const a = this.aux[b.id], cur = this.alerts.find(x => x.kind === 'crop' && x.bay === b.id)
      const owned = this.faults.some(f => this.blames(f, b, a.cause))
      if (!cur) {
        // one alert speaks for every bay with the same trouble
        const spoken = this.alerts.some(x => x.kind === 'crop' && x.factor !== undefined && x.factor === a.cause)
        if (p.stress > 50 && a.gain > 0 && a.cause && !owned && !spoken) this.raise('crop', this.describeCrop(b), p.stress > RATES.harmAbove ? 'damage' : 'degraded').factor = a.cause
      } else if (p.stress < RATES.healBelow || owned) this.alerts = this.alerts.filter(x => x !== cur)
      else cur.level = p.stress > RATES.harmAbove ? 'damage' : a.gain > 0 ? 'degraded' : 'recovery'
    }
    // battery and tank
    const shed = this.loads.some(l => l.shed)
    const bat = this.alerts.find(x => x.kind === 'battery')
    if (!bat) { if (this.batteryPct < 20) this.raise('battery', this.describeBattery(), shed ? 'degraded' : 'warning') }
    else if (this.batteryPct >= 25 && !shed) this.alerts = this.alerts.filter(x => x !== bat)
    else bat.level = shed ? 'degraded' : 'warning'
    const tank = this.alerts.find(x => x.kind === 'water')
    if (!tank) { if (this.tankL < 60) this.raise('water', this.describeWater(), this.tankL <= 5 ? 'degraded' : 'warning') }
    else if (this.tankL >= 70) this.alerts = this.alerts.filter(x => x !== tank)
    else tank.level = this.tankL <= 5 ? 'degraded' : 'warning'
  }
  /** Rewrites what each alert says from the readings as they are now. */
  private retext() {
    for (const al of this.alerts) {
      const f = this.faults.find(x => x.alertId === al.id)
      if (f) this.retextFault(f, al)
      else if (al.kind === 'battery') Object.assign(al, this.describeBattery())
      else if (al.kind === 'water') Object.assign(al, this.describeWater())
      else if (al.kind === 'crop' && al.bay && this.alive(this.bay(al.bay))) Object.assign(al, this.describeCrop(this.bay(al.bay)))
    }
  }
  private retextFault(f: Fault, al: Alert) {
    Object.assign(al, this.describe(f))
    if (f.fixed) al.action = 'Fixed. Watch the crops recover: a repair does not undo the harm already done.'
  }

  private describe(f: Fault): Pick<Alert, 'title' | 'problem' | 'trend' | 'action' | 'bay'> {
    const bat = `battery ${Math.round(this.batteryPct)} % and ${this.dir('battery', 1)}`
    const hit = this.affected(f)
    switch (f.kind) {
      case 'arrayFeather': return {
        title: 'Array feathered', bay: null,
        problem: 'The solar array is turned edge-on for a visiting vehicle. Output is a quarter of normal.',
        trend: f.fixed ? `Tracking again; ${bat}` : `Tracking again in ${Math.ceil(Math.max(0, f.until - this.t))} s; ${bat}`,
        action: 'Switch off optional loads and keep controls and air running, or tie in the station bus.',
      }
      case 'arrayString': return {
        title: 'Array output low', bay: null,
        problem: `Array output stays low although the array is tracking: ${Math.round(RATES.stringHealth * 100)} % of expected in full sun.`,
        trend: `Generation ${r1(this.generationKw)} kW, load ${r1(this.loadKw)} kW; ${bat}`,
        action: 'Inspect the array and reset the string.',
      }
      case 'irrigation': {
        const line = f.target.startsWith('line:'), where = line ? `Bay ${f.target.slice(5)}` : `Loop ${f.target.slice(4)}`
        const driest = hit.reduce<Bay | null>((d, b) => (!d || b.moisture < d.moisture ? b : d), null)
        const moving = driest ? (driest.moisture - this.aux[driest.id].was > 0.003 ? 'rising' : driest.moisture - this.aux[driest.id].was < -0.003 ? 'falling' : 'steady') : ''
        return {
          title: `${where} irrigation`, bay: line ? (f.target.slice(5) as BayId) : null,
          problem: `${where} irrigation flow low${line ? '' : ` (bays ${f.target.slice(4)}1 to ${f.target.slice(4)}4)`}. Reservoir is ${this.tankL >= 60 ? 'adequate' : 'low'}.`,
          trend: driest ? `Root-zone water ${Math.round(driest.moisture * 100)} % and ${moving}${line ? '' : ` in bay ${driest.id}`}` : line ? 'No living crop in this bay' : 'No living crop on this loop',
          action: 'Inspect pump or blocked line.',
        }
      }
      case 'climate': return {
        title: 'Climate control', bay: null,
        problem: `Air temperature is leaving its ${r1(this.tempTarget())} °C setpoint. The thermal unit is not holding it.`,
        trend: `Air ${r1(this.tempC)} °C and ${this.dir('temp', 0.5)}`,
        action: 'Repair the thermal unit. Until then, dim or switch off lights to cut the heat.',
      }
      case 'humidity': {
        const worst = Math.max(0, ...hit.map(b => b.disease))
        return {
          title: 'High humidity', bay: null,
          problem: `Humidity is climbing past its ${this.recipe.rhPct} % setpoint. Wet leaves and condensation raise the disease risk.`,
          trend: `Humidity ${Math.round(this.rhPct)} % and ${this.dir('rh', 1)}${worst > 0.05 ? `; leaf disease up to ${Math.round(worst * 100)} %` : ''}`,
          action: 'Restore dehumidification and airflow.',
        }
      }
      case 'nutrient': {
        const growth = hit.length ? Math.round((hit.reduce((s, b) => s + b.planting!.factors.nutrient, 0) / hit.length) * 100) : 100
        const reads = `pH ${r1(this.ph)}, conductivity ${r1(this.ec)} mS/cm`
        if (f.variant === 'doser') return { title: 'Nutrient solution', bay: null, problem: `Conductivity is high at ${r1(this.ec)} mS/cm: salts are building up in the solution.`, trend: `${reads}; uptake ${growth} % of normal`, action: 'Inspect pH, conductivity and nutrient balance. Flush to dilute.' }
        if (f.variant === 'ph') return { title: 'Nutrient solution', bay: null, problem: `Nutrient pH has fallen to ${r1(this.ph)}. Roots take nutrients up poorly outside ${GH.phBand[0]} to ${GH.phBand[1]}.`, trend: `${reads}; uptake ${growth} % of normal`, action: 'Inspect pH, conductivity and nutrient balance. Dose pH up.' }
        return { title: 'Nutrient solution', bay: null, problem: 'Growth is slow and leaves are paling, though pH and conductivity read normal.', trend: `${reads}; uptake ${growth} % of normal`, action: 'Send a sample to the lab: conductivity cannot show which nutrient is short.' }
      }
      case 'leak': return {
        title: 'Pressure leak', bay: null,
        problem: this.reserveKg > 0 ? 'The module is losing air. The regulator is holding pressure from the reserve tanks.' : 'The module is losing air, the reserve is empty and the pressure is falling.',
        trend: `Pressure ${r1(this.pressureKpa)} kPa; reserve ${r1(this.reserveKg)} kg and ${this.dir('reserve', 0.5)}`,
        action: !f.located ? 'Locate the leak.' : f.repaired ? 'Seal repaired: open the compartment.' : this.compartmentClosed ? 'Compartment closed: repair the seal, then open it again.' : 'Close the compartment, then repair the seal.',
      }
      case 'contamination': {
        const sick = this.bays.filter(b => b.contamination > 0.05), worst = Math.max(0, ...sick.map(b => b.contamination))
        return {
          title: 'Root contamination', bay: f.target as BayId,
          problem: `Root-zone contamination on loop ${f.target[0]}, first seen in bay ${f.target}.`,
          trend: `${plural(sick.length, 'bay')} affected${sick.length ? ` (${sick.map(b => b.id).join(', ')})` : ''}; worst ${Math.round(worst * 100)} %`,
          action: 'Isolate the affected bays and treat them before it spreads through the loop.',
        }
      }
      case 'radiation': return f.variant === 'watch'
        ? { title: 'Solar particle event', bay: null, problem: 'Space weather warning: a solar particle event is on its way.', trend: `Radiation rises in ${Math.ceil(Math.max(0, f.until - this.t))} s`, action: 'Leave the module and work from a shielded node until it passes.' }
        : { title: 'Solar particle event', bay: null, problem: 'A solar particle event is under way. Radiation is high inside the thin-walled module.', trend: `About ${Math.ceil(Math.max(0, f.until - this.t))} s left; crew dose in the module ${r2(this.doseMsv - f.dose0)} mSv`, action: 'Leave the module and work from a shielded node until it passes.' }
    }
  }
  private causeOf(f: Fault): string {
    switch (f.kind) {
      case 'arrayFeather': return 'Station flight rule: the arrays turn edge-on while a vehicle approaches, so its thrusters cannot load them. It ends by itself.'
      case 'arrayString': return 'One array string did not reconnect after the array resumed tracking. Reset the string.'
      case 'irrigation': return f.target.startsWith('line:') ? `The supply line to bay ${f.target.slice(5)} is blocked. Clear the line.` : `Pump ${f.target.slice(4)} has stopped: its impeller is seized. Repair the pump.`
      case 'climate': return 'The thermal unit\'s coolant pump has tripped. Repair the unit.'
      case 'humidity': return 'The dehumidifier\'s condensing heat exchanger has iced over. Repair the dehumidifier.'
      case 'nutrient': return f.variant === 'doser' ? 'The dosing pump stuck open and overfed the tank. Flush the loop to dilute it.' : f.variant === 'ph' ? 'An acid dose overshot. Dose pH up until it is back in band.' : `${f.short} is used up: the solution is out of balance, which conductivity cannot show. Mix a fresh batch.`
      case 'leak': return `Leak located at ${f.place}. Close the compartment, then repair the seal.`
      case 'contamination': return 'A biofilm is growing on the roots and travels with the shared solution. Isolate the affected bays, then treat them with sanitiser.'
      case 'radiation': return 'Energetic protons from a solar eruption. The nodes of the main station are better shielded than this module.'
    }
  }

  private describeCrop(b: Bay): Pick<Alert, 'title' | 'problem' | 'trend' | 'action' | 'bay'> {
    const p = b.planting!, c = crop(p.crop), a = this.aux[b.id], who = `Bay ${b.id} ${lower(c)}`
    const trend = `Stress ${Math.round(p.stress)} % and ${a.gain > 0 ? 'rising' : 'easing'}; health ${Math.round(p.health)} %`
    const also = this.bays.filter(o => o !== b && this.alive(o) && this.aux[o.id].cause === a.cause && this.aux[o.id].gain > 0 && o.planting!.stress > 30).map(o => o.id)
    const text = (problem: string, action: string) => ({ title: who, bay: b.id, problem: also.length ? `${problem} The same shows in ${plural(also.length, 'other bay')} (${also.join(', ')}).` : problem, trend, action })
    switch (a.cause) {
      case 'temperature': return text(`${who} is ${this.tempC > c.tempC[1] ? 'too hot' : 'too cold'}: air ${r1(this.tempC)} °C, its band is ${c.tempC[0]} to ${c.tempC[1]} °C.`, 'Check the air temperature setpoint and the thermal unit.')
      case 'light': return text(`${who} is short of light: ${r1(this.dliOf(b.id))} mol/m²/day, it wants ${r1(dliBand(c)[0])} to ${r1(dliBand(c)[1])}.`, 'Raise the bay\'s light or the photoperiod, or give the lights their power back.')
      case 'water': return text(`${who} is drying out: root-zone water ${Math.round(b.moisture * 100)} %.`, 'Check the isolation valve, the loop pump and the tank level.')
      case 'nutrient': return text(`${who} is taking up nutrients poorly: pH ${r1(this.ph)}, conductivity ${r1(this.ec)} mS/cm.`, 'Inspect pH, conductivity and nutrient balance.')
      case 'gas': return text(`${who} is short of air to grow on: CO2 ${Math.round(this.co2Ppm)} ppm, pressure ${r1(this.pressureKpa)} kPa.`, 'Check the air loop, the CO2 setpoint and the pressure.')
      case 'disease': return text(`${who} shows leaf disease after humid air.`, 'Hold humidity under 70 % and keep the air moving.')
      default: return text(`${who} is under stress.`, 'Inspect the bay.')
    }
  }
  private explainCrop(b: Bay): string {
    if (!this.alive(b)) return 'The plant is gone.'
    const p = b.planting!, f = p.factors
    const share = (id: FactorId) => `${id} ${Math.round(f[id] * 100)} %`
    return `Growth factors now: ${FACTOR_IDS.map(share).join(', ')}${b.disease > 0.05 ? `, leaf disease ${Math.round(b.disease * 100)} %` : ''}. Growth is their product, so the lowest one is what to fix first.`
  }
  private describeBattery(): Pick<Alert, 'title' | 'problem' | 'trend' | 'action' | 'bay'> {
    const hours = this.enduranceH, shed = this.loads.filter(l => l.shed).map(l => l.name.toLowerCase())
    return {
      title: 'Battery low', bay: null,
      problem: `Battery at ${Math.round(this.batteryPct)} %. Generation ${r1(this.generationKw)} kW, load ${r1(this.loadKw)} kW.${shed.length ? ` Shed: ${shed.join('; ')}.` : ''}`,
      trend: hours === null ? 'Charging' : `Falling; about ${r1(hours)} station hours left at this draw`,
      action: 'Switch off optional loads or tie in the station bus. Controls and air come first.',
    }
  }
  private explainBattery(): string {
    const e = this.exterior
    return `${e.sunlit ? 'The station is in sunlight' : `The station is in eclipse for another ${Math.ceil(e.nextChange)} s`}, the array is ${e.arrayState} at ${Math.round(e.arrayHealth * 100)} % of its output, and the loads draw ${r1(this.loadKw)} kW. Energy is power times time: ${r1(this.batteryKwh)} kWh is left.`
  }
  private describeWater(): Pick<Alert, 'title' | 'problem' | 'trend' | 'action' | 'bay'> {
    return {
      title: 'Clean water low', bay: null,
      problem: `Clean water is down to ${Math.round(this.tankL)} L.${this.tankL <= 5 ? ' Irrigation has stopped.' : ''}`,
      trend: `Tank ${this.dir('tank', 2)}; ${Math.round(this.recoveryPct)} % of transpired water recovered so far`,
      action: 'Ask the station for makeup water, and check dehumidification: it returns the water the leaves give off.',
    }
  }
  private explainWater(): string {
    const w = this.waterBudget()
    return `Of the water the module started with, ${Math.round(w.lost)} L was lost (unrecovered humidity and flushes) and ${Math.round(w.harvested)} L left inside harvested plants. ${Math.round(w.roots)} L is in the root zones. Water that circulates is not used up; water that leaves the loop is.`
  }
}

export type { CropId, ProcessStep, Stage }
