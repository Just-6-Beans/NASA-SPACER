// Builds data/nasa/ops-dates.json: the operations dates the rover planner offers.
// It reads only the two committed snapshots, so it runs offline: `npm run data:ops`.
//
// Real data: the one-way light time for each date (JPL Horizons) and one sol of Curiosity
// REMS weather at Gale Crater.
// Our model: REMS has no measurements for a future date, so each date borrows the sol that
// sits a whole number of Mars years earlier. That is the same season, not a forecast.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'nasa')
const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'))

// The dates on offer. Edit this list, run `npm run data:ops`, then retune `src/core/data.ts`.
const DATES = [
  { date: '2029-03-30', note: 'Closest approach in the 2026 to 2030 record' },
  { date: '2029-07-15', note: 'Mars pulling away' },
  { date: '2029-11-15', note: 'Almost three times farther' },
]

/** One Mars year, equinox to equinox, in Earth days. */
const MARS_YEAR_DAYS = 686.973
const DAY_MS = 86_400_000
/** How far to look for a neighbouring sol when the matched one has no temperature. */
const SEARCH_DAYS = 5
const iso = ms => new Date(ms).toISOString().slice(0, 10)

const geometry = read('earth-mars-geometry.json')
const weather = read('curiosity-weather.json')
const lightByDate = new Map(geometry.records.map(r => [r.date, r]))
const solByDate = new Map(weather.records.map(r => [r.earthDate, r]))
const lastMeasured = Date.parse(weather.records.at(-1).earthDate)

/** The measured sol a whole number of Mars years before `date`: same season, earlier year. */
function seasonMatch(date) {
  let ms = Date.parse(date)
  let marsYearsEarlier = 0
  while (ms > lastMeasured) { ms -= MARS_YEAR_DAYS * DAY_MS; marsYearsEarlier++ }
  const day = Math.round(ms / DAY_MS) * DAY_MS
  for (let step = 0; step <= SEARCH_DAYS; step++) {
    for (const side of step ? [1, -1] : [1]) {
      const sol = solByDate.get(iso(day + side * step * DAY_MS))
      if (sol && sol.minAirTemp !== null && sol.maxAirTemp !== null) return { marsYearsEarlier, sol }
    }
  }
  throw new Error(`No Curiosity sol with temperatures within ${SEARCH_DAYS} days of the season match for ${date}`)
}

const out = {
  about: 'Operations dates offered in the rover planner. Built by scripts/build-ops-dates.mjs from the two snapshots in this folder. Do not edit by hand.',
  lightTime: {
    source: geometry.source, provider: geometry.provider, query: geometry.query, retrieved: geometry.retrieved,
    units: { distanceAu: geometry.units.distanceAu, oneWayLightMinutes: geometry.units.oneWayLightMinutes },
    limits: 'Geometry only. It does not say whether a launch or a transfer is feasible.',
  },
  weather: {
    source: weather.source, provider: weather.provider, location: weather.location, retrieved: weather.retrieved,
    units: { airTemp: weather.units.airTemp, ls: weather.units.ls, sunrise: weather.units.sunrise, sunset: weather.units.sunset },
    limits: 'An outreach product, not calibrated science data. One place only: Gale Crater.',
    seasonMatch: `Each operations date borrows the Curiosity sol that falls a whole number of Mars years (${MARS_YEAR_DAYS} Earth days each) earlier, or the nearest sol with temperatures within ${SEARCH_DAYS} days. This stand-in is the game's model, not a NASA forecast.`,
  },
  dates: DATES.map(({ date, note }) => {
    const light = lightByDate.get(date)
    if (!light) throw new Error(`${date} is outside the Horizons snapshot`)
    const { marsYearsEarlier, sol } = seasonMatch(date)
    return {
      date, note,
      distanceAu: light.distanceAu,
      oneWayLightMinutes: light.oneWayLightMinutes,
      weather: {
        sol: sol.sol, earthDate: sol.earthDate, marsYearsEarlier, ls: sol.ls,
        minAirTemp: sol.minAirTemp, maxAirTemp: sol.maxAirTemp, sunrise: sol.sunrise, sunset: sol.sunset,
      },
    }
  }),
}

writeFileSync(join(dir, 'ops-dates.json'), JSON.stringify(out, null, 2) + '\n')
for (const d of out.dates) {
  console.log(`${d.date}: light ${d.oneWayLightMinutes.toFixed(2)} min | sol ${d.weather.sol} (${d.weather.earthDate}, Ls ${d.weather.ls}) air ${d.weather.minAirTemp} to ${d.weather.maxAirTemp} degC`)
}
