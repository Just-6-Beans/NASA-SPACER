// Sample selection: three sample sites on the map hold five rocks between them, and the rover has
// three tubes for the whole mission. At each site the pilot scans the rocks there, compares the
// clues and decides which to keep, and whether to save tubes for another site. Plain TypeScript,
// no DOM and no Phaser.
//
// REAL (src/data/roverTasks.ts): each rock is modelled on a sample Perseverance really sealed, the
// picture is NASA's own, and the composition clue follows what NASA has said about that rock.
// Each site is a place the real rover parked.
// OUR MODEL: the colour and texture read-outs (they describe what NASA's picture shows; the catalog
// does not describe them), the science value of each rock, the three tubes, which stops are
// sample sites, and which rocks lie at which site.
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

/** MODEL: tubes the rover has for the whole mission. */
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

/** What the mission keeps of its tubes. It grows each time tubes are sealed at a site. */
export interface SampleResult {
  /** The rocks sealed so far, in the order they were cored: at most TUBE_COUNT. */
  picks: RockId[]
  value: number
  /** The composition clues were readable every time: the instrument was calibrated. */
  clear: boolean
  /** Organic-like rocks among the picks. */
  organics: number
  /** Battery the coring has used, watt-hours. */
  wh: number
}

// ---------------------------------------------------------------- The sample sites
/** MODEL: how close the rover must stop to a sample site to work there. */
export const SAMPLE_RANGE_M = 60
/** MODEL: a tap this close to a site's marker sends the rover to the site itself (the same reach as a tap on a visited spot). */
export const SAMPLE_SNAP_M = 25
/**
 * MODEL: which rocks lie at which site, nearest site first. The common rocks are close to the
 * start and the rarest is farthest, so a better cache costs a longer drive.
 */
export const SITE_ROCKS: RockId[][] = [['montdenier', 'roubion'], ['skyland', 'hazeltop'], ['sapphire']]
/** MODEL: about how far from the start each site lies, metres. */
export const SITE_DISTANCES_M = [400, 700, 1000]
/** MODEL: the least distance between two sample sites, metres. */
export const SITE_GAP_M = 350
/** The letter each rock carries on its card, A to E, in the order the sites hold them. */
export const ROCK_TAGS = 'ABCDE'
export const rockTag = (id: RockId) => ROCK_TAGS[SITE_ROCKS.flat().indexOf(id)]

/** A sample site: a place the real rover parked (REAL), with the rocks the game lays there (MODEL). */
export interface SampleSite { id: number; name: string; x: number; y: number; stop: AreaStop; rocks: RockId[] }
const siteCache = new Map<RoverId, SampleSite[]>()
/**
 * The three sample sites on a rover's map, nearest first. Each is a real rover stop about the
 * wanted distance from the start, at least SITE_GAP_M from the other sites and a short leg on from the one before. The
 * rocks are our scene: the samples they are modelled on were cut elsewhere in Jezero Crater.
 */
export function sampleSites(r: RoverSpec): SampleSite[] {
  const hit = siteCache.get(r.id)
  if (hit) return hit
  const far = (s: AreaStop) => Math.hypot(s.x, s.y)
  const half = r.area.sizeM / 2 - 60
  const inside = r.area.stops.filter(s => Math.abs(s.x) <= half && Math.abs(s.y) <= half)
  const chosen: AreaStop[] = []
  for (const want of SITE_DISTANCES_M) {
    const apart = (s: AreaStop) => Math.min(...chosen.map(c => Math.hypot(c.x - s.x, c.y - s.y)), Infinity)
    const free = inside.filter(s => !chosen.includes(s) && apart(s) >= SITE_GAP_M)
    const ring = free.filter(s => Math.abs(far(s) - want) <= 150)
    const last = chosen[chosen.length - 1]
    const onward = (s: AreaStop) => (last ? Math.hypot(last.x - s.x, last.y - s.y) : 0)
    // In the ring: the stop with the shortest drive on from the site before it, so each site is
    // one more leg out and not across the map. No stop in the ring: the one nearest the wanted distance.
    const pick = ring.length
      ? [...ring].sort((a, b) => onward(a) - onward(b) || Math.abs(far(a) - want) - Math.abs(far(b) - want))[0]
      : [...(free.length ? free : inside)].sort((a, b) => Math.abs(far(a) - want) - Math.abs(far(b) - want))[0]
    chosen.push(pick)
  }
  const sites = chosen.map((stop, id) => ({ id, name: `Site ${id + 1}`, x: stop.x, y: stop.y, stop, rocks: SITE_ROCKS[id] }))
  siteCache.set(r.id, sites)
  return sites
}
/** The sample site the rover is standing at, if any. */
export const siteAt = (r: RoverSpec, pos: { x: number; y: number }): SampleSite | null =>
  sampleSites(r).find(s => Math.hypot(s.x - pos.x, s.y - pos.y) <= SAMPLE_RANGE_M) ?? null

/** Why these rocks cannot be sealed at this site, or null. `sealed` are the tubes already filled. */
export function picksBlock(picks: RockId[], site: SampleSite, sealed: RockId[]): string | null {
  const left = TUBE_COUNT - sealed.length
  if (!picks.length) return 'Choose at least one rock.'
  if (new Set(picks).size !== picks.length) return 'Each tube needs a different rock.'
  if (picks.some(id => !site.rocks.includes(id))) return 'That rock is not at this site.'
  if (picks.some(id => sealed.includes(id))) return 'That rock is already in a tube.'
  if (picks.length > left) return `Only ${left} tube${left === 1 ? ' is' : 's are'} left.`
  return null
}
