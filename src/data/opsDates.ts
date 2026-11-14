// NASA data behind the rover's operations dates.
// Reads the committed extract in data/nasa/ops-dates.json (built by scripts/build-ops-dates.mjs
// from the JPL Horizons and Curiosity REMS snapshots). Nothing here calls an API.
import snapshot from '../../data/nasa/ops-dates.json'

/** One sol of Curiosity REMS weather at Gale Crater. Temperatures in degrees Celsius. */
export interface SolWeather {
  sol: number
  earthDate: string
  /** Whole Mars years between this sol and the operations date it stands in for. */
  marsYearsEarlier: number
  /** Solar longitude in degrees: where Mars is in its year. */
  ls: number
  minAirTemp: number
  maxAirTemp: number
  sunrise: string
  sunset: string
}

export interface OpsDate {
  /** The operations date, YYYY-MM-DD. */
  id: string
  /** The same date for people, for example "30 Mar 2029". */
  label: string
  note: string
  /** One-way Earth to Mars light time in minutes, rounded to 0.1 for play. */
  lightMin: number
  distanceAu: number
  weather: SolWeather
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2029-03-30" becomes "30 Mar 2029". */
export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export const OPS_DATES: OpsDate[] = snapshot.dates.map(d => ({
  id: d.date,
  label: formatDate(d.date),
  note: d.note,
  lightMin: Math.round(d.oneWayLightMinutes * 10) / 10,
  distanceAu: d.distanceAu,
  weather: d.weather,
}))

export const opsDate = (id: string): OpsDate => {
  const found = OPS_DATES.find(d => d.id === id)
  if (!found) throw new Error(`Unknown operations date ${id}`)
  return found
}

/** Where each dataset came from, as recorded inside the snapshot. */
export const SOURCES = {
  lightTime: { name: 'JPL Horizons', provider: snapshot.lightTime.provider, url: snapshot.lightTime.source, retrieved: snapshot.lightTime.retrieved, limits: snapshot.lightTime.limits },
  weather: { name: 'Curiosity REMS', provider: snapshot.weather.provider, url: snapshot.weather.source, retrieved: snapshot.weather.retrieved, location: snapshot.weather.location, limits: snapshot.weather.limits },
}

// ---- Provenance lines the game shows next to each real number ----------------
/** "JPL Horizons, Earth to Mars, 30 Mar 2029" */
export const lightTimeSource = (d: OpsDate) => `JPL Horizons, Earth to Mars, ${d.label}`
/** "Curiosity REMS, Gale Crater, sol 4580 (25 Jun 2025)" */
export const weatherSource = (d: OpsDate) => `Curiosity REMS, Gale Crater, sol ${d.weather.sol} (${formatDate(d.weather.earthDate)})`
/** Says plainly that the weather is a stand-in from an earlier Mars year, which is our model. */
export const seasonNote = (d: OpsDate) => {
  const n = d.weather.marsYearsEarlier
  if (n === 0) return 'That sol is the operations date itself.'
  return `That sol is our stand-in: the same Mars season, ${n} Mars year${n === 1 ? '' : 's'} before ${d.label}.`
}
