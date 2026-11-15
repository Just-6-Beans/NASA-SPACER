// Sample selection: at the sample site the rover finds five rocks and has three tubes. The pilot
// scans each rock, compares the clues and decides which three to keep. Plain TypeScript, no DOM
// and no Phaser.
//
// REAL (src/data/roverTasks.ts): each rock is modelled on a sample Perseverance really sealed, and
// the composition clue follows what NASA has said about that rock.
// OUR MODEL: the colour and texture read-outs (they describe what NASA's picture of each sample's drill site shows; the catalog itself does not describe them), the science
// value of each rock, the three-tube limit at one site, and where the sample site is.
import type { SampleId } from '../data/roverTasks'
import type { AreaStop, RoverId, RoverSpec } from './rovers'

export type RockId = SampleId

export interface Rock {
  id: RockId
  /** OUR MODEL: science value of a sealed core, for a mission looking for signs of ancient life. */
  value: number
  /** The rock hides an organic-like signal: only a calibrated instrument reads it. */
  organic: boolean
  clues: {
    colour: string
    texture: string
    /** What a calibrated instrument reads. */
    composition: string
    /** What an uncalibrated one makes of it. */
    faint: string
  }
  /** Why it is worth what it is worth, shown once the tubes are sealed. */
  verdict: string
}

export const ROCKS: Rock[] = [
  {
    id: 'montdenier', value: 20, organic: false,
    clues: { colour: 'Grey-green, streaked', texture: 'Smooth solid slab, no layers', composition: 'Basalt (cooled lava) with a little salt', faint: 'Dark volcanic rock' },
    verdict: 'Lava rock can be dated precisely, so it anchors Mars\' timeline. It is less likely to keep signs of life.',
  },
  {
    id: 'hazeltop', value: 35, organic: true,
    clues: { colour: 'Tan-yellow', texture: 'Flat, fine-grained, cracked', composition: 'Lake mud and sulfate salts, with an organic-like signal', faint: 'Fine mud and salts' },
    verdict: 'Mud from a salty lake is where signs of life keep best, and this one carries organic molecules.',
  },
  {
    id: 'roubion', value: 0, organic: false,
    clues: { colour: 'Pale yellow, powdery', texture: 'Crumbling, loose surface', composition: 'Weak, heavily weathered rock', faint: 'Weathered crust' },
    verdict: 'It crumbled to powder in the drill, and the tube was sealed with no rock inside.',
  },
  {
    id: 'sapphire', value: 40, organic: true,
    clues: { colour: 'Orange-brown, pale patches', texture: 'Rough face, white veins', composition: 'Iron minerals in the spots, with an organic-like signal', faint: 'Iron-rich spots' },
    verdict: 'Its spots may record chemistry that microbes could have used. NASA calls it a potential biosignature.',
  },
  {
    id: 'skyland', value: 25, organic: false,
    clues: { colour: 'Golden tan', texture: 'Layered, sandy grains', composition: 'Sandstone: grains carried in by a river', faint: 'Sandy sediment' },
    verdict: 'Layers laid down by a river: a record of flowing water.',
  },
]
export const rock = (id: RockId): Rock => {
  const found = ROCKS.find(r => r.id === id)
  if (!found) throw new Error(`Unknown rock ${id}`)
  return found
}
export const ROCK_IDS = ROCKS.map(r => r.id)

/** MODEL: tubes the rover may fill at the sample site. */
export const TUBE_COUNT = 3
/** The most three tubes can be worth. */
export const MAX_SAMPLE_VALUE = [...ROCKS].sort((a, b) => b.value - a.value).slice(0, TUBE_COUNT).reduce((n, r) => n + r.value, 0)

/** Science value of a set of tubes, 0 to 100. */
export const sampleValue = (picks: RockId[]) => Math.round((picks.reduce((n, id) => n + rock(id).value, 0) / MAX_SAMPLE_VALUE) * 100)

export type CacheLevel = 'great' | 'good' | 'fair' | 'weak'
/** MODEL: how a cache is judged. */
export function cacheRating(value: number): { level: CacheLevel; word: string } {
  if (value >= 90) return { level: 'great', word: 'Outstanding cache' }
  if (value >= 70) return { level: 'good', word: 'Strong cache' }
  if (value >= 45) return { level: 'fair', word: 'Fair cache' }
  return { level: 'weak', word: 'Common rocks only' }
}

/** Why a set of picks cannot be sealed, or null. */
export function picksBlock(picks: RockId[]): string | null {
  if (picks.length !== TUBE_COUNT) return `Fill all ${TUBE_COUNT} tubes first.`
  if (new Set(picks).size !== picks.length) return 'Each tube needs a different rock.'
  if (picks.some(id => !ROCK_IDS.includes(id))) return 'Unknown rock.'
  return null
}

/** What the mission keeps once the tubes are sealed. */
export interface SampleResult {
  picks: RockId[]
  value: number
  /** The composition clues were readable: the instrument was calibrated. */
  clear: boolean
  /** Organic-like rocks among the picks, and among all five. */
  organics: number
  /** Battery the coring used, watt-hours. */
  wh: number
}

/** The five rocks in the order this mission lays them out (A to E), shuffled once by the mission's dice. */
export function shuffleRocks(rng: () => number): RockId[] {
  const ids = [...ROCK_IDS]
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids
}
export const ROCK_TAGS = 'ABCDE'

// ---------------------------------------------------------------- The sample site
/** MODEL: how close the rover must stop to the sample site to work there. */
export const SAMPLE_RANGE_M = 60
/** MODEL: a tap this close to the site's marker sends the rover to the site itself (the same reach as a tap on a visited spot). */
export const SAMPLE_SNAP_M = 25
const siteCache = new Map<RoverId, AreaStop>()
/**
 * The sample site on a rover's map: a place the real rover parked (REAL), about half a kilometre
 * from the start (our choice), so reaching it takes a real drive. The five rocks are our scene:
 * the samples they are modelled on were cut elsewhere in Jezero Crater.
 */
export function sampleSite(r: RoverSpec): AreaStop {
  const hit = siteCache.get(r.id)
  if (hit) return hit
  const far = (s: AreaStop) => Math.hypot(s.x, s.y)
  const ring = r.area.stops.filter(s => far(s) >= 350 && far(s) <= 700)
  const site = [...(ring.length ? ring : r.area.stops)].sort((a, b) => Math.abs(far(a) - 500) - Math.abs(far(b) - 500))[0]
  siteCache.set(r.id, site)
  return site
}
