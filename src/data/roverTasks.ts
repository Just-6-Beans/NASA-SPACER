// What NASA says about the rockets that could carry the rover, five of the rock samples
// Perseverance has sealed, and the real events behind the rover tasks.
// Reads the committed snapshot in data/nasa/rover-tasks.json (built by
// scripts/fetch-rover-tasks.mjs). Nothing here calls a NASA page.
// Which game numbers go with each fact is a game rule: see src/core/delivery.ts,
// src/core/rescue.ts and src/core/samples.ts.
import snapshot from '../../data/nasa/rover-tasks.json'
import { formatDate } from './opsDates'

export interface TaskSource { title: string; provider: string; url: string }
/** The exact words of a source that a fact rests on. */
export interface TaskQuote {
  quote: string
  source: TaskSource
  /** "by script": the snapshot script found the quote in the source. "by hand": it could not read the source on that run. */
  checked: 'by script' | 'by hand'
}
interface Fact { backing: TaskQuote[] }
/** One labelled line in our words. */
export interface TaskLine extends Fact { label: string; text: string }
/** One figure from a source. */
export interface TaskNumber extends Fact { label: string; value: string }

export type RoverRocketId = 'atlas-v-541' | 'falcon-9-expendable' | 'saturn-v'
export interface RoverRocketFacts {
  id: RoverRocketId
  name: string
  maker: string
  brief: TaskLine[]
  numbers: TaskNumber[]
  /** What one launch cost NASA, in millions of US dollars. Null where the game sells no launch. */
  cost: (Fact & { usdMillions: number; basis: string }) | null
}
export const ROVER_ROCKET_FACTS = snapshot.rockets as unknown as RoverRocketFacts[]
export const roverRocketFacts = (id: RoverRocketId): RoverRocketFacts => {
  const found = ROVER_ROCKET_FACTS.find(r => r.id === id)
  if (!found) throw new Error(`Unknown rover rocket ${id}`)
  return found
}

/** What the rocket has to lift: the whole spacecraft at launch, in kilograms. */
export const SPACECRAFT = {
  /** REAL: NASA's figure for the Mars Science Laboratory spacecraft. */
  curiosity: snapshot.spacecraft.curiosity as unknown as Fact & { launchMassKg: number; text: string },
  /** OUR SUM of two NASA numbers: NASA gives no figure for the Mars 2020 spacecraft on its own. */
  perseverance: snapshot.spacecraft.perseverance as unknown as Fact & { estimateKg: number; extraRoverKg: number; text: string },
}
/** NOT NASA: what SpaceX lists as the payload a Falcon 9 can send to Mars with its booster not recovered. */
export const FALCON_MARS = snapshot.falconMarsPayload as { kg: number; provider: string; url: string; checked: string; note: string }

export type SampleId = 'roubion' | 'montdenier' | 'skyland' | 'hazeltop' | 'sapphire'
/** One entry of NASA's catalog of the samples Perseverance has sealed, with what NASA has said about the rock. */
export interface SampleFacts {
  id: SampleId
  number: number
  name: string
  /** The rock or outcrop it was cut from. */
  feature: string
  sampleType: string
  rockType: string | null
  sol: number
  sealed: string
  heightCm: number | null
  /** Where our reading goes beyond the words of the source. */
  note?: string
  catalog: TaskQuote[]
  story: TaskLine[]
  /** The picture NASA's catalog prints with the sample: the drill hole and its surroundings, not the core tube. */
  image: { file: string; shows: string; url: string; credit: string; caption: TaskQuote }
}
export const SAMPLE_FACTS = snapshot.samples as unknown as SampleFacts[]
export const sampleFacts = (id: SampleId): SampleFacts => {
  const found = SAMPLE_FACTS.find(s => s.id === id)
  if (!found) throw new Error(`Unknown sample ${id}`)
  return found
}
export const TUBES = snapshot.tubes as unknown as Fact & { total: number; forSamples: number; collected: TaskNumber }

export type CardId = 'rock-delay' | 'wheel-wear' | 'sand-trap' | 'sample-caching' | 'curiosity-powder' | 'sample-return'
/** A short "what really happened" card shown beside a task. */
export interface TaskCard extends Fact { id: CardId; title: string; text: string; provider: string }
export const TASK_CARDS = snapshot.cards as unknown as TaskCard[]
export const taskCard = (id: CardId): TaskCard => {
  const found = TASK_CARDS.find(c => c.id === id)
  if (!found) throw new Error(`Unknown card ${id}`)
  return found
}

/** Where the data came from, as recorded inside the snapshot. */
export const ROVER_TASK_DATA = { retrieved: snapshot.retrieved, how: snapshot.how, limits: snapshot.limits, model: snapshot.model }
/** "NASA pages, retrieved 15 Nov 2026" */
export const roverTaskDataLine = () => `NASA pages, retrieved ${formatDate(ROVER_TASK_DATA.retrieved)}`

/** Every distinct source behind a set of facts, in the order they cite them. */
export function taskSources(facts: { backing: TaskQuote[] }[]): TaskSource[] {
  const seen = new Map<string, TaskSource>()
  for (const f of facts) for (const b of f.backing) if (!seen.has(b.source.url)) seen.set(b.source.url, b.source)
  return [...seen.values()]
}
