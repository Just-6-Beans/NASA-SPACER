// Crop catalogue for the station greenhouse. Plain data, no DOM and no Phaser.
//
// WHERE THE NUMBERS COME FROM. The six crops are fresh crops that NASA has grown on the
// International Space Station (lettuce, radish, mizuna mustard, kale, chile pepper, dwarf tomato).
// Everything numeric below (days to harvest, calories, water use) is OUR GAME MODEL, chosen so the
// crop-selection mission is a real trade-off. None of it is a NASA measurement. Keep it editable.

export type CropId = 'lettuce' | 'radish' | 'mizuna' | 'kale' | 'pepper' | 'tomato'

/** The eight drawn states of a planting, in the order of the columns of a crop sprite sheet. */
export type Stage = 'seed' | 'germination' | 'seedling' | 'vegetative' | 'reproductive' | 'ready' | 'postharvest' | 'dead'
export const STAGES: Stage[] = ['seed', 'germination', 'seedling', 'vegetative', 'reproductive', 'ready', 'postharvest', 'dead']

/** What a rack is built for: two shelves of low crops, or one tall shelf with a trellis. */
export type BayKind = 'tier' | 'tall'
export type LightNeed = 'Low' | 'Medium' | 'High'

export interface Crop {
  id: CropId
  name: string
  /** One line for the comparison table. */
  note: string
  /** The rack the crop was drawn for. Any crop may be planted in any bay; this only sets its size on the deck. */
  bay: BayKind
  /** True when the crop flowers and sets fruit before its harvest. */
  fruiting: boolean
  /** MODEL: greenhouse days from planting to harvest, and from one harvest to the next. */
  growDays: number
  /** MODEL: calories one bay gives at each harvest. */
  kcal: number
  /** MODEL: litres of water one bay takes for each day of growth. */
  waterLPerDay: number
  /** MODEL: how much light the crop wants. Shown in the table; it does not change the feeding run. */
  light: LightNeed
}

export const CROPS: Crop[] = [
  { id: 'lettuce', name: 'Lettuce', note: 'Fast and light on water, but few calories.', bay: 'tier', fruiting: false, growDays: 8, kcal: 800, waterLPerDay: 2, light: 'Low' },
  { id: 'radish', name: 'Radish', note: 'Fast. A little more food than lettuce.', bay: 'tier', fruiting: false, growDays: 8, kcal: 900, waterLPerDay: 2, light: 'Medium' },
  { id: 'mizuna', name: 'Mizuna mustard', note: 'Quick leaves, cut again and again.', bay: 'tier', fruiting: false, growDays: 10, kcal: 1200, waterLPerDay: 3, light: 'Low' },
  { id: 'kale', name: 'Kale', note: 'A solid harvest, twice in the 30 days.', bay: 'tier', fruiting: false, growDays: 12, kcal: 1800, waterLPerDay: 4, light: 'Medium' },
  { id: 'pepper', name: 'Chile pepper', note: 'Takes long and drinks a lot. One big harvest.', bay: 'tall', fruiting: true, growDays: 18, kcal: 6500, waterLPerDay: 8, light: 'High' },
  { id: 'tomato', name: 'Dwarf tomato', note: 'The slowest and the thirstiest. The biggest harvest.', bay: 'tall', fruiting: true, growDays: 21, kcal: 8500, waterLPerDay: 10, light: 'High' },
]

export const crop = (id: CropId): Crop => CROPS.find(c => c.id === id)!
export const CROP_IDS = CROPS.map(c => c.id)

/** The drawn stage for a share (0..1) of the way to harvest. Leaf and root crops never show flowers. */
export function stageAt(c: Crop, progress: number): Stage {
  if (progress >= 1) return 'ready'
  if (progress < 0.08) return 'seed'
  if (progress < 0.2) return 'germination'
  if (progress < 0.42) return 'seedling'
  return c.fruiting && progress >= 0.62 ? 'reproductive' : 'vegetative'
}

export const STAGE_TEXT: Record<Stage, string> = {
  seed: 'Seed plug',
  germination: 'Germinating',
  seedling: 'Seedling',
  vegetative: 'Growing',
  reproductive: 'Flowering',
  ready: 'Ready to harvest',
  postharvest: 'Regrowing',
  dead: 'Dead',
}
