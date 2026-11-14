// What NASA says about the three launch systems on the launch field.
// Reads the committed snapshot in data/nasa/launch-vehicles.json (built by
// scripts/fetch-launch-vehicles.mjs from NASA pages). Nothing here calls a NASA page.
// Which game numbers go with each system is a game rule: see SHIPS in src/core/data.ts.
import snapshot from '../../data/nasa/launch-vehicles.json'
import { formatDate } from './opsDates'

export type RocketId = 'space-shuttle' | 'falcon-9-crew-dragon' | 'atlas-v-n22-starliner'

export interface RocketSource { title: string; provider: string; url: string }
/** The exact words of a NASA source that a fact rests on. */
export interface RocketQuote {
  quote: string
  source: RocketSource
  /** "by script": the snapshot script found the quote in the source. "by hand": a PDF the script could not read on that run. */
  checked: 'by script' | 'by hand'
}
/** Anything the snapshot states, with the quotes behind it. Empty only where it says NASA gives no figure. */
interface Fact { backing: RocketQuote[] }
/** One labelled line of the short description, in our words. */
export interface RocketLine extends Fact { label: string; text: string }
/** One figure from a NASA page. */
export interface RocketNumber extends Fact { label: string; value: string }
/** Thrust and weight at lift-off as NASA states them, in pounds, and the first divided by the second. */
export interface Liftoff extends Fact { thrustLbf: number; weightLb: number; twr: number; note: string }
/** What one flight costs as NASA states it, in millions of US dollars. */
export interface LaunchCost extends Fact { usdMillions: number; perSeatUsdMillions?: number; seats?: number; basis: string }

export interface Rocket {
  id: RocketId
  name: string
  /** When it flew crews to the station, for example "1998 to 2011". */
  years: string
  first: RocketNumber
  /** Null while it is still flying crews. */
  last: RocketNumber | null
  brief: RocketLine[]
  numbers: RocketNumber[]
  /** Null where NASA's pages do not give both figures: the game then says its number is a model. */
  liftoff: Liftoff | null
  cost: LaunchCost
}

export const ROCKETS = snapshot.vehicles as unknown as Rocket[]

export const rocket = (id: RocketId): Rocket => {
  const found = ROCKETS.find(r => r.id === id)
  if (!found) throw new Error(`Unknown launch system ${id}`)
  return found
}

/** Where the data came from, as recorded inside the snapshot. */
export const ROCKET_DATA = {
  retrieved: snapshot.retrieved,
  how: snapshot.how,
  limits: snapshot.limits,
  model: snapshot.model,
  /** Places where NASA's own pages give a different figure from the one the snapshot uses. */
  disagreements: snapshot.disagreements as unknown as (Fact & { about: RocketId; text: string })[],
}

/** US dollars, in millions, that one credit of launch price stands for. */
export const USD_MILLIONS_PER_CREDIT = 10

/** "NASA pages, retrieved 14 Nov 2026" */
export const rocketDataLine = () => `NASA pages, retrieved ${formatDate(ROCKET_DATA.retrieved)}`

/** Every quoted statement behind one system. */
export const rocketStatements = (r: Rocket): RocketQuote[] =>
  [r.first, r.last, ...r.brief, ...r.numbers, r.liftoff, r.cost].flatMap(f => f?.backing ?? [])

/** Every distinct source behind one system's facts, in the order the facts cite them. */
export function rocketSources(r: Rocket): RocketSource[] {
  const seen = new Map<string, RocketSource>()
  for (const item of rocketStatements(r)) if (!seen.has(item.source.url)) seen.set(item.source.url, item.source)
  return [...seen.values()]
}
/** The 1-based numbers a fact's sources have in `rocketSources`, without repeats. */
export function sourceNumbers(r: Rocket, fact: { backing: RocketQuote[] }): number[] {
  const all = rocketSources(r)
  return [...new Set(fact.backing.map(b => all.findIndex(s => s.url === b.source.url) + 1))].sort((a, b) => a - b)
}
