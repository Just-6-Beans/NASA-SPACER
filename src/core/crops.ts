// Crop catalogue for the station greenhouse. Plain data, no DOM and no Phaser.
//
// WHERE THE NUMBERS COME FROM. The crop list follows NASA's own plant research: lettuces, mustard
// greens, kale, radishes, tomatoes and chile peppers have been grown in space, and wheat,
// soybeans and potatoes have been studied in controlled chambers on the ground. Everything
// numeric below (heights, temperature and light bands, timers, yields, food values, stress
// rates) is OUR GAME MODEL: simplified, cultivar-dependent values for an Earth-like controlled
// interior. None of it is a NASA measurement or a verified yield. Keep it editable.

export type CropId = 'lettuce' | 'mizuna' | 'kale' | 'radish' | 'tomato' | 'pepper' | 'potato' | 'wheat' | 'soybean'

/** The eight visual and rule states of a planting, in order of a normal life. */
export type Stage = 'seed' | 'germination' | 'seedling' | 'vegetative' | 'reproductive' | 'ready' | 'postharvest' | 'dead'
export const STAGES: Stage[] = ['seed', 'germination', 'seedling', 'vegetative', 'reproductive', 'ready', 'postharvest', 'dead']

/** What a bay is built for: two shelves of low crops, or one tall shelf with a trellis and a root chamber. */
export type BayKind = 'tier' | 'tall'
/** REAL: 'space' crops have been grown in orbit; 'ground' crops were studied in controlled chambers on Earth. */
export type Evidence = 'space' | 'ground'
export type Pollination = 'none' | 'vibrate' | 'assist' | 'self'
export type ProcessStep = 'cook' | 'thresh' | 'mill' | 'shell'

export interface Crop {
  id: CropId
  name: string
  /** What the plant looks like, for the inspection panel. */
  look: string
  /** What it is for and how it is handled. */
  role: string
  bay: BayKind
  evidence: Evidence
  /** Which unlock level offers the seed (1 seedling experiment, 2 fresh greens, 3 staples). */
  tier: 1 | 2 | 3
  /** MODEL: mature height range in metres. */
  heightM: [number, number]
  /** MODEL: air temperature band in °C. */
  tempC: [number, number]
  /** MODEL: light band at the canopy in µmol/m²/s, for a 16-hour photoperiod. */
  ppfd: [number, number]
  /** MODEL: nutrient conductivity band in mS/cm. */
  ec: [number, number]
  /** MODEL: crop days from sowing to the first harvest in good conditions. Played as a cooldown. */
  timerDays: number
  /**
   * MODEL: where each stage ends, as a fraction of timerDays: [seed, germination, seedling, vegetative].
   * A vegetative end of 1 means the crop is harvested as leaves or roots and never flowers on the way.
   */
  phases: [number, number, number, number]
  /** How flowers are set. 'vibrate' and 'assist' are a task for the crew; 'self' needs no help. */
  pollination: Pollination
  /** MODEL: share of the fruit that sets if the crew never helps the flowers. */
  unaidedSet: number
  /**
   * Harvest. 'cut' takes leaves and the plant regrows, 'pick' takes ripe fruit and the next flush
   * ripens, 'whole' takes the plant. `share` is the part of a full yield one cut or pick gives,
   * `regrowDays` the wait for the next, `max` how many times before the plant is spent.
   */
  harvest: { kind: 'cut' | 'pick' | 'whole'; share: number; regrowDays: number; max: number; wholeToo: boolean }
  /** Steps before the harvest counts as food. Empty for crops eaten fresh. */
  processing: ProcessStep[]
  /** MODEL: extra crop days a leaf or root crop needs to bolt and set seed when the bay is kept for seed. */
  seedDays: number
  /** MODEL: edible kilograms per square metre from one full harvest of a healthy bay. */
  yieldKgM2: number
  /** MODEL: approximate food values per kilogram of the edible, processed harvest. */
  kcalPerKg: number
  proteinGPerKg: number
  /** Counts toward fresh-food variety rather than toward calories. */
  fresh: boolean
  /** MODEL: how fast stress builds, 1 is typical. Lower is hardier. */
  stressRate: number
}

