// The numbers the rover planner calls NASA data must be exactly what the snapshots say.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { OPS_DATES, SOURCES, formatDate, lightTimeSource, opsDate, seasonNote, weatherSource } from '../src/data/opsDates'

const load = (name: string) => JSON.parse(readFileSync(new URL(`../data/nasa/${name}`, import.meta.url), 'utf8'))
const geometry = load('earth-mars-geometry.json')
const weather = load('curiosity-weather.json')
const extract = load('ops-dates.json')
const MARS_YEAR_DAYS = 686.973
const days = (iso: string) => Date.parse(iso) / 86_400_000

test('every snapshot records its source, provider and retrieval date', () => {
  for (const meta of [geometry, weather, extract.lightTime, extract.weather]) {
    assert.match(meta.source, /^https:\/\/(ssd\.jpl\.nasa\.gov|mars\.nasa\.gov)\//)
    assert.ok(meta.provider.includes('NASA'))
    assert.match(meta.retrieved, /^\d{4}-\d{2}-\d{2}$/)
  }
  assert.equal(extract.lightTime.retrieved, geometry.retrieved)
  assert.equal(extract.weather.retrieved, weather.retrieved)
})

test('the Horizons snapshot holds the light times CHALLENGE.md quotes', () => {
  const sorted = [...geometry.records].sort((a, b) => a.oneWayLightMinutes - b.oneWayLightMinutes)
  assert.equal(sorted[0].date, '2029-03-30')
  assert.equal(sorted[0].oneWayLightMinutes.toFixed(1), '5.4')
  assert.equal(sorted.at(-1).date, '2030-06-29')
  assert.equal(sorted.at(-1).oneWayLightMinutes.toFixed(1), '21.2')
})

test('each operations date matches the snapshots it was built from', () => {
  assert.equal(extract.dates.length, 3)
  for (const d of extract.dates) {
    const light = geometry.records.find((r: { date: string }) => r.date === d.date)
    assert.ok(light, `${d.date} is in the Horizons snapshot`)
    assert.equal(d.oneWayLightMinutes, light.oneWayLightMinutes)
    assert.equal(d.distanceAu, light.distanceAu)
    const sol = weather.records.find((r: { sol: number }) => r.sol === d.weather.sol)
    assert.ok(sol, `sol ${d.weather.sol} is in the REMS snapshot`)
    for (const [ours, theirs] of [['earthDate', 'earthDate'], ['ls', 'ls'], ['minAirTemp', 'minAirTemp'], ['maxAirTemp', 'maxAirTemp'], ['sunrise', 'sunrise'], ['sunset', 'sunset']]) {
      assert.equal(d.weather[ours], sol[theirs], `${d.date} ${ours}`)
    }
    // Season match: the sol sits a whole number of Mars years before the operations date.
    assert.ok(d.weather.marsYearsEarlier >= 1)
    const drift = days(d.date) - days(sol.earthDate) - d.weather.marsYearsEarlier * MARS_YEAR_DAYS
    assert.ok(Math.abs(drift) <= 5.5, `${d.date} season match drifts ${drift.toFixed(1)} days`)
  }
})

test('the game reads the extract without changing it, except rounding light time to 0.1 min', () => {
  assert.deepEqual(OPS_DATES.map(d => d.id), ['2029-03-30', '2029-07-15', '2029-11-15'])
  assert.deepEqual(OPS_DATES.map(d => d.lightMin), [5.4, 10.4, 15.8])
  assert.deepEqual(OPS_DATES.map(d => d.weather.minAirTemp), [-79, -74, -66])
  for (const d of OPS_DATES) {
    const raw = extract.dates.find((x: { date: string }) => x.date === d.id)
    assert.ok(Math.abs(d.lightMin - raw.oneWayLightMinutes) <= 0.05)
    assert.deepEqual(d.weather, raw.weather)
  }
  assert.throws(() => opsDate('2031-01-01'))
})

test('the trade-off is in the data: every closer date has a colder night', () => {
  for (let i = 1; i < OPS_DATES.length; i++) {
    assert.ok(OPS_DATES[i].lightMin > OPS_DATES[i - 1].lightMin, 'dates run from near to far')
    assert.ok(OPS_DATES[i].weather.minAirTemp > OPS_DATES[i - 1].weather.minAirTemp, 'and from cold to warm')
  }
})

test('provenance lines name the dataset, the place and the date', () => {
  const d = opsDate('2029-03-30')
  assert.equal(formatDate('2029-03-30'), '30 Mar 2029')
  assert.equal(lightTimeSource(d), 'JPL Horizons, Earth to Mars, 30 Mar 2029')
  assert.equal(weatherSource(d), 'Curiosity REMS, Gale Crater, sol 4580 (25 Jun 2025)')
  assert.equal(seasonNote(d), 'That sol is our stand-in: the same Mars season, 2 Mars years before 30 Mar 2029.')
  assert.ok(SOURCES.weather.location.includes('Gale Crater'))
  assert.ok(SOURCES.weather.limits.includes('outreach'))
})
