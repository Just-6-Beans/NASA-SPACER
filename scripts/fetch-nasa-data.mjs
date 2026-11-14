// Downloads NASA data and writes trimmed snapshots into data/nasa/.
// Run with `npm run data`. The game reads the committed snapshots and never calls these APIs at runtime.
// Add a new source here, then add it to the dataset table in ../CHALLENGE.md.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'nasa')
mkdirSync(out, { recursive: true })
const retrieved = new Date().toISOString().slice(0, 10)
const save = (name, value) => {
  writeFileSync(join(out, name), JSON.stringify(value) + '\n')
  console.log(`${name}: ${value.records.length} records`)
}
const get = async url => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} from ${url}`)
  return response
}
const number = value => (value === '--' || value === '' || value == null || Number.isNaN(Number(value)) ? null : Number(value))
const text = value => (value === '--' || value === '' || value == null ? null : value)

// Curiosity REMS daily weather at Gale Crater. An outreach product, not calibrated science data.
// Humidity, wind speed and wind direction are empty in every record, and atmo_opacity is always "Sunny", so they are dropped.
const REMS = 'https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json'
const rems = await (await get(REMS)).json()
save('curiosity-weather.json', {
  source: REMS,
  provider: 'NASA/JPL-Caltech and Centro de Astrobiologia (CSIC-INTA), Curiosity REMS outreach feed',
  location: 'Gale Crater, Mars (Curiosity rover)',
  retrieved,
  units: { airTemp: 'degC', groundTemp: 'degC', pressure: 'Pa', ls: 'solar longitude, degrees', sunrise: 'local Mars time', sunset: 'local Mars time' },
  records: rems.soles
    .map(day => ({
      sol: Number(day.sol), earthDate: day.terrestrial_date, ls: number(day.ls),
      minAirTemp: number(day.min_temp), maxAirTemp: number(day.max_temp),
      minGroundTemp: number(day.min_gts_temp), maxGroundTemp: number(day.max_gts_temp),
      pressure: number(day.pressure), uvIndex: text(day.local_uv_irradiance_index),
      sunrise: text(day.sunrise), sunset: text(day.sunset),
    }))
    .sort((a, b) => a.sol - b.sol),
})

// JPL Horizons: Mars as seen from Earth's centre, one row per day. Gives distance and one-way light time.
// Horizons gives geometry only. It does not say whether a launch or transfer is feasible.
const START = '2026-01-01', STOP = '2030-12-31'
const horizons = new URL('https://ssd.jpl.nasa.gov/api/horizons.api')
for (const [key, value] of Object.entries({
  format: 'text', COMMAND: "'499'", OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'",
  CENTER: "'500@399'", START_TIME: `'${START}'`, STOP_TIME: `'${STOP}'`, STEP_SIZE: "'1 d'",
  QUANTITIES: "'20,21'", CSV_FORMAT: "'YES'", CAL_FORMAT: "'CAL'",
})) horizons.searchParams.set(key, value)
const body = await (await get(horizons)).text()
const table = body.split('$$SOE')[1]?.split('$$EOE')[0]
if (!table) throw new Error(`Horizons returned no ephemeris table:\n${body.slice(0, 600)}`)
const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }
save('earth-mars-geometry.json', {
  source: 'https://ssd.jpl.nasa.gov/api/horizons.api',
  provider: 'NASA/JPL Solar System Dynamics, Horizons',
  query: `Mars (499) observed from Earth geocentre (500@399), ${START} to ${STOP}, 1-day step, quantities 20 and 21`,
  retrieved,
  units: { distanceAu: 'astronomical units', oneWayLightMinutes: 'minutes' },
  records: table.trim().split('\n').map(line => {
    // Columns: date, solar presence, lunar presence, distance (au), range rate (km/s), one-way light time (min).
    const cells = line.split(',').map(cell => cell.trim())
    const [year, month, day] = cells[0].split(' ')[0].split('-')
    return { date: `${year}-${MONTHS[month]}-${day}`, distanceAu: Number(cells[3]), oneWayLightMinutes: Number(cells[5]) }
  }),
})