const leaf = (share: number, regrowDays: number, max: number) => ({ kind: 'cut' as const, share, regrowDays, max, wholeToo: true })
const pick = (share: number, regrowDays: number, max: number) => ({ kind: 'pick' as const, share, regrowDays, max, wholeToo: false })
const whole = { kind: 'whole' as const, share: 1, regrowDays: 0, max: 1, wholeToo: false }

export const CROPS: Crop[] = [
  {
    id: 'lettuce', name: 'Lettuce', bay: 'tier', evidence: 'space', tier: 1,
    look: 'Broad overlapping rosette, green or burgundy.', role: 'Early fresh food. Cut the outer leaves, or take the whole head.',
    heightM: [0.15, 0.30], tempC: [18, 24], ppfd: [200, 300], ec: [1.2, 2.0], timerDays: 30, phases: [0.08, 0.2, 0.42, 1],
    pollination: 'none', unaidedSet: 1, harvest: leaf(0.4, 8, 3), processing: [], seedDays: 14,
    yieldKgM2: 3, kcalPerKg: 150, proteinGPerKg: 14, fresh: true, stressRate: 1,
  },
  {
    id: 'mizuna', name: 'Mizuna mustard', bay: 'tier', evidence: 'space', tier: 2,
    look: 'Serrated, branching leaves.', role: 'Quick crop with repeated leaf harvests.',
    heightM: [0.20, 0.40], tempC: [18, 24], ppfd: [200, 350], ec: [1.2, 2.0], timerDays: 25, phases: [0.08, 0.2, 0.42, 1],
    pollination: 'none', unaidedSet: 1, harvest: leaf(0.5, 6, 4), processing: [], seedDays: 12,
    yieldKgM2: 2.5, kcalPerKg: 230, proteinGPerKg: 22, fresh: true, stressRate: 1,
  },
  {
    id: 'kale', name: 'Kale', bay: 'tier', evidence: 'space', tier: 2,
    look: 'Curled, textured leaves.', role: 'Longer-lived leaf production: many cuts from one planting.',
    heightM: [0.30, 0.60], tempC: [18, 24], ppfd: [250, 400], ec: [1.2, 2.0], timerDays: 40, phases: [0.07, 0.18, 0.4, 1],
    pollination: 'none', unaidedSet: 1, harvest: leaf(0.4, 8, 6), processing: [], seedDays: 16,
    yieldKgM2: 3.5, kcalPerKg: 350, proteinGPerKg: 29, fresh: true, stressRate: 0.8,
  },
  {
    id: 'radish', name: 'Radish', bay: 'tier', evidence: 'space', tier: 1,
    look: 'Leaf cluster over a coloured, swollen root.', role: 'Whole-plant harvest. The root shows in the inspection view.',
    heightM: [0.15, 0.30], tempC: [18, 24], ppfd: [250, 400], ec: [1.2, 2.0], timerDays: 30, phases: [0.08, 0.2, 0.42, 1],
    pollination: 'none', unaidedSet: 1, harvest: whole, processing: [], seedDays: 18,
    yieldKgM2: 3, kcalPerKg: 160, proteinGPerKg: 7, fresh: true, stressRate: 1,
  },
  {
    id: 'tomato', name: 'Dwarf tomato', bay: 'tall', evidence: 'space', tier: 1,
    look: 'Branched plant on a trellis, yellow flowers, fruit turning green to red.', role: 'Flowers need a vibration tool. Ripe fruit is picked again and again.',
    heightM: [0.40, 0.90], tempC: [22, 26], ppfd: [400, 600], ec: [1.4, 2.4], timerDays: 85, phases: [0.06, 0.14, 0.3, 0.58],
    pollination: 'vibrate', unaidedSet: 0.35, harvest: pick(0.5, 12, 4), processing: [], seedDays: 0,
    yieldKgM2: 6, kcalPerKg: 180, proteinGPerKg: 9, fresh: true, stressRate: 1.1,
  },
  {
    id: 'pepper', name: 'Compact pepper', bay: 'tall', evidence: 'space', tier: 2,
    look: 'Glossy leaves, pale flowers, fruit turning green to red.', role: 'Flavour and variety. Flowers want gentle help to set fruit.',
    heightM: [0.40, 0.80], tempC: [22, 27], ppfd: [350, 550], ec: [1.4, 2.4], timerDays: 95, phases: [0.06, 0.14, 0.3, 0.6],
    pollination: 'assist', unaidedSet: 0.4, harvest: pick(0.5, 14, 3), processing: [], seedDays: 0,
    yieldKgM2: 4, kcalPerKg: 320, proteinGPerKg: 10, fresh: true, stressRate: 1.1,
  },
  {
    id: 'potato', name: 'Potato', bay: 'tall', evidence: 'ground', tier: 3,
    look: 'Bushy compound leaves. The tubers stay hidden in an opaque root chamber.', role: 'Calorie crop. Pull the harvest drawer, then cook before eating.',
    heightM: [0.40, 0.80], tempC: [18, 22], ppfd: [400, 600], ec: [1.4, 2.4], timerDays: 90, phases: [0.06, 0.14, 0.3, 0.55],
    pollination: 'self', unaidedSet: 1, harvest: whole, processing: ['cook'], seedDays: 0,
    yieldKgM2: 6, kcalPerKg: 770, proteinGPerKg: 20, fresh: false, stressRate: 0.9,
  },
  {
    id: 'wheat', name: 'Dwarf wheat', bay: 'tall', evidence: 'ground', tier: 3,
    look: 'Narrow upright leaves, grain heads turning gold.', role: 'Staple food: harvest, thresh, mill, then cook.',
    heightM: [0.40, 0.70], tempC: [18, 24], ppfd: [500, 700], ec: [1.4, 2.4], timerDays: 85, phases: [0.05, 0.12, 0.28, 0.6],
    pollination: 'self', unaidedSet: 1, harvest: whole, processing: ['thresh', 'mill', 'cook'], seedDays: 0,
    yieldKgM2: 0.8, kcalPerKg: 3400, proteinGPerKg: 130, fresh: false, stressRate: 0.9,
  },
  {
    id: 'soybean', name: 'Soybean', bay: 'tall', evidence: 'ground', tier: 3,
    look: 'Three-part leaves, small flowers, then pods.', role: 'Protein and oil crop: shell the pods, then cook.',
    heightM: [0.40, 0.80], tempC: [22, 27], ppfd: [400, 600], ec: [1.4, 2.4], timerDays: 95, phases: [0.06, 0.14, 0.3, 0.58],
    pollination: 'self', unaidedSet: 1, harvest: whole, processing: ['shell', 'cook'], seedDays: 0,
    yieldKgM2: 0.5, kcalPerKg: 4460, proteinGPerKg: 365, fresh: false, stressRate: 1,
  },
]

