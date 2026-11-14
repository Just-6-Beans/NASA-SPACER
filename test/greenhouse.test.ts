// The station greenhouse rules. These are the validation scenarios of the design reference
// (clear running, a light and dark orbit, an irrigation interruption, a long spell of low
// generation, a leaking compartment, harvest and reseeding, save and reload), plus the rule that
// one repaired system never restores another.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CROPS, crop, dli, type CropId } from '../src/core/crops'
import {
  BAY_IDS, BAY_PLAN, FAULT_KINDS, GH, Greenhouse, RATES, TIERS, dliBand, gasFactor, lightFactor, lightingKw, nutrientFactor, temperatureFactor, waterFactor,
  type AlertLevel, type BayId, type LoadId,
} from '../src/core/greenhouse'

const STEP = 0.25
const quiet = (seed = 1) => new Greenhouse({ seed, events: false })
/** Runs the module for `seconds`, calling `each` after every quarter second. */
function run(g: Greenhouse, seconds: number, each?: (g: Greenhouse) => void) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) { g.tick(STEP); each?.(g) }
}
/** Runs until `cond` holds and returns the seconds it took. */
function until(g: Greenhouse, cond: () => boolean, max = 400) {
  let s = 0
  while (!cond() && s < max) { g.tick(STEP); s += STEP }
  assert.ok(cond(), `expected within ${max} s`)
  return s
}
const stage = (g: Greenhouse, id: BayId) => g.bay(id).planting?.stage
const ready = (g: Greenhouse, ...ids: BayId[]) => ids.every(id => stage(g, id) === 'ready')
const alertOf = (g: Greenhouse, kind: string) => g.alerts.find(a => a.kind === kind)
const load = (g: Greenhouse, id: LoadId) => g.loads.find(l => l.id === id)!
const near = (a: number, b: number, eps: number, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} is within ${eps} of ${b}`)

/** Plays the module up to a tier the way a player would: store harvests, then process a staple. */
function reach(g: Greenhouse, tier: 2 | 3 | 4) {
  assert.equal(g.plant('A1', 'lettuce'), null)
  assert.equal(g.plant('A2', 'radish'), null)
  until(g, () => ready(g, 'A1', 'A2'))
  assert.equal(g.harvest('A1', 'whole'), null)
  assert.equal(g.harvest('A2'), null)
  assert.equal(g.unlock(), null)
  if (tier === 2) return
  for (const [bay, id] of [['A1', 'lettuce'], ['A2', 'radish'], ['B1', 'mizuna']] as [BayId, CropId][]) assert.equal(g.plant(bay, id), null)
  until(g, () => ready(g, 'A1', 'A2', 'B1'))
  for (const bay of ['A1', 'A2', 'B1'] as BayId[]) assert.equal(g.harvest(bay, 'whole'), null)
  assert.equal(g.unlock(), null)
  if (tier === 3) return
  g.ec = GH.ec; g.ph = GH.ph
  assert.equal(g.plant('A3', 'potato'), null)
  until(g, () => ready(g, 'A3'))
  assert.equal(g.harvest('A3'), null)
  assert.equal(g.process('potato'), null)
  until(g, () => g.staplesProcessed === 1, 30)
  assert.equal(g.unlock(), null)
  g.ec = GH.ec; g.ph = GH.ph
}

/** A rough operator, for the long mixed runs: harvests, replants, and tries every repair now and then. */
function operate(g: Greenhouse, seconds: number, each?: (g: Greenhouse, s: number) => void) {
  for (let s = 0; s < seconds; s++) {
    g.tick(1, { crewInside: s % 50 < 25 })
    for (const b of g.bays) {
      const p = b.planting
      if (!p) continue
      if (p.needsPollination) g.pollinate(b.id)
      if (p.stage === 'ready') g.harvest(b.id)
      else if (p.stage === 'dead' || p.spent) g.clear(b.id)
    }
    for (const b of g.bays) {
      if (!b.unlocked || b.planting) continue
      const id = g.cropsOpen().find(c => crop(c).bay === b.kind && g.inventory.seeds[c] > 0)
      if (id) g.plant(b.id, id)
    }
    for (const c of CROPS) if (g.inventory.raw[c.id] > 0) g.process(c.id)
    if (s === 200) g.flush()
    if (s === 400) g.requestMakeup()
    if (s % 97 === 0) g.unlock()
    if (s % 60 === 30) for (const a of g.alerts) g.diagnose(a.id)
    if (s % 60 === 45) {
      for (const what of ['pumpA', 'pumpB', 'dehumidifier', 'thermal', 'array', 'seal'] as const) g.repair(what)
      for (const b of g.bays) { g.clearLine(b.id); if (b.contamination > 0.05) g.treat(b.id) }
      if (g.ph > 6.4) g.dose('phDown')
      if (g.ph < 5.6) g.dose('phUp')
      if (g.ec < 1.3) g.dose('nutrient')
    }
    each?.(g, s)
  }
}

// ------------------------------------------------------------------ Clear running
test('before the first crop nothing drifts and nothing fails', () => {
  const g = new Greenhouse({ seed: 3 })
  assert.equal(g.commissioned, false)
  assert.equal(g.attempted, false)
  g.tick(300)
  assert.equal(g.t, 300)
  assert.equal(g.ec, GH.ec)
  assert.equal(g.ph, GH.ph)
  assert.equal(g.tankL, GH.tankL)
  near(g.batteryPct, 82, 1e-9, 'battery')
  assert.equal(g.alerts.length, 0)
  assert.equal(g.activeFaults().length, 0)
  assert.equal(g.score().total, 0)
  // the starter readings are the game presets, and all of them read as fine
  const r = g.readings()
  assert.deepEqual([r.temp.value, r.rh.value, r.pressure.value, r.o2.value, r.co2.value, r.ph.value, r.ec.value, r.rootTemp.value, r.tank.value], [22, 60, 101, 21, 1000, 6, 1.6, 20, 650])
  for (const x of Object.values(r)) assert.equal(x.status, 'ok', x.label)
  assert.equal(Object.keys(r).length, 11)
})

test('clear running: lettuce is ready in about 30 crop days, healthy, with no alerts', () => {
  const g = quiet()
  assert.equal(g.inventory.seeds.lettuce, GH.startSeeds)
  assert.equal(g.plant('A1', 'lettuce'), null)
  assert.equal(g.inventory.seeds.lettuce, GH.startSeeds - 1)
  assert.ok(g.commissioned && g.attempted && !g.complete)
  const seen: string[] = []
  run(g, 29, () => { const s = stage(g, 'A1')!; if (seen[seen.length - 1] !== s) seen.push(s) })
  assert.deepEqual(seen, ['seed', 'germination', 'seedling', 'vegetative'], 'a leaf crop never flowers on the way to harvest')
  assert.ok(g.secondsToHarvest('A1')! > 0 && g.secondsToHarvest('A1')! <= 1.5)
  run(g, 2)
  const p = g.bay('A1').planting!
  assert.equal(p.stage, 'ready')
  near(p.ageDays, crop('lettuce').timerDays, 0.01, 'crop days')
  assert.equal(p.progress, 1)
  assert.equal(g.secondsToHarvest('A1'), 0)
  assert.ok(p.health >= 95)
  assert.equal(p.symptom, 'none')
  assert.equal(g.alerts.length, 0)
  assert.equal(g.summary().ready, 1)
  // a crop waits at harvest-ready: the cooldown is the wait, not a deadline. A ripe crop takes
  // almost nothing from the solution, so a module left alone for minutes does not starve it.
  const ec = g.ec, ph = g.ph
  run(g, 300)
  assert.equal(stage(g, 'A1'), 'ready')
  assert.equal(g.bay('A1').planting!.ageDays, p.ageDays)
  assert.deepEqual([g.ec, g.ph], [ec, ph])
  assert.equal(g.bay('A1').planting!.health, 100)
  assert.equal(g.alerts.length, 0)
  // the same with the schedule on and nobody on deck
  const away = new Greenhouse({ seed: 6 })
  away.plant('A1', 'lettuce'); away.plant('A2', 'radish'); away.plant('A3', 'tomato')
  for (let s = 0; s < 480; s++) away.tick(1, { quiet: true })
  assert.ok(ready(away, 'A1', 'A2', 'A3'))
  assert.equal(away.plantsLost, 0)
  assert.equal(away.alerts.length, 0)
  for (const id of ['A1', 'A2', 'A3'] as BayId[]) assert.equal(away.bay(id).planting!.health, 100)
})

test('growth is the product of five factors, each from a band', () => {
  const lettuce = crop('lettuce'), tomato = crop('tomato'), potato = crop('potato')
  // temperature: 1 well inside the band, 0.9 at its edges, 0 at 8 °C outside
  assert.equal(temperatureFactor(lettuce, 22), 1)
  near(temperatureFactor(tomato, 22), 0.9, 1e-9)
  near(temperatureFactor(potato, 22), 0.9, 1e-9)
  assert.equal(temperatureFactor(tomato, 23), 1)
  near(temperatureFactor(lettuce, 28), 0.45, 1e-9)
  assert.equal(temperatureFactor(lettuce, 32), 0)
  assert.equal(temperatureFactor(lettuce, 9), 0)
  // light: from the daily light integral against the band at 16 hours
  assert.deepEqual(dliBand(lettuce).map(v => Math.round(v * 100) / 100), [11.52, 17.28])
  assert.equal(lightFactor(lettuce, 0), 0)
  near(lightFactor(lettuce, 5.76), 0.5, 1e-9)
  assert.equal(lightFactor(lettuce, dli(250, 16)), 1)
  near(lightFactor(lettuce, 17.28 * 2), 0.7, 1e-9)
  // water: full from 55 % root-zone water, nothing at 15 %
  assert.equal(waterFactor(0.9), 1)
  near(waterFactor(0.35), 0.5, 1e-9)
  assert.equal(waterFactor(0.1), 0)
  // nutrient: the worst of pH, conductivity, balance, root temperature and contamination
  assert.equal(nutrientFactor(lettuce, 6, 1.6, 1, 20, 0), 1)
  near(nutrientFactor(lettuce, 7.5, 1.6, 1, 20, 0), 0.2, 1e-9)
  near(nutrientFactor(lettuce, 6, 3.2, 1, 20, 0), 0.3, 1e-9)
  assert.equal(nutrientFactor(tomato, 6, 1.3, 1, 20, 0) < 1, true, 'fruiting crops want more than leaf crops')
  assert.equal(nutrientFactor(lettuce, 6, 1.3, 1, 20, 0), 1)
  near(nutrientFactor(lettuce, 6, 1.6, 0.35, 20, 0), 0.4 + 0.6 * (0.35 / 0.85), 1e-9)
  near(nutrientFactor(lettuce, 6, 1.6, 1, 20, 1), 0.2, 1e-9)
  // gas: CO2, oxygen and pressure
  assert.equal(gasFactor(1000, 21, 101), 1)
  near(gasFactor(400, 21, 101), 0.8, 1e-9)
  near(gasFactor(200, 21, 101), 0.2, 1e-9)
  near(gasFactor(1000, 21, 45), 0.5, 1e-9)
  // one shared air temperature is a compromise between crops: 22 °C suits leaves, 23 °C suits the starter three
  const g = quiet()
  g.plant('A1', 'lettuce'); g.plant('A3', 'tomato')
  run(g, 5)
  assert.equal(g.bay('A1').planting!.factors.temperature, 1)
  near(g.bay('A3').planting!.factors.temperature, 0.9, 1e-6)
  assert.equal(g.bay('A3').planting!.limiting, 'temperature')
  assert.equal(g.setRecipe({ tempLitC: 23 }), null)
  run(g, 40)
  near(g.tempC, 23, 0.05, 'air follows the setpoint')
  near(g.bay('A3').planting!.factors.temperature, 1, 0.005)
  assert.equal(g.bay('A1').planting!.factors.temperature, 1)
  assert.equal(g.bay('A3').planting!.limiting, null)
})

// ------------------------------------------------------------------ Light and energy
test('light and energy arithmetic: 14.4 mol/m²/day, 3.33 kW for 40 m², 53.3 kWh over 16 hours', () => {
  assert.equal(dli(250, 16), 14.4)
  near(lightingKw(250, 40), 3.3333, 1e-3)
  near(lightingKw(250, 40) * 16, 53.33, 0.01)
  const g = quiet()
  g.plant('A1', 'lettuce')
  assert.equal(g.bay('A1').ppfd, 250)
  assert.equal(g.dliOf('A1'), 14.4)
  near(load(g, 'lightsA').kw, lightingKw(250, 4.8) * (16 / 24), 1e-9, 'the fixtures draw their rated power for the lit hours')
  // energy is power times time, on the station's 30× clock
  const before = g.batteryKwh, net = g.generationKw - g.loadKw
  near(g.generationKw, GH.arrayKw, 1e-9)
  run(g, 10)
  near(g.batteryKwh - before, (net * 10 * GH.stationRate) / 3600, 1e-9, 'kWh gained')
  // a shorter photoperiod saves power and costs light
  assert.equal(g.setRecipe({ photoperiodH: 12 }), null)
  near(g.dliOf('A1'), 10.8, 1e-9)
  near(load(g, 'lightsA').kw, lightingKw(250, 4.8) * 0.5, 1e-9)
  run(g, 1)
  near(g.bay('A1').planting!.factors.light, 10.8 / 11.52, 1e-9)
  assert.equal(g.bay('A1').planting!.limiting, 'light')
  // which more light at the canopy makes up for
  assert.equal(g.setLight('A1', 300), null)
  run(g, 1)
  assert.equal(g.bay('A1').planting!.factors.light, 1)
  assert.match(g.setLight('A1', 20)!, /50 to 1,000/)
  assert.match(g.setRecipe({ photoperiodH: 30 })!, /Photoperiod/)
  assert.match(g.setRecipe({ tempLitC: 45 })!, /temperature/i)
  assert.equal(g.recipe.photoperiodH, 12, 'a refused recipe changes nothing')
})

test('one orbit: the battery falls in eclipse and recovers in the sun', () => {
  const g = quiet()
  g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato')
  run(g, 100)
  assert.ok(g.exterior.sunlit)
  near(g.batteryPct, 100, 1e-6, 'full by the end of the day side')
  assert.equal(g.exterior.orbit, 1)
  near(g.exterior.nextChange, GH.sunlitShare * GH.orbitSeconds - GH.orbitOffset - 100, 0.3, 'seconds to sunset')
  let low = 100, dark = 0
  run(g, 78, () => { low = Math.min(low, g.batteryPct); if (!g.exterior.sunlit) { dark += STEP; assert.equal(g.generationKw, 0) } })
  near(dark, (1 - GH.sunlitShare) * GH.orbitSeconds, 0.5, 'eclipse seconds')
  assert.ok(low < 90 && low > 60, `battery bottomed at ${low.toFixed(1)} %`)
  assert.equal(g.exterior.orbit, 2)
  assert.ok(g.exterior.sunlit)
  assert.ok(g.enduranceH === null, 'charging')
  run(g, 60)
  near(g.batteryPct, 100, 1e-6, 'recharged')
  assert.equal(g.alerts.length, 0)
  // the deck can hand the module the orbit phase its windows show
  g.tick(1, { orbitPhase: 0.8 })
  assert.equal(g.exterior.sunlit, false)
  assert.equal(g.generationKw, 0)
  assert.ok(g.enduranceH! > 0)
  g.tick(1, { orbitPhase: 0.3 })
  near(g.generationKw, GH.arrayKw, 1e-9)
  // dimming the lights in eclipse spares the battery and costs a little light
  const h = quiet()
  h.plant('A1', 'lettuce')
  assert.equal(h.setRecipe({ eclipseDim: true }), null)
  h.tick(1, { orbitPhase: 0.8 })
  assert.equal(h.bay('A1').lit, 0.5)
  near(load(h, 'lightsA').kw, (lightingKw(250, 4.8) * (16 / 24)) / 2, 1e-9)
  near(h.dliOf('A1'), 14.4 * (1 - 0.5 * (1 - GH.sunlitShare)), 1e-9)
})

// ------------------------------------------------------------------ Irrigation interruption
test('irrigation interruption: the flow alert comes first, then stress, then wilting, then death', () => {
  const g = quiet()
  g.plant('A1', 'lettuce')
  run(g, 31)
  assert.equal(g.bay('A1').flow, 1)
  assert.ok(g.bay('A1').moisture > 0.9)
  assert.equal(g.inject('irrigation', 'A1'), null)
  // the alert is there before any plant shows anything, and says what is known and what to do
  const al = alertOf(g, 'irrigation')!
  assert.equal(al.level, 'warning')
  assert.equal(al.title, 'Bay A1 irrigation')
  assert.equal(al.bay, 'A1')
  assert.equal(al.problem, 'Bay A1 irrigation flow low. Reservoir is adequate.')
  assert.equal(al.action, 'Inspect pump or blocked line.')
  assert.equal(al.cause, null)
  const at: Record<string, number> = {}
  const levels: AlertLevel[] = ['warning']
  const t0 = g.t
  run(g, 120, () => {
    const p = g.bay('A1').planting!, mark = (k: string, c: boolean) => { if (c && at[k] === undefined) at[k] = g.t - t0 }
    mark('dry', g.bay('A1').moisture < 0.6)
    mark('factor', p.factors.water < 0.75)
    mark('stress', p.stress > 0)
    mark('wilt', p.symptom === 'wilt')
    mark('harm', p.health < 100)
    mark('dead', p.stage === 'dead')
    const lv = alertOf(g, 'irrigation')?.level
    if (lv && levels[levels.length - 1] !== lv) levels.push(lv)
  })
  assert.equal(g.bay('A1').flow, 0)
  assert.ok(at.dry > 9 && at.dry < 16, `root zone at 60 % after ${at.dry} s`)
  assert.ok(at.factor > 15 && at.factor < 25, `growth cut after ${at.factor} s`)
  assert.ok(at.stress >= at.factor)
  assert.ok(at.wilt > 28 && at.wilt < 40, `wilting after ${at.wilt} s`)
  assert.ok(at.harm > 35 && at.harm < 48, `health falling after ${at.harm} s`)
  assert.ok(at.dead > 78 && at.dead < 105, `dead after ${at.dead} s`)
  assert.ok(at.dry < at.factor && at.factor < at.wilt && at.wilt < at.harm && at.harm < at.dead)
  assert.deepEqual(levels, ['warning', 'degraded', 'damage'])
  assert.match(alertOf(g, 'irrigation')!.trend, /No living crop/)
  assert.equal(g.plantsLost, 1)
  assert.match(g.log[g.log.length - 2].text, /lettuce died of water stress/)
  // a repaired line does not bring a dead plant back
  assert.equal(g.clearLine('A1'), null)
  run(g, RATES.job.clearLine + 1)
  assert.equal(g.bay('A1').flow, 1)
  run(g, 30)
  assert.equal(stage(g, 'A1'), 'dead')
  assert.equal(g.bay('A1').planting!.health, 0)
  assert.equal(alertOf(g, 'irrigation'), undefined, 'the failure is over')
  assert.match(alertOf(g, 'crop')!.action, /Clear the bay/)
  assert.match(g.plant('A1', 'lettuce')!, /Clear bay A1 first/)
  assert.match(g.harvest('A1')!, /dead/)
  assert.equal(g.clear('A1'), null)
  assert.equal(alertOf(g, 'crop'), undefined)
  assert.equal(g.plant('A1', 'lettuce'), null)
})

test('a pump repaired in time: flow returns, the plants recover, and nothing else is fixed for free', () => {
  const g = quiet()
  g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato')
  run(g, 31)
  g.ec = 0.5 // an unrelated problem: the solution is thin
  assert.equal(g.inject('irrigation', 'A'), null)
  const al = alertOf(g, 'irrigation')!
  assert.equal(al.title, 'Loop A irrigation')
  assert.match(al.problem, /Loop A irrigation flow low \(bays A1 to A4\)\. Reservoir is adequate\./)
  for (const id of ['A1', 'A2', 'A3'] as BayId[]) assert.equal(g.bay(id).flow, 0)
  assert.equal(load(g, 'pumps').kw, 0, 'a stopped pump draws nothing')
  // guessing wrong costs nothing but says so; diagnosing names the cause
  assert.equal(g.repair('pumpB'), 'Pump B is healthy.')
  assert.match(g.clearLine('A1')!, /is clear/)
  assert.equal(g.diagnose(al.id), null)
  assert.match(g.diagnose(al.id)!, /under way/)
  assert.equal(g.jobs.length, 1)
  run(g, RATES.job.diagnoseFlow + 0.5)
  assert.ok(al.diagnosed)
  assert.match(al.cause!, /Pump A has stopped/)
  assert.match(g.diagnose(al.id)!, /Already diagnosed/)
  run(g, 20)
  assert.match(al.trend, /Root-zone water \d+ % and falling in bay A\d/)
  assert.equal(al.level, 'degraded')
  assert.ok(g.bay('A1').planting!.stress > 0)
  assert.equal(g.repair('pumpA'), null)
  assert.match(g.repair('pumpA')!, /already under way/)
  run(g, RATES.job.pump + 0.5)
  assert.equal(g.bay('A1').flow, 1)
  assert.equal(al.level, 'recovery')
  assert.match(al.action, /Fixed/)
  run(g, 6)
  assert.ok(g.bay('A1').moisture > 0.9, 'the root zone refills in about five seconds')
  assert.equal(g.bay('A1').planting!.factors.water, 1)
  assert.ok(g.bay('A1').planting!.stage !== 'dead')
  // the thin solution is still thin, and still holding the plants back
  assert.ok(g.ec < 0.75)
  assert.ok(g.bay('A1').planting!.factors.nutrient < 0.75)
  assert.equal(g.bay('A1').planting!.limiting, 'nutrient')
  // the irrigation alert lets go once the plants are troubled by something else; a crop alert names it
  until(g, () => !alertOf(g, 'irrigation') && !!alertOf(g, 'crop'), 30)
  run(g, 2)
  const crops = g.alerts.filter(a => a.kind === 'crop')
  assert.equal(crops.length, 1, 'one alert speaks for every bay with the same trouble')
  assert.equal(crops[0].factor, 'nutrient')
  assert.match(crops[0].problem, /taking up nutrients poorly: pH [\d.]+, conductivity 0\.\d mS\/cm\. The same shows in 2 other bays/)
  assert.match(crops[0].action, /Inspect pH, conductivity and nutrient balance/)
  // doses are the fix for that one
  for (let i = 0; i < 3; i++) assert.equal(g.dose('nutrient'), null)
  run(g, 60)
  assert.equal(g.alerts.length, 0)
  assert.equal(g.plantsLost, 0)
  // left thin, the solution would have cost the tomato, pump or no pump
  const h = quiet()
  h.plant('A3', 'tomato')
  run(h, 31)
  h.ec = 0.5
  until(h, () => stage(h, 'A3') === 'dead', 200)
  assert.match(h.log[h.log.length - 2].text, /died of a nutrient problem/)
})

// ------------------------------------------------------------------ Low generation
test('low generation over several orbits: the battery drains, loads are shed from the end of the list, controls never', () => {
  const g = quiet()
  g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato')
  for (const id of ['A1', 'A2', 'A3'] as BayId[]) assert.equal(g.setLight(id, 1000), null) // a heavy lighting load
  assert.equal(g.inject('arrayFeather'), null)
  assert.equal(g.exterior.arrayState, 'feathered')
  assert.equal(g.exterior.arrayHealth, RATES.featherHealth)
  near(g.generationKw, GH.arrayKw * RATES.featherHealth, 1e-9)
  assert.match(alertOf(g, 'arrayFeather')!.action, /Switch off optional loads/)
  assert.match(g.repair('array')!, /tracks again by itself/)
  run(g, RATES.featherSeconds + 1)
  assert.ok(g.batteryPct < 40, `battery ${g.batteryPct.toFixed(0)} % after the feather`)
  // a string that does not reconnect keeps the output low until someone resets it
  if (!g.activeFaults().some(f => f.kind === 'arrayString')) assert.equal(g.inject('arrayString'), null)
  run(g, 0.5)
  assert.equal(g.exterior.arrayState, 'string offline')
  assert.equal(g.exterior.arrayHealth, RATES.stringHealth)
  const firstShed: Partial<Record<LoadId, number>> = {}
  let empty = 0, blackout = false, restored = false
  run(g, 3 * GH.orbitSeconds, () => {
    if (g.batteryKwh === 0) empty++
    for (const l of g.loads) if (l.shed && firstShed[l.id] === undefined) firstShed[l.id] = g.t
    assert.equal(load(g, 'controls').shed, false)
    near(load(g, 'controls').kw, GH.loadKw.controls, 1e-9)
    if (load(g, 'lightsA').shed) { blackout = true; assert.equal(g.bay('A1').lit, 0); assert.equal(load(g, 'lightsA').kw, 0) }
    if (blackout && !g.loads.some(l => l.shed) && g.batteryPct > 10) restored = true
  })
  assert.ok(empty > 0, 'the battery ran flat')
  assert.ok(blackout && restored, 'loads were shed, and came back once the battery passed 10 %')
  const order = (['lightsA', 'thermal', 'pumps', 'air'] as LoadId[]).map(id => firstShed[id]!)
  assert.ok(order.every(t => t !== undefined), 'in eclipse with a flat battery everything but the controls goes')
  assert.ok(order[0] <= order[1] && order[1] <= order[2] && order[2] <= order[3], 'last in the priority list is shed first')
  assert.equal(firstShed.controls, undefined)
  assert.ok(alertOf(g, 'arrayString'))
  // resetting the string restores the array, not the plants
  assert.equal(g.repair('array'), null)
  run(g, RATES.job.array + 0.5)
  assert.equal(g.exterior.arrayHealth, 1)
  assert.equal(g.exterior.arrayState, 'tracking')
  assert.equal(g.repair('array'), 'The array is healthy.')
})

test('power choices: the shedding order, switching loads off, and the station tie', () => {
  const g = quiet()
  g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato')
  for (const id of ['A1', 'A2', 'A3'] as BayId[]) g.setLight(id, 1000)
  assert.deepEqual(g.priority, ['controls', 'air', 'pumps', 'thermal', 'lightsA', 'lightsB', 'processor'])
  assert.match(g.movePriority('controls', 1)!, /always come first/)
  assert.match(g.movePriority('air', -1)!, /Only the controls/)
  assert.match(g.movePriority('processor', 1)!, /first to be shed/)
  assert.equal(g.movePriority('lightsA', -1), null)
  assert.deepEqual(g.priority.slice(3, 5), ['lightsA', 'thermal'])
  assert.match(g.setLoadOn('controls', false)!, /stay on/)
  // a flat battery in eclipse, with the lights now protected ahead of the thermal unit
  g.batteryKwh = 0.01
  g.tick(2, { orbitPhase: 0.8 })
  assert.equal(g.batteryKwh, 0)
  assert.ok(load(g, 'thermal').shed && load(g, 'lightsA').shed, 'with no generation at all, both go')
  // in a dim sun the controller sheds only what it must, starting from the end of the list
  const dimSun = (protectLights: boolean) => {
    const m = quiet()
    m.plant('A1', 'lettuce')
    if (protectLights) m.movePriority('lightsA', -1)
    m.inject('arrayFeather')
    m.batteryKwh = 0
    m.tick(STEP, { orbitPhase: 0.3 })
    near(m.generationKw, GH.arrayKw * RATES.featherHealth, 1e-9)
    assert.equal(m.loads.some(l => l.shed), false, 'a quarter of the array still carries one bay at its usual light')
    m.setLight('A1', 1000) // now the loads ask for a little more than the array gives
    m.batteryKwh = 0
    m.tick(STEP, { orbitPhase: 0.3 })
    assert.ok(m.loadKw <= m.generationKw)
    return m
  }
  const usual = dimSun(false), h = dimSun(true)
  assert.deepEqual(usual.loads.filter(l => l.shed).map(l => l.id), ['lightsA'], 'the lights go first')
  assert.deepEqual(h.loads.filter(l => l.shed).map(l => l.id), ['thermal'], 'unless they are protected ahead of the thermal unit')
  assert.equal(usual.bay('A1').lit, 0)
  assert.equal(h.bay('A1').lit, 1)
  // switching a load off by hand is the cheaper way
  assert.equal(h.setLoadOn('lightsA', false), null)
  assert.equal(load(h, 'lightsA').kw, 0)
  assert.equal(h.bay('A1').lit, 0)
  h.tick(1, { orbitPhase: 0.3 })
  assert.equal(h.bay('A1').planting!.factors.light, 0)
  assert.equal(alertOf(h, 'arrayFeather')!.level, 'degraded')
  // the station tie: more power for a while, a limited number of times
  const a = quiet(), b = quiet()
  for (const x of [a, b]) { x.plant('A1', 'lettuce'); x.setLight('A1', 1000); x.inject('arrayFeather'); x.tick(20, { orbitPhase: 0.8 }) }
  assert.ok(a.batteryPct < 82)
  assert.equal(a.useBackup(), null)
  assert.match(a.useBackup()!, /already tied in/)
  a.tick(1, { orbitPhase: 0.8 }); b.tick(1, { orbitPhase: 0.8 })
  near(a.generationKw - b.generationKw, GH.backupKw, 1e-9)
  a.tick(29, { orbitPhase: 0.8 }); b.tick(29, { orbitPhase: 0.8 })
  assert.ok(a.batteryKwh > b.batteryKwh + 0.4, 'the tie helps')
  a.tick(GH.backupSeconds, { orbitPhase: 0.8 })
  assert.equal(a.backupLeft, 0)
  assert.equal(a.useBackup(), null)
  a.tick(GH.backupSeconds + 1, { orbitPhase: 0.8 })
  assert.match(a.useBackup()!, /cannot spare more/)
  assert.equal(a.backupUsesLeft, 0)
  // a low battery raises its own alert, with the energy sum in it
  assert.equal(alertOf(a, 'battery'), undefined)
  a.batteryKwh = 1
  a.tick(2, { orbitPhase: 0.8 })
  assert.ok(a.batteryPct < 20)
  const low = alertOf(a, 'battery')!
  assert.equal(low.level, 'warning')
  assert.match(low.problem, /Battery at \d+ %\. Generation [\d.]+ kW, load [\d.]+ kW\./)
  assert.match(low.trend, /Falling; about [\d.]+ station hours left at this draw/)
  near(a.enduranceH!, a.batteryKwh / (a.loadKw - a.generationKw), 1e-9)
})

// ------------------------------------------------------------------ Pressure leak
test('a leak: the reserve falls first, then locate, close, repair and reopen', () => {
  const g = quiet()
  g.plant('A1', 'lettuce')
  run(g, 5)
  assert.equal(g.inject('leak'), null)
  const al = alertOf(g, 'leak')!
  assert.equal(al.level, 'warning')
  assert.equal(al.action, 'Locate the leak.')
  run(g, 10)
  near(g.reserveKg, GH.reserveKg - 10 * RATES.leakKgps, 0.3, 'reserve')
  assert.ok(g.pressureKpa < 100.6 && g.pressureKpa > 99.8, `pressure holds near ${g.pressureKpa.toFixed(2)} kPa while the reserve lasts`)
  assert.equal(g.readings().pressure.status, 'warn', 'the slight droop is the clue')
  assert.ok(g.readings().reserve.trend < -20, 'kilograms a minute')
  assert.match(al.trend, /Pressure 100(\.\d)? kPa; reserve [\d.]+ kg and falling/)
  // nothing can be closed or repaired until the leak is found
  assert.match(g.closeCompartment(true)!, /Locate the leak first/)
  assert.match(g.repair('seal')!, /Locate the leak first/)
  assert.equal(g.diagnose(al.id), null)
  assert.equal(g.jobs[0].label, 'Locate the leak')
  run(g, RATES.job.diagnoseLeak + 0.5)
  assert.match(al.cause!, /^Leak located at /)
  assert.equal(al.action, 'Close the compartment, then repair the seal.')
  // closing the compartment stops the loss at once, and the regulator brings the pressure back to its setpoint
  assert.equal(g.closeCompartment(true), null)
  assert.equal(al.action, 'Compartment closed: repair the seal, then open it again.')
  const atClosing = g.reserveKg
  run(g, 10)
  near(g.pressureKpa, GH.pressureKpa, 0.01, 'pressure')
  near(atClosing - g.reserveKg, (1 / GH.pressureKpa) * GH.airKg, 0.1, 'only the kilogram or so that the droop had cost')
  const held = g.reserveKg
  run(g, 10)
  assert.equal(g.reserveKg, held, 'nothing is lost while it is closed')
  assert.equal(g.repair('seal'), null)
  run(g, RATES.job.seal + 0.5)
  assert.ok(alertOf(g, 'leak'), 'repaired but still closed: not over yet')
  assert.equal(al.action, 'Seal repaired: open the compartment.')
  assert.equal(g.repair('seal'), 'No leak has been found.')
  // opening it again costs the air that fills it
  assert.equal(g.closeCompartment(false), null)
  near(g.reserveKg, held - RATES.repressKg, 1e-9)
  run(g, 5)
  assert.equal(alertOf(g, 'leak'), undefined)
  near(g.pressureKpa, GH.pressureKpa, 0.01)
  near(g.reserveKg, held - RATES.repressKg, 1e-9, 'and nothing more: the seal holds')
  assert.equal(g.closeCompartment(true), 'There is no leak to close off.')
  // opening before the repair would have let the leak go on
  const early = quiet()
  early.plant('A1', 'lettuce')
  early.inject('leak')
  early.diagnose(alertOf(early, 'leak')!.id)
  run(early, RATES.job.diagnoseLeak + 0.5)
  early.closeCompartment(true)
  early.closeCompartment(false)
  const then = early.reserveKg
  run(early, 10)
  assert.ok(early.reserveKg < then - 4)
  assert.ok(alertOf(early, 'leak'))
  assert.equal(g.plantsLost, 0)
})

test('a leak left alone: pressure holds until the reserve is empty, then falls slowly, never in a jump', () => {
  const g = quiet()
  g.plant('A1', 'lettuce')
  run(g, 31)
  g.inject('leak')
  const emptyAfter = until(g, () => g.reserveKg === 0, 120)
  assert.ok(emptyAfter > 70 && emptyAfter < 90, `reserve empty after ${emptyAfter} s`)
  assert.ok(g.pressureKpa > 99.5, 'held until then')
  let worstStep = 0, last = g.pressureKpa
  run(g, 100, () => { worstStep = Math.max(worstStep, last - g.pressureKpa); last = g.pressureKpa })
  assert.ok(worstStep < 0.1, `largest drop in a quarter second: ${worstStep.toFixed(3)} kPa`)
  assert.ok(g.pressureKpa < 75 && g.pressureKpa > 60, `pressure ${g.pressureKpa.toFixed(1)} kPa after 100 s without reserve`)
  assert.equal(alertOf(g, 'leak')!.level, 'degraded')
  assert.match(alertOf(g, 'leak')!.problem, /reserve is empty and the pressure is falling/)
  assert.equal(stage(g, 'A1'), 'ready', 'decompression does not kill at once')
  // far enough down, the plants do suffer, slowly
  run(g, 250)
  assert.ok(g.pressureKpa < 45)
  assert.ok(g.bay('A1').planting!.factors.gas < 0.5)
  assert.equal(alertOf(g, 'leak')!.level, 'damage')
})

// ------------------------------------------------------------------ Contamination, humidity, climate, air, radiation
test('root contamination spreads through a loop unless the bay is isolated, and treatment needs sanitiser', () => {
  const g = quiet()
  g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato')
  run(g, 10)
  assert.equal(g.inject('contamination', 'A1'), null)
  assert.match(alertOf(g, 'contamination')!.problem, /loop A, first seen in bay A1/)
  run(g, 30)
  assert.ok(g.bay('A1').contamination > 0.9)
  const spread = g.bays.filter(b => b.id !== 'A1' && b.contamination > 0).map(b => b.id)
  assert.ok(spread.length >= 1, 'it travelled with the shared solution')
  assert.ok(spread.every(id => id.startsWith('A')))
  assert.ok(g.bay('A1').planting!.factors.nutrient < 0.3)
  assert.match(alertOf(g, 'contamination')!.trend, /bays? affected \(A1/)
  // treating takes time and a dose each; the outbreak is over when every bay is clean
  assert.match(g.treat('B1')!, /not contaminated/)
  const sick = g.bays.filter(b => b.contamination > 0.05).map(b => b.id)
  for (const id of sick) { assert.equal(g.isolate(id, true), null); assert.equal(g.treat(id), null) }
  assert.equal(g.inventory.sanitizer, GH.sanitizer - sick.length)
  assert.match(g.treat('A1')!, /already being treated/)
  run(g, RATES.job.treat + 1)
  for (const b of g.bays) assert.equal(b.contamination, 0, b.id)
  for (const id of sick) g.isolate(id, false)
  run(g, 1)
  assert.equal(alertOf(g, 'contamination')!.level, 'recovery')
  run(g, 60)
  assert.equal(alertOf(g, 'contamination'), undefined)
  assert.equal(g.plantsLost, 0)

  // the same outbreak, with the first bay isolated at once: it stays where it started
  const h = quiet()
  h.plant('A1', 'lettuce'); h.plant('A2', 'radish'); h.plant('A3', 'tomato')
  run(h, 10)
  h.inject('contamination', 'A1')
  assert.equal(h.isolate('A1', true), null)
  run(h, 60)
  assert.equal(h.bay('A2').contamination, 0)
  assert.equal(h.bay('A3').contamination, 0)
  assert.equal(h.bay('A1').flow, 0, 'an isolated bay is cut from the loop and lives on what it holds')
  assert.ok(h.bay('A1').moisture < 0.8 && h.bay('A1').moisture > 0.3)
  assert.ok(h.bay('A2').moisture > 0.9)
  // with no sanitiser left there is no treating
  h.inventory.sanitizer = 0
  assert.match(h.treat('A1')!, /No sanitiser left/)
  assert.match(new Greenhouse({ events: false }).inject('contamination')!, /needs a planted bay/)
})

test('a failed dehumidifier: humidity climbs, disease follows slowly, and the water it should return is lost', () => {
  const g = quiet()
  g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato')
  run(g, 60)
  near(g.recoveryPct, GH.recovery * 100, 1e-6, 'share of transpired water returned')
  assert.equal(g.inject('humidity'), null)
  const al = alertOf(g, 'humidity')!
  assert.equal(al.level, 'warning')
  const lostBefore = g.lostL, recoveredBefore = g.recoveredL
  run(g, 20)
  assert.ok(g.rhPct > 70 && g.rhPct < 85, `humidity ${g.rhPct.toFixed(0)} % after 20 s`)
  assert.ok(g.readings().rh.trend > 5)
  assert.match(al.trend, /Humidity \d+ % and rising/)
  assert.equal(g.bay('A1').disease, 0, 'no disease yet: there is time to act')
  assert.equal(g.recoveredL, recoveredBefore, 'nothing condenses back')
  assert.ok(g.lostL > lostBefore + 5)
  run(g, 80)
  assert.ok(g.rhPct > 88)
  assert.ok(g.bay('A1').disease > 0.15)
  assert.equal(al.level, 'degraded')
  assert.match(al.trend, /leaf disease up to \d+ %/)
  assert.ok(g.recoveryPct < 80)
  assert.equal(g.repair('thermal'), 'The thermal unit is healthy.')
  assert.equal(g.repair('dehumidifier'), null)
  run(g, RATES.job.dehumidifier + 0.5)
  assert.equal(al.level, 'recovery')
  assert.match(al.action, /^Fixed\./)
  const drying = until(g, () => g.rhPct < 65, 30)
  assert.ok(drying < 15, `dry air again ${drying} s after the repair`)
  // the air dries in seconds; the leaves heal far more slowly, and the alert stays until they have
  const diseased = g.bay('A1').disease
  assert.ok(diseased > 0.3, `leaf disease ${diseased.toFixed(2)}`)
  run(g, 20)
  near(diseased - g.bay('A1').disease, RATES.diseaseHeal * 20, 0.005, 'disease easing')
  until(g, () => !alertOf(g, 'humidity'), 150)
  assert.equal(g.plantsLost, 0)
  // left alone, wet air ends in dead, spotted plants
  const h = quiet()
  h.plant('A1', 'lettuce')
  run(h, 31)
  h.inject('humidity')
  until(h, () => h.bay('A1').planting!.symptom === 'spots', 300)
  until(h, () => stage(h, 'A1') === 'dead', 400)
  assert.match(h.log[h.log.length - 2].text, /died of leaf disease/)
  assert.equal(alertOf(h, 'humidity')!.level, 'damage')
})

test('a failed thermal unit: the lights heat the air, and cutting the heat buys time', () => {
  const g = quiet()
  g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato')
  for (const id of ['A1', 'A2', 'A3'] as BayId[]) g.setLight(id, 800)
  run(g, 20)
  near(g.tempC, 22, 0.05)
  assert.equal(g.inject('climate'), null)
  assert.equal(load(g, 'thermal').kw, 0)
  run(g, 40)
  assert.ok(g.tempC > 28, `air ${g.tempC.toFixed(1)} °C after 40 s`)
  assert.ok(g.readings().temp.trend > 2)
  assert.equal(g.readings().temp.status, 'bad')
  assert.equal(alertOf(g, 'climate')!.level, 'degraded')
  assert.match(alertOf(g, 'climate')!.trend, /Air \d+(\.\d)? °C and rising/)
  assert.equal(g.bay('A1').planting!.limiting, 'temperature')
  // with the lights off the module settles at the station's own temperature instead
  assert.equal(g.setLoadOn('lightsA', false), null)
  run(g, 60)
  assert.ok(g.tempC < 24)
  assert.equal(g.setLoadOn('lightsA', true), null)
  assert.equal(g.repair('thermal'), null)
  run(g, RATES.job.thermal + 30)
  near(g.tempC, 22, 0.2, 'held again')
  until(g, () => !alertOf(g, 'climate'), 120)
  // a wrong setpoint does the same harm with nothing broken, and gets a plain crop alert
  const h = quiet()
  h.plant('A1', 'lettuce'); h.plant('A2', 'radish')
  run(h, 20)
  assert.equal(h.setRecipe({ tempLitC: 30 }), null)
  until(h, () => !!alertOf(h, 'crop'), 120)
  const al = alertOf(h, 'crop')!
  assert.equal(al.factor, 'temperature')
  assert.match(al.problem, /is too hot: air (29|30)(\.\d)? °C, its band is 18 to 24 °C\. The same shows in 1 other bay \(A\d\)\./)
  assert.match(al.action, /setpoint/)
  assert.equal(h.alerts.length, 1)
  assert.equal(h.diagnose(al.id), null)
  run(h, RATES.job.diagnose + 0.5)
  assert.match(al.cause!, /temperature \d+ %/)
  assert.equal(h.setRecipe({ tempLitC: 22 }), null)
  until(h, () => h.alerts.length === 0, 120)
})

test('without the air loop: CO2 is used up, humidity climbs, and the water alert follows the tank', () => {
  const g = quiet()
  g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato')
  run(g, 31)
  assert.equal(g.setLoadOn('air', false), null)
  run(g, 120)
  assert.ok(g.co2Ppm < 350, `CO2 ${g.co2Ppm.toFixed(0)} ppm`)
  assert.ok(g.o2Pct > 21 && g.o2Pct <= 23.5)
  assert.ok(g.rhPct > 90)
  assert.ok(g.bay('A1').planting!.factors.gas < 0.75)
  assert.equal(g.setLoadOn('air', true), null)
  run(g, 30)
  near(g.co2Ppm, 1000, 5)
  near(g.o2Pct, 21, 0.2)
  // the tank: low water is an alert of its own, and makeup is limited
  const h = quiet()
  h.plant('A1', 'lettuce')
  h.tankL = 50
  run(h, 1)
  const al = alertOf(h, 'water')!
  assert.equal(al.level, 'warning')
  assert.match(al.problem, /Clean water is down to \d+ L/)
  assert.equal(h.requestMakeup(), null)
  assert.match(h.requestMakeup()!, /already on its way/)
  run(h, RATES.job.makeup + 1)
  assert.ok(h.tankL > 190)
  assert.equal(h.makeupL, GH.makeupL)
  assert.equal(alertOf(h, 'water'), undefined)
  h.tankL = 2
  run(h, 1)
  assert.equal(h.bay('A1').flow, 0, 'an empty tank stops irrigation')
  assert.equal(alertOf(h, 'water')!.level, 'degraded')
  for (let i = 0; i < GH.makeupUses - 1; i++) { assert.equal(h.requestMakeup(), null); run(h, RATES.job.makeup + 1) }
  assert.match(h.requestMakeup()!, /no more water to spare/)
})

test('a solar particle event: watch, storm, quiet; the dose depends on where the crew stands', () => {
  const inside = quiet(), outside = quiet()
  for (const g of [inside, outside]) { g.plant('A1', 'lettuce'); g.tick(5); assert.equal(g.inject('radiation'), null) }
  assert.equal(inside.exterior.radiation, 'watch')
  assert.equal(alertOf(inside, 'radiation')!.level, 'warning')
  assert.match(alertOf(inside, 'radiation')!.action, /Leave the module and work from a shielded node/)
  inside.tick(RATES.watchSeconds - 1, { crewInside: true })
  assert.equal(inside.doseMsv, 0, 'the warning comes before the radiation')
  inside.tick(2, { crewInside: true })
  outside.tick(RATES.watchSeconds + 1)
  assert.equal(inside.exterior.radiation, 'storm')
  assert.equal(alertOf(inside, 'radiation')!.level, 'degraded')
  inside.tick(RATES.stormSeconds + 1, { crewInside: true })
  outside.tick(RATES.stormSeconds + 1)
  assert.equal(inside.exterior.radiation, 'quiet')
  assert.equal(alertOf(inside, 'radiation'), undefined)
  near(inside.doseMsv, RATES.doseMsvPerS * RATES.stormSeconds, 0.03, 'mSv')
  assert.equal(outside.doseMsv, 0)
  // radiation does not make plants glow or die: a little stress, gone soon after
  assert.ok(stage(inside, 'A1') !== 'dead')
  assert.ok(inside.bay('A1').planting!.health > 99)
  const part = (g: Greenhouse) => g.score().parts.find(p => p.id === 'reliability')!
  assert.equal(part(outside).points, 15)
  assert.equal(part(inside).points, 7.5 - 3, 'half marks for a failure that did harm, and three off for the dose')
  assert.match(part(inside).why, /Crew dose/)
})

// ------------------------------------------------------------------ Nutrient solution
test('the nutrient solution: drift, doses, and three problems with three different fixes', () => {
  const g = quiet()
  g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato')
  run(g, 80)
  assert.ok(g.ec < GH.ec && g.ec > 1.2, `conductivity drifts down with uptake: ${g.ec.toFixed(2)}`)
  assert.ok(g.ph > GH.ph && g.ph < 6.3, `pH drifts up: ${g.ph.toFixed(2)}`)
  assert.ok(g.balance < 1 && g.balance > 0.85)
  assert.ok(g.readings().ec.trend < 0)
  assert.deepEqual(g.readings().ec.band, [1.4, 2.0], 'the band every planted crop shares')
  const ec = g.ec, stock = g.inventory.nutrientStock
  assert.equal(g.dose('nutrient'), null)
  near(g.ec, ec + RATES.doseEc, 0.006)
  assert.equal(g.inventory.nutrientStock, stock - RATES.doseStock)
  assert.equal(g.dose('phDown'), null)
  assert.ok(g.ph < 6)
  // 1. a stuck doser: conductivity high, a flush dilutes it and costs water
  assert.equal(g.inject('nutrient', undefined, 'doser'), null)
  assert.ok(g.ec >= 2.9)
  assert.match(alertOf(g, 'nutrient')!.problem, /Conductivity is high at 2\.9 mS\/cm/)
  run(g, 5)
  assert.ok(g.bay('A1').planting!.factors.nutrient < 0.6)
  assert.equal(alertOf(g, 'nutrient')!.level, 'degraded')
  const tank = g.tankL, lost = g.lostL
  assert.equal(g.flush(), null)
  assert.match(g.flush()!, /already running/)
  run(g, RATES.job.flush + 0.5)
  assert.ok(g.ec < 2.0)
  assert.ok(tank - g.tankL > RATES.flushL / 2 - 5 && g.lostL - lost > RATES.flushL / 2 - 1, 'half of the flushed water is lost')
  until(g, () => !alertOf(g, 'nutrient'), 90)
  // 2. a pH crash: doses of pH up
  g.ph = GH.ph
  assert.equal(g.inject('nutrient', undefined, 'ph'), null)
  assert.match(alertOf(g, 'nutrient')!.problem, /pH has fallen to 4\.9/)
  run(g, 20)
  assert.ok(g.bay('A1').planting!.stress > 15, 'the roots are going short')
  assert.equal(g.dose('phUp'), null)
  run(g, 1)
  assert.ok(alertOf(g, 'nutrient')!.level !== 'recovery', 'one dose is not enough')
  assert.equal(g.dose('phUp'), null)
  run(g, 1)
  assert.equal(alertOf(g, 'nutrient')!.level, 'recovery', 'back in band: fixed, but the plants are still getting over it')
  until(g, () => !alertOf(g, 'nutrient'), 90)
  // 3. a hidden imbalance: the meters read normal, only the lab test shows it, only a fresh mix fixes it
  g.ec = GH.ec; g.ph = GH.ph
  assert.equal(g.inject('nutrient', undefined, 'balance'), null)
  const al = alertOf(g, 'nutrient')!
  assert.match(al.problem, /though pH and conductivity read normal/)
  assert.equal(g.readings().ec.status, 'ok')
  assert.equal(g.readings().ph.status, 'ok')
  assert.equal(g.labTest, null)
  assert.equal(g.testSolution(), null)
  run(g, RATES.job.labTest + 0.5)
  near(g.labTest!.balance, 0.35, 0.02)
  assert.match(g.labTest!.note, /low: the solution is out of balance\. Mix a fresh batch\./)
  assert.ok(al.diagnosed)
  assert.match(al.cause!, /out of balance, which conductivity cannot show/)
  g.dose('nutrient')
  run(g, 25)
  assert.ok(alertOf(g, 'nutrient')!.level !== 'recovery', 'more of the same salts is not the answer')
  const before = g.inventory.nutrientStock
  assert.equal(g.mix(), null)
  assert.match(g.mix()!, /already being mixed/)
  assert.equal(g.inventory.nutrientStock, before - 1)
  run(g, RATES.job.mix + 0.5)
  near(g.ec, GH.ec, 0.01)
  near(g.ph, GH.ph, 0.01)
  near(g.balance, 1, 0.01)
  assert.equal(alertOf(g, 'nutrient')!.level, 'recovery')
  until(g, () => !alertOf(g, 'nutrient'), 90)
  // the stock is finite
  g.inventory.nutrientStock = 0.5
  assert.match(g.mix()!, /needs one unit of nutrient stock/)
  assert.equal(g.dose('nutrient'), null)
  assert.equal(g.dose('nutrient'), null)
  assert.match(g.dose('nutrient')!, /No nutrient stock left/)
  assert.equal(g.plantsLost, 0)
})

// ------------------------------------------------------------------ Harvest and reseeding
test('harvest and reseeding: cut, whole and pick, spent plants, seed packets', () => {
  const g = quiet()
  g.plant('A1', 'lettuce'); g.plant('A2', 'radish')
  assert.match(g.harvest('A1')!, /not ready/)
  assert.match(g.harvest('A4')!, /empty/)
  assert.match(g.plant('A1', 'radish')!, /already holds lettuce/)
  assert.match(g.plant('A4', 'pepper')!, /not open yet/)
  assert.match(g.plant('A3', 'lettuce')!, /needs a two-shelf rack/)
  until(g, () => ready(g, 'A1', 'A2'))
  // radish: the whole plant, at once
  assert.match(g.harvest('A2', 'cut')!, /cannot be harvested that way/)
  assert.equal(g.harvest('A2'), null)
  assert.equal(g.bay('A2').planting, null)
  near(g.inventory.food.radish, crop('radish').yieldKgM2 * 4.8, 0.01, 'kg of radish')
  // lettuce: the outer leaves, three times, each a share of a full head
  const cut = crop('lettuce').yieldKgM2 * 4.8 * crop('lettuce').harvest.share
  assert.equal(g.harvest('A1'), null)
  near(g.inventory.food.lettuce, cut, 0.01)
  assert.equal(stage(g, 'A1'), 'postharvest')
  assert.equal(g.bay('A1').planting!.harvests, 1)
  assert.equal(g.harvestCount, 2)
  assert.ok(g.complete)
  assert.deepEqual(g.inventory.variety, ['radish', 'lettuce'])
  near(g.inventory.kcal, g.inventory.food.radish * 160 + g.inventory.food.lettuce * 150, 0.01)
  assert.match(g.harvest('A1')!, /not ready/)
  const regrow = until(g, () => ready(g, 'A1'), 20)
  near(regrow, crop('lettuce').harvest.regrowDays, 0.5, 'regrow seconds')
  assert.equal(g.harvest('A1', 'cut'), null)
  until(g, () => ready(g, 'A1'), 20)
  assert.equal(g.harvest('A1'), null)
  near(g.inventory.food.lettuce, cut * 3, 0.05)
  // after the last cut the plant is spent: no more harvests, and the bay must be cleared
  const p = g.bay('A1').planting!
  assert.ok(p.spent)
  assert.equal(p.stage, 'postharvest')
  run(g, 20)
  assert.equal(stage(g, 'A1'), 'postharvest')
  assert.match(g.harvest('A1')!, /spent/)
  assert.match(g.plant('A1', 'lettuce')!, /Clear bay A1 first/)
  const residue = g.inventory.residueKg
  assert.equal(g.clear('A1'), null)
  assert.ok(g.inventory.residueKg > residue)
  assert.match(g.clear('A1')!, /already empty/)
  // reseeding uses up the packets: harvesting food never refills them
  assert.equal(g.inventory.seeds.lettuce, 2)
  assert.equal(g.plant('A1', 'lettuce'), null)
  assert.equal(g.plant('A2', 'lettuce'), null)
  assert.equal(g.inventory.seeds.lettuce, 0)
  until(g, () => ready(g, 'A2'))
  // a whole head after one cut gives the rest, not a second full yield
  g.harvest('A1')
  until(g, () => ready(g, 'A1'), 20)
  const had = g.inventory.food.lettuce
  assert.equal(g.harvest('A1', 'whole'), null)
  near(g.inventory.food.lettuce - had, crop('lettuce').yieldKgM2 * 4.8 * 0.6, 0.05)
  assert.equal(g.harvest('A2', 'whole'), null)
  assert.match(g.plant('A1', 'lettuce')!, /No lettuce seed left/)
  // tomato: picked again and again, the plant stays
  g.ec = GH.ec; g.ph = GH.ph
  assert.equal(g.plant('A3', 'tomato'), null)
  assert.match(g.clear('A3')!, /still growing/)
  until(g, () => g.bay('A3').planting!.needsPollination)
  assert.equal(stage(g, 'A3'), 'reproductive')
  assert.equal(g.pollinate('A3'), null)
  until(g, () => ready(g, 'A3'))
  assert.match(g.harvest('A3', 'whole')!, /cannot be harvested that way/)
  assert.equal(g.harvest('A3'), null)
  near(g.inventory.food.tomato, crop('tomato').yieldKgM2 * 2.4 * 0.5, 0.05)
  assert.equal(stage(g, 'A3'), 'postharvest')
  const flush = until(g, () => ready(g, 'A3'), 30)
  near(flush, crop('tomato').harvest.regrowDays / 0.9, 1, 'seconds to the next flush at 22 °C')
  assert.ok(g.inventory.variety.includes('tomato'))
})

test('seed is its own harvest: a bolted lettuce, a seed tomato, and the cargo run', () => {
  const g = quiet()
  g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato')
  assert.equal(g.setForSeed('A1', true), null)
  assert.ok(g.bay('A1').planting!.forSeed)
  near(g.bay('A1').planting!.daysLeft, 30 + crop('lettuce').seedDays, 1e-9)
  run(g, 31)
  assert.equal(stage(g, 'A1'), 'reproductive', 'kept for seed, the lettuce bolts instead of being cut')
  assert.equal(g.bay('A1').planting!.needsPollination, false)
  assert.match(g.harvest('A1')!, /not ready/)
  assert.match(g.setForSeed('A1', false)!, /has bolted/)
  until(g, () => ready(g, 'A1'), 20)
  near(g.bay('A1').planting!.ageDays, 30 + crop('lettuce').seedDays, 0.3)
  assert.equal(g.harvest('A1'), null)
  assert.equal(g.inventory.seeds.lettuce, GH.startSeeds - 1 + GH.seedSaveGain)
  assert.equal(g.inventory.food.lettuce, 0)
  assert.equal(g.harvestCount, 0, 'seed is not a stored harvest')
  assert.equal(g.bay('A1').planting, null, 'a bolted plant is pulled')
  // a radish that was ready to eat can still be left to flower
  assert.equal(stage(g, 'A2'), 'ready')
  assert.equal(g.setForSeed('A2', true), null)
  assert.equal(stage(g, 'A2'), 'reproductive')
  until(g, () => ready(g, 'A2'), 30)
  assert.equal(g.harvest('A2'), null)
  assert.equal(g.inventory.seeds.radish, GH.startSeeds - 1 + GH.seedSaveGain)
  // a fruit crop gives seed from one picking and keeps growing
  until(g, () => g.bay('A3').planting!.needsPollination)
  g.pollinate('A3')
  until(g, () => ready(g, 'A3'))
  assert.equal(g.setForSeed('A3', true), null)
  assert.equal(stage(g, 'A3'), 'ready')
  assert.equal(g.harvest('A3'), null)
  assert.equal(g.inventory.seeds.tomato, GH.startSeeds - 1 + GH.seedSaveGain)
  assert.equal(g.inventory.food.tomato, 0)
  assert.equal(stage(g, 'A3'), 'postharvest')
  assert.equal(g.bay('A3').planting!.forSeed, false)
  // the cargo run: slow, one at a time, and it brings a unit of nutrient stock and a dose of sanitiser too
  assert.match(g.resupply('kale')!, /not on the manifest/)
  assert.equal(g.resupply('lettuce'), null)
  assert.match(g.resupply('radish')!, /already on its way/)
  const stock = g.inventory.nutrientStock, seeds = g.inventory.seeds.lettuce
  run(g, RATES.job.resupply + 1)
  assert.equal(g.inventory.seeds.lettuce, seeds + RATES.resupplyPackets)
  assert.equal(g.inventory.nutrientStock, stock + 1)
  assert.equal(g.inventory.sanitizer, GH.sanitizer + 1)
})

test('pollination: a tomato whose flowers get no help sets a third of its fruit', () => {
  const helped = quiet(), left = quiet()
  for (const g of [helped, left]) {
    g.plant('A3', 'tomato')
    assert.match(g.pollinate('A3')!, /not flowering now/)
    until(g, () => stage(g, 'A3') === 'reproductive')
    assert.ok(g.bay('A3').planting!.needsPollination)
    assert.equal(g.summary().pollinate, 1)
  }
  assert.equal(helped.pollinate('A3'), null)
  assert.match(helped.pollinate('A3')!, /already set/)
  assert.equal(helped.summary().pollinate, 0)
  for (const g of [helped, left]) { until(g, () => ready(g, 'A3')); assert.equal(g.harvest('A3'), null) }
  near(left.inventory.food.tomato / helped.inventory.food.tomato, crop('tomato').unaidedSet, 1e-6, 'yield ratio')
  assert.match(left.log[left.log.length - 1].text, /few fruit set because the flowers got no help/)
  // the next flush flowers again, so a late hand still saves the later pickings
  assert.ok(left.bay('A3').planting!.needsPollination)
  assert.equal(left.pollinate('A3'), null)
  until(left, () => ready(left, 'A3'), 40)
  const had = left.inventory.food.tomato
  left.harvest('A3')
  near(left.inventory.food.tomato - had, helped.inventory.food.tomato, 0.05)
  // leaf crops need no flowers, and grain sets on its own
  const g = quiet()
  g.plant('A1', 'lettuce')
  assert.match(g.pollinate('A1')!, /nothing to do/)
  assert.match(g.pollinate('A2')!, /Nothing is flowering/)
})

// ------------------------------------------------------------------ Tiers and food
test('tiers: what each one needs and what it opens', () => {
  const g = quiet()
  assert.equal(g.tier, 1)
  assert.deepEqual(g.bays.filter(b => b.unlocked).map(b => b.id), ['A1', 'A2', 'A3'])
  assert.deepEqual(g.cropsOpen(), ['lettuce', 'radish', 'tomato'])
  assert.equal(g.openM2, 12)
  assert.match(g.plant('B1', 'lettuce')!, /not open yet: unlock "Reliable fresh greens"/)
  assert.match(g.plant('A1', 'mizuna')!, /not on board yet/)
  assert.match(g.plant('A1', 'tomato')!, /needs a tall trellis bay\. Bay A1 is a two-shelf rack/)
  assert.match(g.plant('A3', 'radish')!, /needs a two-shelf rack/)
  assert.deepEqual(g.unlockStatus(), { next: TIERS[1], ready: false, missing: 'Still needed: 2 more harvests to store.' })
  assert.match(g.unlock()!, /2 more harvests/)
  assert.match(g.process('wheat')!, /comes with "Staple crops and food processing"/)
  assert.match(g.recycle()!, /comes with "Resource recovery and automation"/)

  reach(g, 2)
  assert.equal(g.tier, 2)
  assert.deepEqual(g.bays.filter(b => b.unlocked).map(b => b.id), ['A1', 'A2', 'A3', 'A4', 'B1', 'B2'])
  assert.deepEqual([g.inventory.seeds.mizuna, g.inventory.seeds.kale, g.inventory.seeds.pepper, g.inventory.seeds.potato], [GH.unlockSeeds, GH.unlockSeeds, GH.unlockSeeds, 0])
  assert.equal(g.unlockStatus().missing, 'Still needed: 3 more harvests to store, and 1 more kind of fresh crop.')

  const h = quiet()
  reach(h, 3)
  assert.equal(h.tier, 3)
  assert.ok(h.bays.every(b => b.unlocked))
  assert.equal(h.openM2, 28.8, 'tall bays hold one shelf, so the full module is less than a wholly two-shelf 38.4 m²')
  assert.equal(h.cropsOpen().length, CROPS.length)
  assert.equal(h.unlockStatus().missing, 'Still needed: one staple harvest processed into food.')
  assert.match(h.unlock()!, /one staple harvest processed/)

  const k = quiet()
  reach(k, 4)
  assert.equal(k.tier, 4)
  assert.deepEqual(k.unlockStatus(), { next: null, ready: false, missing: 'Every tier is open.' })
  assert.match(k.unlock()!, /already open/)
  assert.equal(k.score().parts.find(p => p.id === 'progress')!.points, 10)
  for (const id of BAY_IDS) assert.equal(k.bay(id).unlocked, BAY_PLAN[id].tier <= 4)
})

test('staples are not food until they are processed, and the processor needs power', () => {
  const g = quiet()
  reach(g, 3)
  const kcal = g.inventory.kcal
  assert.equal(g.plant('A3', 'wheat'), null)
  assert.equal(g.plant('A4', 'soybean'), null)
  until(g, () => ready(g, 'A3', 'A4'))
  assert.equal(g.bay('A3').planting!.needsPollination, false, 'grain sets on its own')
  assert.equal(g.harvest('A3'), null)
  assert.equal(g.harvest('A4'), null)
  const wheat = g.inventory.raw.wheat
  near(wheat, crop('wheat').yieldKgM2 * 2.4, 0.2)
  assert.equal(g.inventory.food.wheat, 0)
  assert.equal(g.inventory.kcal, kcal, 'unprocessed grain is not counted')
  assert.equal(g.harvestCount, 7)
  assert.match(g.process('lettuce')!, /eaten fresh/)
  assert.match(g.process('potato')!, /No harvested potato/)
  assert.equal(load(g, 'processor').kw, 0)
  assert.equal(g.process('wheat'), null)
  assert.match(g.process('soybean')!, /processor is busy/)
  assert.equal(g.inventory.raw.wheat, 0)
  run(g, 1)
  assert.equal(load(g, 'processor').kw, GH.loadKw.processor)
  assert.match(g.jobs[0].label, /Dwarf wheat: thresh \(step 1 of 3\)/)
  // switched off, the processor waits
  assert.equal(g.setLoadOn('processor', false), null)
  const left = g.jobs[0].left
  run(g, 10)
  assert.equal(g.jobs[0].left, left)
  assert.equal(g.setLoadOn('processor', true), null)
  run(g, 6)
  assert.match(g.jobs[0].label, /mill \(step 2 of 3\)/)
  run(g, 3 * RATES.job.processStep)
  assert.equal(g.jobs.length, 0)
  assert.equal(g.inventory.food.wheat, wheat)
  near(g.inventory.kcal - kcal, wheat * crop('wheat').kcalPerKg, 1e-6)
  assert.equal(g.staplesProcessed, 1)
  assert.equal(g.process('soybean'), null)
  run(g, 2 * RATES.job.processStep + 1)
  assert.ok(g.inventory.proteinG > 300, 'soybean is the protein crop')
  assert.deepEqual(g.inventory.variety.sort(), ['lettuce', 'mizuna', 'radish'], 'staples do not count as fresh variety')
  assert.equal(g.unlock(), null)
  assert.equal(g.tier, 4)
})

test('tier 4: the module doses itself and turns residue into nutrient stock', () => {
  const g = quiet()
  reach(g, 4)
  // automatic dosing holds pH and conductivity, at half the stock a hand dose uses
  g.ec = 1.0; g.ph = 6.6
  const stock = g.inventory.nutrientStock
  run(g, 40)
  near(g.ec, GH.ec, 0.03)
  near(g.ph, GH.ph, 0.03)
  near(stock - g.inventory.nutrientStock, ((0.6 / RATES.doseEc) * RATES.doseStock) / 2, 0.03, 'stock used')
  // but not the balance: that still takes a fresh mix
  g.balance = 0.4
  run(g, 20)
  assert.ok(g.balance <= 0.4)
  // the recycler: residue in, some nutrient stock out, the rest lost
  assert.ok(g.inventory.residueKg > 4)
  const residue = g.inventory.residueKg, had = g.inventory.nutrientStock
  assert.equal(g.recycle(), null)
  assert.match(g.recycle()!, /busy/)
  run(g, RATES.job.recycle + 1)
  near(g.inventory.residueKg, residue - 4, 1e-9)
  assert.equal(g.inventory.nutrientStock, Math.round((had + 1) * 100) / 100)
  g.inventory.residueKg = 1
  assert.match(g.recycle()!, /at least 2 kg/)
  // and the dehumidifier returns a little more of the water
  g.setPurifier(true)
  g.plant('A1', 'lettuce')
  const t = g.transpiredL, r = g.recoveredL
  run(g, 30)
  near((g.recoveredL - r) / (g.transpiredL - t), 0.99, 1e-6)
})

// ------------------------------------------------------------------ Water
test('water is conserved: every litre is in the tank, a root zone, a plant, or counted as gone', () => {
  const g = new Greenhouse({ seed: 11 })
  const budget = g.waterBudget()
  assert.deepEqual([budget.tank, budget.roots, budget.plants, budget.total], [650, 0, 0, 650])
  g.plant('A1', 'lettuce')
  assert.equal(g.bay('A1').moisture, 1)
  assert.equal(g.tankL, GH.tankL - GH.rootL.tier, 'filling a root zone takes water from the tank, it does not make any')
  const kinds = new Set<string>()
  operate(g, 900, (m, s) => {
    for (const f of m.activeFaults()) kinds.add(f.kind)
    if (s % 10 === 0) near(m.waterBudget().total, GH.tankL, 1e-6, `litres at ${s} s`)
  })
  const w = g.waterBudget()
  near(w.total, GH.tankL, 1e-6)
  assert.ok(kinds.size >= 3, `the run met ${[...kinds].join(', ')}`)
  assert.ok(g.transpiredL > 150 && g.harvestCount > 10, `a busy run: ${Math.round(g.transpiredL)} L transpired, ${g.harvestCount} harvests`)
  assert.ok(w.harvested > 0 && w.lost > 0 && w.makeup > 0)
  near(g.transpiredL, g.recoveredL + (g.lostL - RATES.flushL / 2), 1e-6, 'transpired water is either recovered or lost')
  assert.ok(g.recoveryPct <= 97.01)
  // circulating water is not consumption: with the loop closed and nothing transpiring, the tank holds
  const h = quiet()
  h.plant('A1', 'lettuce')
  h.setLightsOn('A1', false)
  run(h, 60)
  assert.equal(h.transpiredL, 0)
  near(h.tankL + h.waterBudget().roots, GH.tankL, 1e-9)
})

// ------------------------------------------------------------------ Score
test('the score: seven parts, each capped, 100 in all', () => {
  const g = quiet()
  const parts = () => Object.fromEntries(g.score().parts.map(p => [p.id, p.points]))
  assert.deepEqual(g.score().parts.map(p => p.max), [20, 15, 10, 20, 15, 10, 10])
  assert.equal(g.score().parts.reduce((s, p) => s + p.max, 0), 100)
  assert.equal(g.score().total, 0)
  g.plant('A1', 'lettuce'); g.plant('A2', 'radish')
  assert.equal(parts().reliability, 8, 'untested, the module gets 8 of 15')
  until(g, () => ready(g, 'A1', 'A2'))
  g.harvest('A1'); g.harvest('A2')
  let p = parts()
  assert.equal(p.variety, 8)
  assert.equal(p.health, 20)
  assert.equal(p.water, 0, 'too little has been transpired yet to judge the recovery')
  assert.equal(p.progress, 0)
  near(p.calories, (15 * g.inventory.kcal) / 25000, 0.05)
  near(p.protein, (10 * g.inventory.proteinG) / 600, 0.05)
  assert.equal(g.score().total, Math.round(g.score().parts.reduce((s, x) => s + x.points, 0)))
  for (const x of g.score().parts) assert.ok(x.why.length > 10 && x.points >= 0 && x.points <= x.max, x.id)
  g.unlock()
  assert.equal(parts().progress, 3)
  // failures: full marks when fixed before any crop was hurt, half after, nothing while open
  g.plant('A2', 'radish')
  g.inject('irrigation', 'A2')
  assert.equal(parts().reliability, 0)
  g.clearLine('A2')
  run(g, RATES.job.clearLine + 1)
  assert.equal(parts().reliability, 15)
  until(g, () => g.alerts.length === 0, 60)
  assert.equal(parts().reliability, 15)
  g.inject('irrigation', 'A2')
  until(g, () => alertOf(g, 'irrigation')!.level === 'damage', 120)
  g.clearLine('A2')
  run(g, RATES.job.clearLine + 1)
  assert.ok(stage(g, 'A2') !== 'dead')
  near(parts().reliability, (15 * (1 + 0.5)) / 2, 0.06)
  // the caps
  g.inventory.kcal = 1e6; g.inventory.proteinG = 1e5
  g.inventory.variety = ['lettuce', 'mizuna', 'kale', 'radish', 'tomato', 'pepper']
  p = parts()
  assert.deepEqual([p.variety, p.calories, p.protein], [20, 15, 10])
  g.plantsLost = 20
  assert.equal(parts().health, 0)
  g.doseMsv = 1
  near(parts().reliability, (15 * 1.5) / 2 - 3, 0.06)
  assert.ok(g.score().total <= 100)
  // water recovery only counts once there is something to recover, and falls when it is thrown away
  const h = quiet()
  h.plant('A1', 'lettuce'); h.plant('A2', 'radish')
  run(h, 5)
  const water = () => h.score().parts.find(x => x.id === 'water')!
  assert.equal(water().points, 0)
  assert.match(water().why, /20 litres/)
  run(h, 100)
  assert.ok(h.transpiredL > 20)
  assert.equal(water().points, 10)
  h.setLoadOn('air', false)
  run(h, 60)
  assert.ok(water().points < 2)
  // the food numbers the panels show
  assert.equal(g.foodKg, Object.values(g.inventory.food).reduce((s, kg) => s + kg, 0))
  near(g.crewDays, 1e6 / GH.crewDayKcal, 1e-9)
  assert.ok(g.foodCoveragePct > 100)
  assert.equal(g.plantedM2, 9.6)
})

// ------------------------------------------------------------------ Schedule, determinism, save and reload
test('the failure schedule: a quiet first minute, never three at once, none while nobody is on deck', () => {
  const first: string[] = []
  for (let seed = 1; seed <= 20; seed++) {
    const g = new Greenhouse({ seed })
    g.tick(40) // docked, nothing planted: the schedule has not started
    g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato')
    run(g, RATES.firstFault[0] - 1)
    assert.equal(g.alerts.length, 0, `seed ${seed}: quiet for the first ${RATES.firstFault[0]} s`)
    run(g, RATES.firstFault[1] - RATES.firstFault[0] + 2)
    assert.equal(g.activeFaults().length, 1, `seed ${seed}: one failure by ${RATES.firstFault[1]} s`)
    first.push(g.activeFaults()[0].kind)
    let most = 1
    const seen = new Set<string>()
    run(g, 600, () => { const open = g.activeFaults().filter(f => f.level !== 'recovery'); most = Math.max(most, open.length); for (const f of g.activeFaults()) seen.add(f.kind) })
    assert.ok(most <= 2, `seed ${seed}: at most two open at once`)
    for (const k of seen) assert.ok(['irrigation', 'humidity', 'nutrient', 'arrayFeather', 'arrayString'].includes(k), `seed ${seed}: ${k} does not come at tier 1`)
  }
  assert.ok(new Set(first).size >= 3, `different seeds start differently: ${[...new Set(first)].join(', ')}`)
  // later tiers bring the rest
  const later = new Set<string>()
  for (let seed = 1; seed <= 12; seed++) {
    const g = new Greenhouse({ seed })
    g.tier = 2
    g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato')
    operate(g, 500, m => { for (const f of m.activeFaults()) later.add(f.kind) })
  }
  for (const k of FAULT_KINDS) assert.ok(later.has(k), `${k} turns up at tier 2`)
  // nobody on the deck: plants keep growing, no new failure starts
  const away = new Greenhouse({ seed: 4 })
  away.plant('A1', 'lettuce')
  for (let s = 0; s < 300; s++) away.tick(1, { quiet: true })
  assert.equal(away.activeFaults().length, 0)
  assert.equal(stage(away, 'A1'), 'ready')
  away.tick(19)
  assert.equal(away.activeFaults().length, 0, 'and none the moment someone walks back in')
  run(away, 30)
  assert.equal(away.activeFaults().length, 1)
  // with the schedule off, only what a test injects
  const off = quiet(4)
  off.plant('A1', 'lettuce')
  run(off, 600)
  assert.equal(off.activeFaults().length, 0)
  assert.equal(off.inject('humidity'), null)
  assert.equal(off.activeFaults().length, 1)
  assert.match(off.inject('humidity')!, /already in progress/)
})

test('the same seed and the same actions give the same run', () => {
  const play = (seed: number) => { const g = new Greenhouse({ seed }); g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato'); operate(g, 400); return g }
  const a = play(7), b = play(7), c = play(8)
  assert.deepEqual(a.snapshot(), b.snapshot())
  assert.deepEqual(a.log, b.log)
  assert.notDeepEqual(a.log.map(l => l.text), c.log.map(l => l.text))
  // large steps and small steps land in the same place: the module sub-steps
  const big = quiet(), small = quiet()
  for (const g of [big, small]) { g.plant('A1', 'lettuce'); g.plant('A3', 'tomato') }
  big.tick(60)
  for (let i = 0; i < 240; i++) small.tick(STEP)
  assert.deepEqual(big.snapshot(), small.snapshot())
  assert.ok(a.log.every(l => typeof l.at === 'number' && l.text.length > 0))
  assert.ok(a.log.some(l => /sown/.test(l.text)) && a.log.some(l => /harvested/.test(l.text)) && a.log.some(l => l.kind === 'alert'))
})

test('save and reload in the middle of everything: the run carries on exactly', () => {
  const g = new Greenhouse({ seed: 5 })
  g.plant('A1', 'lettuce'); g.plant('A2', 'radish'); g.plant('A3', 'tomato')
  operate(g, 155)
  g.inject('leak')
  g.diagnose(g.alerts[g.alerts.length - 1].id)
  g.testSolution()
  g.tick(2.5)
  assert.ok(g.jobs.length >= 2 && g.activeFaults().length >= 1 && g.bays.some(b => b.planting))
  const snap = g.snapshot()
  assert.equal(snap.v, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap, 'plain JSON')
  const copy = Greenhouse.restore(snap)
  assert.deepEqual(copy.snapshot(), snap)
  assert.deepEqual(copy.bay('A3'), g.bay('A3'))
  assert.deepEqual(copy.readings(), g.readings())
  assert.deepEqual(copy.history('battery'), g.history('battery'))
  assert.deepEqual(copy.score(), g.score())
  operate(g, 300)
  operate(copy, 300)
  assert.deepEqual(copy.snapshot(), g.snapshot())
  assert.deepEqual(copy.log, g.log)
  // the saved copy is a copy: changing the module afterwards does not reach into it
  assert.notDeepEqual(g.snapshot(), snap)
  assert.equal((snap as unknown as { t: number }).t, 157.5)
})

// ------------------------------------------------------------------ Readings and the HUD line
test('readings carry a target, a band, a trend and a status, and the HUD gets one line', () => {
  const g = quiet()
  assert.equal(g.history('temp').length, 1)
  g.plant('A1', 'lettuce'); g.plant('A3', 'tomato')
  assert.deepEqual(g.summary(), { planted: 2, ready: 0, alerts: 0, worst: null, pollinate: 0 })
  run(g, 80)
  assert.equal(g.history('temp').length, 60, 'one sample a second, the last minute kept')
  assert.equal(g.history('battery')[59], g.batteryPct)
  const r = g.readings()
  assert.deepEqual([r.temp.target, r.rh.target, r.co2.target, r.ph.target, r.ec.target, r.tank.target], [22, 60, 1000, 6, 1.6, null])
  assert.deepEqual(r.rh.band, [55, 70])
  assert.deepEqual(r.ph.band, [5.5, 6.5])
  assert.deepEqual([r.temp.unit, r.pressure.unit, r.co2.unit, r.ec.unit, r.tank.unit, r.battery.unit, r.reserve.unit], ['°C', 'kPa', 'ppm', 'mS/cm', 'L', '%', 'kg'], 'no unlabelled numbers')
  assert.ok(r.ec.trend < 0 && r.ph.trend > 0 && r.tank.trend < 0)
  assert.equal(r.temp.trend, 0)
  // with every light off the air is held at the dark setpoint
  g.setLoadOn('lightsA', false)
  run(g, 40)
  assert.equal(g.readings().temp.target, GH.recipe.tempDarkC)
  near(g.tempC, 19, 0.1)
  assert.ok(g.rootTempC < 19.2 && g.rootTempC > 18.5, `the root solution follows the air, slowly: ${g.rootTempC.toFixed(2)} °C`)
  // crops standing in the dark get an alert of their own, in words: no failure is behind it
  const dark = alertOf(g, 'crop')!
  assert.equal(dark.factor, 'light')
  assert.match(dark.problem, /is short of light: 0 mol\/m²\/day, it wants [\d.]+ to [\d.]+\. The same shows in 1 other bay/)
  g.setLoadOn('lightsA', true)
  g.inject('humidity')
  run(g, 60)
  assert.equal(alertOf(g, 'crop'), undefined, 'gone once the lights are back and the plants have settled')
  assert.equal(g.readings().rh.status, 'bad')
  const s = g.summary()
  assert.deepEqual([s.planted, s.ready, s.alerts, s.worst, s.pollinate], [2, 2, 1, 'degraded', 0])
  assert.equal(g.acknowledge(g.alerts[0].id), null)
  assert.ok(g.alerts[0].acknowledged)
  assert.match(g.acknowledge(9999)!, /has cleared/)
  assert.match(g.diagnose(9999)!, /has cleared/)
  assert.equal(g.plantedM2, 7.2)
  assert.ok(g.o2MadeKg > 0)
  assert.ok(g.exterior.sunlight === 1 || g.exterior.sunlight === 0 || (g.exterior.sunlight > 0 && g.exterior.sunlight < 1))
})
