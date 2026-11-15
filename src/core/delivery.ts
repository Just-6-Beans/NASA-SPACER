// Getting the rover to Mars: which rocket carries it. Plain TypeScript, no DOM and no Phaser.
//
// REAL (src/data/roverTasks.ts): the Atlas V 541 launched both rovers; what NASA paid to launch
// Mars 2020 on it; what NASA paid for a Falcon 9 launch (IMAP); the launch mass of the Curiosity
// spacecraft; the Saturn V's last flight. NOT NASA: SpaceX's figure for what a Falcon 9 can send
// to Mars.
// OUR MODEL: the price in credits (one credit for each $10 million, the same scale as the crew
// launch), the success rates, and the Mars days a failed launch costs.
import { USD_MILLIONS_PER_CREDIT } from '../data/launchVehicles'
import { FALCON_MARS, SPACECRAFT, roverRocketFacts, type RoverRocketId } from '../data/roverTasks'
import type { RoverId } from './rovers'

export type DeliveryId = 'atlas541' | 'falcon9x' | 'saturnv'

export interface DeliveryRocket {
  id: DeliveryId
  name: string
  /** A few words under the name. */
  role: string
  /** The real rocket. Its facts are NASA data in src/data/roverTasks.ts. */
  facts: RoverRocketId
  /** Credits one launch costs, from NASA's cost figure. Null: the game sells no launch on it. */
  price: number | null
  /** OUR MODEL: the chance the rover reaches Mars on it, per cent. */
  successPct: number | null
  /** The rovers it can carry. */
  rovers: RoverId[]
  blurb: string
  pros: string[]
  cons: string[]
  /** What mission control says about it, in a sentence. */
  verdict: string
}

const price = (id: RoverRocketId) => { const c = roverRocketFacts(id).cost; return c ? Math.round(c.usdMillions / USD_MILLIONS_PER_CREDIT) : null }

/** OUR MODEL: a proven rocket with mass to spare, and one with none. */
export const SUCCESS_WITH_MARGIN = 98
export const SUCCESS_NO_MARGIN = 80
/** OUR MODEL: Mars days lost when the launch fails and a backup rover has to fly. */
export const BACKUP_SOLS = 3

export const DELIVERY_ROCKETS: DeliveryRocket[] = [
  {
    id: 'atlas541', name: 'Atlas V 541', role: 'Proven', facts: 'atlas-v-541', price: price('atlas-v-541'), successPct: SUCCESS_WITH_MARGIN,
    rovers: ['perseverance', 'curiosity'],
    blurb: 'The rocket that really launched both rovers.',
    pros: ['Flew both rovers to Mars', 'Mass to spare'],
    cons: ['Costs more than twice as much'],
    verdict: 'The safe choice: it has done this job twice.',
  },
  {
    id: 'falcon9x', name: 'Falcon 9', role: 'Booster thrown away', facts: 'falcon-9-expendable', price: price('falcon-9-expendable'), successPct: SUCCESS_NO_MARGIN,
    rovers: ['perseverance'],
    blurb: 'Reaches Mars only if the booster is thrown away instead of landed.',
    pros: ['Less than half the price'],
    cons: ['No mass to spare', 'Never flown a rover to Mars'],
    verdict: 'It works, but it\'s right at the limit. One extra kilogram and you\'d miss Mars.',
  },
  {
    id: 'saturnv', name: 'Saturn V', role: 'Moon rocket', facts: 'saturn-v', price: null, successPct: null,
    rovers: [],
    blurb: 'The giant that sent crews to the Moon.',
    pros: ['Far more lift than a rover needs'],
    cons: ['Last flown in 1973'],
    verdict: 'Too old and too expensive. It retired in 1973!',
  },
]
export const deliveryRocket = (id: DeliveryId): DeliveryRocket => {
  const found = DELIVERY_ROCKETS.find(r => r.id === id)
  if (!found) throw new Error(`Unknown rocket ${id}`)
  return found
}

/** Launch mass of the whole spacecraft that carries a rover, in kilograms. Curiosity: NASA's figure. Perseverance: our sum of two NASA numbers. */
export const spacecraftKg = (rover: RoverId) => (rover === 'curiosity' ? SPACECRAFT.curiosity.launchMassKg : SPACECRAFT.perseverance.estimateKg)

/**
 * Kilograms to spare: what the rocket can send to Mars minus what the spacecraft weighs.
 * Only the Falcon 9 has a published figure to compare with (SpaceX's, not NASA's); null otherwise.
 */
export const marginKg = (id: DeliveryId, rover: RoverId): number | null => (id === 'falcon9x' ? FALCON_MARS.kg - spacecraftKg(rover) : null)

/** Why a rocket cannot carry this rover at all, or null. */
export function rocketRefusal(k: DeliveryRocket, rover: RoverId): string | null {
  if (k.id === 'saturnv') return k.verdict
  if (!k.rovers.includes(rover)) return 'Perseverance only. Curiosity left Earth in 2011, when the Falcon 9 was a much smaller rocket.'
  return null
}

/** The rockets a rover can really fly on, cheapest first. */
export const rocketsFor = (rover: RoverId) => DELIVERY_ROCKETS.filter(k => k.price !== null && k.rovers.includes(rover)).sort((a, b) => a.price! - b.price!)
/** The least the rover's rocket can cost: what a design has to leave in the budget. */
export const ROCKET_MIN = Math.min(...DELIVERY_ROCKETS.filter(k => k.price !== null).map(k => k.price!))
/** The price of the one rocket every rover can fly on. */
export const ROCKET_ANY = Math.max(...(['perseverance', 'curiosity'] as RoverId[]).map(r => rocketsFor(r)[0].price!))

/** How the rover's trip to Mars went. */
export interface Delivery {
  rocket: DeliveryId
  /** The first launch reached Mars. If not, a backup flew. */
  ok: boolean
  /** Mars days lost waiting for the backup. */
  solsLost: number
}
/** One roll of the dice, 0 to 1: under the success rate, the rover arrives. */
export const delivered = (k: DeliveryRocket, roll: number) => roll < (k.successPct ?? 0) / 100
/** What went wrong when a launch fails, in the rocket's own terms. */
export const failureStory = (k: DeliveryRocket) => k.id === 'falcon9x'
  ? 'With no mass to spare, the upper stage ran dry just short of the speed for Mars.'
  : 'The upper stage shut down early and the spacecraft missed its path to Mars.'