export const crop = (id: CropId): Crop => CROPS.find(c => c.id === id)!
export const CROP_IDS = CROPS.map(c => c.id)

/** True when the crop flowers and sets fruit, pods, grain or tubers on the way to its harvest. */
export const flowers = (c: Crop) => c.phases[3] < 1

/** MODEL: the light a crop is given by default, the middle of its band. */
export const defaultPpfd = (c: Crop) => Math.round((c.ppfd[0] + c.ppfd[1]) / 2 / 10) * 10

/**
 * Daily light integral in mol/m²/day: canopy photon flux × lit seconds / 1,000,000.
 * 250 µmol/m²/s for 16 hours gives 14.4.
 */
export const dli = (ppfd: number, hours: number) => (ppfd * hours * 3600) / 1e6

/** What the evidence label says in the game. */
export const EVIDENCE_TEXT: Record<Evidence, string> = {
  space: 'Grown in space (NASA space-crop experiments)',
  ground: 'Studied in controlled chambers on Earth (NASA crop research)',
}

export const STAGE_TEXT: Record<Stage, string> = {
  seed: 'Seed plug',
  germination: 'Germinating',
  seedling: 'Seedling',
  vegetative: 'Growing',
  reproductive: 'Flowering',
  ready: 'Harvest-ready',
  postharvest: 'Regrowing',
  dead: 'Dead',
}

export const PROCESS_TEXT: Record<ProcessStep, string> = { cook: 'Cook', thresh: 'Thresh', mill: 'Mill', shell: 'Shell' }
