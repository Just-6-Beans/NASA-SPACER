// What NASA says about the real events behind the station tasks and the dust storm, and the
// photographs of Earth taken from the International Space Station.
// Reads the committed snapshot in data/nasa/station-tasks.json (built by
// scripts/fetch-station-tasks.mjs). Nothing here calls a NASA page.
// The rules of the tasks themselves are game rules: see src/core/stationTasks.ts.
import snapshot from '../../data/nasa/station-tasks.json'
import { formatDate } from './opsDates'
import type { TaskQuote } from './roverTasks'

export type StationCardId = 'apollo13-filter' | 'apollo13-power' | 'iss-water' | 'mir-fire' | 'crew-day' | 'dust-2018'
/** A short "what really happened" card shown beside a task, with the sentences it rests on. */
export interface StationCard { id: StationCardId; title: string; text: string; provider: string; backing: TaskQuote[] }
export const STATION_CARDS = snapshot.cards as unknown as StationCard[]
export const stationCard = (id: StationCardId): StationCard => {
  const found = STATION_CARDS.find(c => c.id === id)
  if (!found) throw new Error(`Unknown station card ${id}`)
  return found
}

/** A photograph of Earth taken by a station crew. `title` is ours; the caption and the date are NASA's. */
export interface EarthPhoto { id: string; title: string; caption: string; taken: string; centre: string; file: string; page: string; credit: string }
export const EARTH_PHOTOS = snapshot.earth as unknown as EarthPhoto[]

/** Where the data came from, as recorded inside the snapshot. */
export const STATION_TASK_DATA = { retrieved: snapshot.retrieved, how: snapshot.how, limits: snapshot.limits, model: snapshot.model }
/** "NASA pages, retrieved 15 Nov 2026" */
export const stationTaskDataLine = () => `NASA pages, retrieved ${formatDate(STATION_TASK_DATA.retrieved)}`
