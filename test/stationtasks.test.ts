// The station tasks from the team's mission spec (S1 to S5), the relay's signal tuning, the
// alerts of a run, the dust storm, and the mission score.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DUST_CHANCE, DUST_SPEED, Mission, WATER_BONUS } from '../src/core/mission'
import { COMMS_NEED, LIFE_NEED, powerBlock, powerPct } from '../src/core/power'
import { newRescue } from '../src/core/rescue'
import { ROVERS } from '../src/core/rovers'
import { missionScore } from '../src/core/score'
import {
  ACTIVITIES, ADAPTER_PARTS, ADAPTER_ROLES, ALERT_AFTER, ALERT_IDS, ALERT_POINTS, BATTERY_FLOOR, BLACKOUT_HOURS, BRINE_LIFE_UNITS, CABIN_LINKS, CABIN_MODULES, CABIN_SECONDS, CABIN_SOURCES, CABIN_STEPS,
  DAY_BLOCKS, DIAL_MAX, EXERCISE_NEED_H, FILTER_COST, HEALTH_COST, LOOP_ORDER, MUSTER, RATION_SYSTEMS, RELAY_MAX_ROUNDS, RELAY_MIN_ROUNDS, RELAY_TOLERANCE, RESTART_PENALTY, SCHEDULE_START,
  SCHEDULE_TARGET, SCRUBBER_SECONDS, SHUTDOWNS, WATER_BASE_PCT, WATER_BRINE_PCT, WATER_TARGET,
  adapterFaults, adapterInventory, alertPoints, alertTimeFactor, blackout, cabinMove, co2Pct, crewDay, hatchesOf, loopCheck, newCabinAlarm, newRelayTuning, planAlerts, rationPoints,
  rationResult, relayNoise, relayOnCarrier, relayQuality, restartBlock, restartOrder, scheduleBlock, schedulePoints, shedBlock, waterBonus, waterPoints, waterRecovery, waterWon,
  type Activity, type AdapterPicks,
} from '../src/core/stationTasks'
import { driveWhPerM } from '../src/core/survey'
import { EARTH_PHOTOS, STATION_CARDS, STATION_TASK_DATA, stationCard } from '../src/data/stationTasks'
import { LINKS, MODULES } from '../src/game/deck'
import { GOOD_DAY, clearAlerts, stationReady } from './station-helpers'

const NASA = /^https:\/\/(www\.nasa\.gov|www\.jpl\.nasa\.gov|science\.nasa\.gov)\//
/** A repeatable dice: a different sequence for each seed. */
const dice = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
/** Read through a function, so an earlier check does not fix the type of a value that changes. */
const dustOf = (m: Mission) => m.dust
const dustLeft = (m: Mission) => m.dustSolsLeft
const purifier = (m: Mission) => (m.greenhouse as unknown as { purifier: boolean }).purifier
const docked = (ship: 'atlasv' | 'shuttle' | 'falcon9' = 'atlasv') => new Mission({ callSign: 'Test', suit: 'ember', ship })
/** Docked, with the payload on and the relay mended. */
function aboard() {
  const m = docked()
  assert.equal(m.selectInstrument('ir'), null)
  assert.equal(m.activatePayload(), null)
  m.complete('relay', 'test')
  return m
}

// ---------------------------------------------------------------- the snapshot
test('the station-task snapshot keeps the words of its NASA sources', () => {
  assert.match(STATION_TASK_DATA.retrieved, /^\d{4}-\d{2}-\d{2}$/)
  assert.deepEqual(STATION_CARDS.map(c => c.id).sort(), ['apollo13-filter', 'apollo13-power', 'crew-day', 'dust-2018', 'iss-water', 'mir-fire'])
  for (const c of STATION_CARDS) {
    assert.ok(c.title && c.text.length > 60 && !/verify/i.test(c.text), `${c.id}: a title and a text of our own`)
    assert.ok(c.backing.length >= 3, `${c.id}: rests on quotes`)
    for (const b of c.backing) {
      assert.ok(b.quote.length > 10 && b.checked === 'by script', `${c.id}: a quote found by the script`)
      assert.match(b.source.url, NASA, `${c.id}: a NASA page`)
    }
  }
  // the figures the game repeats are in the sentences the cards rest on
  const says = (id: Parameters<typeof stationCard>[0], words: string) => assert.ok(stationCard(id).backing.some(b => b.quote.includes(words)), `${id} says "${words}"`)
  says('iss-water', `${WATER_BRINE_PCT}% water recovery`)
  says('iss-water', `between ${WATER_BASE_PCT} and 94%`)
  says('crew-day', 'two hours a day')
  says('apollo13-filter', 'square canisters')
  says('mir-fire', 'Feb. 24, 1997')
  says('dust-2018', 'nuclear-powered battery')
})

test('the Earth photographs are real station frames, saved beside the game', () => {
  assert.equal(EARTH_PHOTOS.length, 8)
  assert.equal(new Set(EARTH_PHOTOS.map(p => p.id)).size, 8)
  for (const p of EARTH_PHOTOS) {
    assert.match(p.id, /^iss\d{3}e\d+$/, 'a frame number of the International Space Station')
    assert.ok(existsSync(join('public', p.file)), `photo saved: ${p.file}`)
    assert.equal(p.page, `https://images.nasa.gov/details/${p.id}`)
    assert.ok(p.title && p.caption.length > 40 && p.taken && p.credit === 'NASA', `${p.id}: NASA's caption, date and credit`)
    assert.ok(!p.caption.startsWith(p.id), 'the caption does not repeat the frame number')
  }
})

// ---------------------------------------------------------------- power, in per cent
test('power is shown as a share of the station, never as bare units', () => {
  assert.equal(powerPct(4), '40%')
  assert.equal(powerPct(0), '0%')
  assert.equal(powerPct(LIFE_NEED), '30%')
  assert.match(powerBlock({ life: 2, comms: 4, research: 2 })!, /Life support needs at least 30% of the station's power/)
  assert.match(powerBlock({ life: 3, comms: 3, research: 2 })!, /Communications needs at least 40% of the station's power/)
  assert.equal(COMMS_NEED, 4)
  assert.equal(powerBlock({ life: 3, comms: 4, research: 3 }), null)
  assert.match(docked().setPower({ life: 6, comms: 5, research: 0 })!, /100%/)
})

// ---------------------------------------------------------------- S5 crew schedule
test('a crew day: sleep, exercise and rest hold performance up, overwork pulls it down', () => {
  assert.equal(SCHEDULE_START.length, DAY_BLOCKS)
  assert.equal(ACTIVITIES.length, 4)
  assert.equal(EXERCISE_NEED_H, 2, 'the two hours of exercise NASA reports')
  const start = crewDay(SCHEDULE_START)
  assert.ok(start.performance < SCHEDULE_TARGET, `the day the crew arrives with is a bad one: ${start.performance}%`)
  assert.deepEqual(start.costs.map(c => c.activity), ['sleep', 'exercise', 'rest', 'work'])
  const good = crewDay(GOOD_DAY)
  assert.deepEqual(good.hours, { sleep: 8, work: 8, exercise: 2, rest: 6 })
  assert.equal(good.performance, 100)
  assert.equal(good.costs.length, 0)
  // two more hours of work for two fewer of rest: more points, a less rested crew
  const busy: Activity[] = ['sleep', 'sleep', 'sleep', 'sleep', 'work', 'work', 'exercise', 'rest', 'work', 'work', 'work', 'rest']
  assert.equal(crewDay(busy).performance, 88)
  assert.ok(schedulePoints(busy) > schedulePoints(GOOD_DAY), 'more work is worth more points')
  assert.ok(alertTimeFactor(crewDay(busy).performance) < alertTimeFactor(100), 'and costs the bonus time in an alert')
  assert.deepEqual([alertTimeFactor(null), alertTimeFactor(95), alertTimeFactor(80), alertTimeFactor(60)], [1, 1.15, 1, 0.75])
  assert.match(scheduleBlock(GOOD_DAY.slice(1))!, /all 12 blocks/)
  assert.match(scheduleBlock(Array(12).fill('sleep'))!, /at least 6 hours of work/)
  assert.match(scheduleBlock(Array(12).fill('work'))!, /without sleep/)
  assert.equal(schedulePoints(SCHEDULE_START), 10, 'a day under the target is worth little')
})

test('the crew gets its day once, and it sets the time every alert allows', () => {
  const m = docked()
  assert.equal(m.crewPerformance, null)
  assert.equal(m.alertSeconds(SCRUBBER_SECONDS), SCRUBBER_SECONDS, 'no plan yet: the time is unchanged')
  assert.equal(m.planDay(GOOD_DAY), null)
  assert.equal(m.crewPerformance, 100)
  assert.ok(m.completed.has('schedule') && !m.failed.has('schedule'))
  assert.match(m.planDay(GOOD_DAY)!, /already has its day/)
  assert.equal(m.alertSeconds(SCRUBBER_SECONDS), 104)
  assert.equal(m.alertSeconds(CABIN_SECONDS), 35)
  const tired = docked()
  assert.equal(tired.planDay(SCHEDULE_START), null, 'a bad day can still be handed over')
  assert.ok(tired.completed.has('schedule') && tired.failed.has('schedule'))
  assert.equal(tired.alertSeconds(CABIN_SECONDS), 23)
  assert.ok(tired.stationCauses().some(c => !c.good && /tired crew had 25% less time/.test(c.text)))
})

// ---------------------------------------------------------------- S2 water loop
test('the water loop: the right order, then a filter bed and the brine processor decide the recovery', () => {
  assert.ok(loopCheck(LOOP_ORDER).ok)
  assert.match(loopCheck(['distiller', 'filters']).message, /all four parts/)
  assert.match(loopCheck(['filters', 'distiller', 'reactor', 'tank']).message, /raw waste/)
  assert.match(loopCheck(['distiller', 'reactor', 'filters', 'tank']).message, /reactor needs clear water/)
  assert.match(loopCheck(['distiller', 'filters', 'tank', 'reactor']).message, /tank must come last/)
  assert.deepEqual([waterRecovery(true, false), waterRecovery(true, true), waterRecovery(false, false), waterRecovery(false, true)], [93, 98, 85, 90])
  assert.ok(waterWon(true, false) && waterWon(true, true))
  assert.ok(!waterWon(false, true), 'a clogged bed is never safe, even at the target')
  assert.equal(WATER_TARGET, 90)
  assert.deepEqual([waterBonus(true, false), waterBonus(true, true), waterBonus(false, true)], [WATER_BONUS, 8, 0])
  assert.deepEqual([waterPoints(true, false), waterPoints(true, true), waterPoints(false, false)], [45, 60, 10])
})

test('a fresh filter bed is paid from the mission budget, and the brine processor follows the power grid', () => {
  const m = aboard()
  const before = m.credits
  assert.equal(m.filterBlock(), null)
  assert.equal(m.runWaterLoop(true), null)
  assert.equal(before - m.credits, FILTER_COST)
  assert.match(m.runWaterLoop(true)!, /already run/)
  assert.ok(m.completed.has('water') && !m.failed.has('water'))
  m.setPower({ life: 3, comms: 4, research: 3 })
  assert.deepEqual([m.brineOn, m.waterPct, m.waterBonus], [false, 93, WATER_BONUS])
  m.setPower({ life: BRINE_LIFE_UNITS, comms: 4, research: 2 })
  assert.deepEqual([m.brineOn, m.waterPct, m.waterBonus], [true, 98, 8], 'life support at 40% runs the brine processor')
  assert.ok(purifier(m), 'a working loop also feeds the greenhouse')
  // the old bed is free, and it fails the task
  const cheap = aboard()
  const had = cheap.credits
  assert.equal(cheap.runWaterLoop(false), null)
  assert.equal(cheap.credits, had)
  assert.ok(cheap.completed.has('water') && cheap.failed.has('water'))
  assert.equal(cheap.waterBonus, 0)
  assert.ok(!purifier(cheap))
  assert.ok(cheap.stationCauses().some(c => !c.good && /clogged filter bed/.test(c.text)))
  // a filter bed is refused when it would leave too little for the rover's rocket
  const broke = aboard()
  Object.defineProperty(broke, 'credits', { get: () => 12 })
  assert.match(broke.filterBlock()!, /fresh filter bed costs 3 cr/)
  assert.match(broke.runWaterLoop(true)!, /fresh filter bed costs 3 cr/)
  assert.equal(broke.waterLoop, null)
})

// ---------------------------------------------------------------- S1 scrubber adapter
test('the adapter: two parts look right for each job, and one of them works', () => {
  assert.equal(ADAPTER_ROLES.length, 4)
  assert.equal(ADAPTER_PARTS.length, 8)
  for (const r of ADAPTER_ROLES) assert.equal(ADAPTER_PARTS.filter(p => p.fits === r.id).length, 1, `${r.id}: one part fits`)
  for (const p of ADAPTER_PARTS.filter(x => !x.fits)) {
    const twin = ADAPTER_PARTS.find(x => x.fits && x.shape === p.shape && x.size.split(' ')[0] === p.size.split(' ')[0] || x.fits && x.shape === p.shape)
    assert.ok(twin, `${p.name} looks like a part that works`)
    assert.ok(p.fault.length > 20, `${p.name} says why it fails`)
  }
  const right: AdapterPicks = { enclose: 'bag', brace: 'card', reach: 'hose', seal: 'tape' }
  assert.deepEqual(adapterFaults(right), [])
  assert.equal(adapterFaults({}).length, 4)
  const wrong = adapterFaults({ ...right, enclose: 'towel', reach: 'pipe' })
  assert.deepEqual(wrong.map(f => f.role), ['enclose', 'reach'])
  assert.match(wrong[0].text, /weave/)
  assert.match(wrong[1].text, /wider than the socket/)
  assert.match(adapterFaults({ ...right, seal: 'bag', enclose: 'tape' })[0].text, /Duct tape cannot wrap the square canister/)
  for (const seed of [1, 7, 99]) assert.deepEqual([...adapterInventory(dice(seed))].sort(), ADAPTER_PARTS.map(p => p.id).sort())
  assert.notDeepEqual(adapterInventory(dice(1)), adapterInventory(dice(7)))
  assert.equal(SCRUBBER_SECONDS, 90)
  assert.deepEqual([co2Pct(0, 90), co2Pct(45, 90), co2Pct(90, 90), co2Pct(200, 90)], [40, 70, 100, 100])
  assert.deepEqual([alertPoints(0), alertPoints(0.5), alertPoints(1), alertPoints(3)], [40, 60, ALERT_POINTS, ALERT_POINTS])
})

// ---------------------------------------------------------------- S3 power rationing
test('power rationing: what stays on has to last the blackout, and the restart has an order', () => {
  assert.equal(blackout([]).left, 0, 'everything left on runs the battery flat')
  assert.equal(shedBlock('heater'), null)
  assert.match(shedBlock('air')!, /cannot be switched off/)
  assert.match(shedBlock('bus')!, /cannot be switched off/)
  const spare = ['lights', 'lab', 'greenhouse']
  // navigation keeps the arrays on the Sun: with it off, the blackout lasts an hour longer
  assert.deepEqual([blackout([...spare, 'comms']).hours, blackout([...spare, 'nav']).hours], [BLACKOUT_HOURS, BLACKOUT_HOURS + 1])
  assert.equal(blackout([...spare, 'comms']).left, 36)
  assert.equal(blackout(spare).left, 24)
  assert.equal(blackout([...spare, 'comms', 'nav']).left, 35)
  assert.ok(blackout([...spare, 'heater']).frozen)
  // the restart: navigation after communications, the racks after the lights, the greenhouse last
  const up = ['bus', 'air', 'heater'], waiting = ['comms', 'nav', 'lights', 'lab', 'greenhouse']
  assert.match(restartBlock('nav', up, waiting)!, /communications must be running first/)
  assert.match(restartBlock('lab', up, waiting)!, /cabin lights must be running first/)
  assert.match(restartBlock('greenhouse', up, waiting)!, /biggest load goes last/)
  assert.equal(restartBlock('comms', up, waiting), null)
  assert.equal(restartBlock('greenhouse', [...up, 'comms', 'nav', 'lights', 'lab'], ['greenhouse']), null)
  // every set of systems that can be switched off has an order that brings it all back
  const sheddable = RATION_SYSTEMS.filter(s => !shedBlock(s.id)).map(s => s.id)
  for (let mask = 0; mask < 1 << sheddable.length; mask++) {
    const off = sheddable.filter((_, i) => mask & (1 << i))
    const order = restartOrder(off)
    assert.deepEqual([...order].sort(), [...off].sort(), `${off.join(', ') || 'nothing'} can all be restarted`)
    const running = RATION_SYSTEMS.map(s => s.id).filter(id => !off.includes(id)), left = [...off]
    for (const id of order) { assert.equal(restartBlock(id, running, left), null); running.push(id); left.splice(left.indexOf(id), 1) }
  }
  // how it ends
  assert.ok(rationResult([...spare, 'comms'], 0).won)
  assert.equal(rationResult([...spare, 'comms'], 0).left, 36)
  assert.equal(rationResult([...spare, 'comms'], 2).left, 36 - 2 * RESTART_PENALTY)
  assert.match(rationResult([...spare, 'heater'], 0).why, /cabin froze/)
  assert.match(rationResult([], 0).why, /ran flat/)
  const thin = rationResult(spare, 7)
  assert.ok(!thin.won && thin.left < BATTERY_FLOOR)
  assert.match(thin.why, /under the 5%/)
  assert.equal(rationPoints(rationResult([...spare, 'comms'], 0)), ALERT_POINTS)
  assert.ok(rationPoints(rationResult(spare, 0)) < ALERT_POINTS && rationPoints(rationResult(spare, 0)) > 40)
  assert.equal(rationPoints(thin), 0)
})

// ---------------------------------------------------------------- S4 cabin alarm
test('the cabin alarm: the worst reading is the source, and the four steps have one right answer each', () => {
  // the plan of the alarm panel is the deck the crew walks
  assert.deepEqual(CABIN_MODULES.map(m => m.id).sort(), MODULES.map(m => m.id).sort())
  assert.deepEqual(CABIN_LINKS.map(l => `${l.id}:${[l.a, l.b].sort()}`).sort(), LINKS.map(l => `${l.id}:${[l.a, l.b].sort()}`).sort())
  assert.ok(!CABIN_SOURCES.includes(MUSTER) && !CABIN_SOURCES.includes('node2'), 'the way to the ship home is never where it starts')
  const seen = new Set<string>()
  for (let seed = 1; seed <= 60; seed++) {
    const a = newCabinAlarm(dice(seed))
    seen.add(`${a.hazard}:${a.source}`)
    assert.ok(CABIN_SOURCES.includes(a.source))
    const worst = (m: (typeof CABIN_MODULES)[number]['id']) => a.hazard === 'fire' ? a.readings[m].smoke : -a.readings[m].pressure
    for (const m of CABIN_MODULES) if (m.id !== a.source) assert.ok(worst(a.source) > worst(m.id), `seed ${seed}: the source reads worst`)
    const beside = CABIN_LINKS.filter(l => l.a === a.source || l.b === a.source).map(l => (l.a === a.source ? l.b : l.a))
    for (const m of beside) assert.ok(worst(m) > worst(MUSTER) || beside.includes(MUSTER), `seed ${seed}: a neighbour reads a little off`)
    // one path through the four steps
    assert.ok(cabinMove(a, 'identify', a.source).ok)
    assert.ok(!cabinMove(a, 'identify', MUSTER).ok)
    for (const h of hatchesOf(a.source)) assert.ok(cabinMove(a, 'seal', h).ok)
    const other = CABIN_LINKS.find(l => !hatchesOf(a.source).includes(l.id))!
    assert.match(cabinMove(a, 'seal', other.id).text, /does not open onto/)
    const stop = SHUTDOWNS.find(s => s.stops === a.hazard)!
    assert.ok(cabinMove(a, 'shutdown', stop.id).ok)
    assert.ok(!cabinMove(a, 'shutdown', 'water').ok)
    assert.ok(cabinMove(a, 'muster', MUSTER).ok)
    assert.match(cabinMove(a, 'muster', a.source).text, /ship home is docked/)
  }
  assert.ok(seen.size >= 8, `both hazards and most modules come up: ${seen.size} kinds in 60 alarms`)
  assert.deepEqual(CABIN_STEPS, ['identify', 'seal', 'shutdown', 'muster'])
  assert.deepEqual(hatchesOf('node1').sort(), ['greenhouse', 'n1-lab', 'n3-n1'])
  assert.equal(CABIN_SECONDS, 30)
})

// ---------------------------------------------------------------- relay repair
test('the relay is tuned two to four times, by a different amount each time', () => {
  const rounds = new Set<number>()
  for (let seed = 1; seed <= 200; seed++) {
    const t = newRelayTuning(dice(seed)).targets
    rounds.add(t.length)
    assert.ok(t.length >= RELAY_MIN_ROUNDS && t.length <= RELAY_MAX_ROUNDS)
    const moves = t.map((x, i) => Math.abs(x - (i ? t[i - 1] : 50)))
    assert.equal(new Set(moves).size, moves.length, `seed ${seed}: no two adjustments are the same size (${moves.join(', ')})`)
    for (const [i, x] of t.entries()) {
      assert.ok(x >= 6 && x <= DIAL_MAX - 6, 'the carrier stays on the dial')
      assert.ok(moves[i] > RELAY_TOLERANCE * 2, 'each drift is far enough to be heard')
    }
  }
  assert.deepEqual([...rounds].sort(), [2, 3, 4])
  assert.notDeepEqual(newRelayTuning(dice(3)).targets, newRelayTuning(dice(4)).targets, 'no two repairs are alike')
  assert.deepEqual([relayNoise(60, 60), relayNoise(40, 60), relayNoise(0, 90)], [0, 0.5, 1])
  assert.deepEqual([relayQuality(60, 60), relayQuality(50, 60), relayQuality(0, 90)], [100, 75, 0])
  assert.ok(relayOnCarrier(60 + RELAY_TOLERANCE, 60) && !relayOnCarrier(60 + RELAY_TOLERANCE + 1, 60))
})

// ---------------------------------------------------------------- the alerts of a run
test('a run has one or two of the three alerts, and they go off as the station gets ready', () => {
  const counts = new Set<number>(), firsts = new Set<string>()
  for (let seed = 1; seed <= 80; seed++) {
    const plan = planAlerts(dice(seed))
    counts.add(plan.length)
    firsts.add(plan[0])
    assert.equal(new Set(plan).size, plan.length)
    for (const id of plan) assert.ok(ALERT_IDS.includes(id))
  }
  assert.deepEqual([...counts].sort(), [1, 2])
  assert.equal(firsts.size, 3, 'any of the three can come first')
  assert.deepEqual(ALERT_AFTER, [1, 4])

  const m = docked()
  m.rng = () => 0.999 // two alerts: the scrubber, then the power-down
  assert.deepEqual(m.alertPlan, ['scrubber', 'rationing'])
  assert.equal(m.alertDue(), null, 'nothing done yet: no alert')
  assert.equal(m.planDay(GOOD_DAY), null)
  assert.equal(m.alertDue(), 'scrubber', 'the first alert follows the first main mission')
  assert.equal(m.selectInstrument('ir'), null)
  assert.equal(m.activatePayload(), null)
  m.complete('relay', 'test')
  assert.match(m.roverAccess()!, /water recycling loop/)
  assert.equal(m.runWaterLoop(false), null)
  assert.match(m.roverAccess()!, /station alert/, 'the rover waits for the alert')
  assert.equal(m.startAlert('scrubber'), null)
  assert.equal(m.alertDue(), null)
  assert.match(m.startAlert('rationing')!, /under way/)
  assert.match(m.roverAccess()!, /station alert/)
  assert.ok(m.endAlert('scrubber', true, 70, 'adapter fitted'))
  assert.ok(m.completed.has('scrubber') && m.crewHealth === 100)
  assert.equal(m.alertDue(), 'rationing', 'the second follows once all four main missions are done')
  assert.equal(m.startAlert('rationing'), null)
  assert.ok(m.endAlert('rationing', false, 70, 'the battery ran flat.'))
  assert.ok(!m.completed.has('rationing') && m.failed.has('rationing'))
  assert.equal(m.crewHealth, 100 - HEALTH_COST.rationing)
  assert.equal(m.alertResults.rationing!.points, 0)
  assert.equal(m.alertDue(), null)
  assert.equal(m.roverAccess(), null, 'with both alerts over, the rover unlocks')
  assert.ok(!m.endAlert('rationing', true, 80, 'again'), 'an alert ends once')
  assert.match(m.startAlert('scrubber')!, /is over/)
  assert.ok(m.stationCauses().some(c => !c.good && /Power rationing: the battery ran flat\. Crew health −20%/.test(c.text)))
})

test('the rover unlocks only after the station\'s main missions', () => {
  const m = docked()
  assert.match(m.roverAccess()!, /Activate the payload/)
  m.selectInstrument('ir'); m.activatePayload()
  assert.match(m.roverAccess()!, /Relay fault/)
  m.complete('relay', 'test')
  assert.match(m.roverAccess()!, /crew's day at Crew Quarters/)
  m.planDay(GOOD_DAY)
  assert.match(m.roverAccess()!, /water recycling loop at Hab Systems/)
  m.runWaterLoop(false)
  assert.match(m.roverAccess()!, /station alert/)
  clearAlerts(m)
  assert.equal(m.roverAccess(), null)
  assert.equal(m.stationSteps, 4)
})

// ---------------------------------------------------------------- the dust storm
test('a dust storm slows the rover, so every metre costs more battery, until it passes', () => {
  const m = aboard()
  stationReady(m)
  m.setPower({ life: 3, comms: 4, research: 2 })
  m.rng = () => 0
  assert.equal(m.chooseRover('perseverance'), null)
  assert.equal(m.chooseRocket('atlas541'), null)
  // wheel trouble is behind this mission, so the dice below decide the dust alone
  m.rescue = newRescue('rock', m.pos, 'A', m.wheelWear, () => 0.5)
  m.rescue.tries.push({ fix: 'reverse', freed: true, sols: 0.5, wear: 0, text: 'The rover backed out.' })
  m.rescue.result = 'clean'
  const real = ROVERS.perseverance
  m.addWaypoint({ x: 0, y: 120 })
  assert.equal(m.deploy(), null)
  assert.equal(dustOf(m), null, 'never on the first drive, whatever the dice say')
  const calm = driveWhPerM(m.rover!, false)
  m.addWaypoint({ x: 0, y: 240 })
  assert.equal(m.deploy(), null)
  assert.ok(dustOf(m) && m.dustActive, 'a low roll brings the storm after the second drive')
  assert.ok(DUST_CHANCE > 0 && DUST_CHANCE < 1)
  assert.equal(dustLeft(m), 2)
  assert.equal(m.rover!.topSpeedMh, Math.round(real.topSpeedMh * DUST_SPEED))
  const dusty = driveWhPerM(m.rover!, false)
  assert.ok(Math.abs(dusty / calm - 1 / DUST_SPEED) < 0.02, `each metre costs about ${Math.round((1 / DUST_SPEED - 1) * 100)}% more: ${calm.toFixed(2)} to ${dusty.toFixed(2)} Wh`)
  // the same drive, forecast in the storm, costs more than it would in clear air
  m.addWaypoint({ x: 0, y: 500 })
  const inDust = m.forecast()!
  dustOf(m)!.untilHours = m.hoursUsed // the storm passes
  assert.ok(!m.dustActive && dustLeft(m) === 0)
  assert.equal(m.rover!.topSpeedMh, real.topSpeedMh)
  const clear = m.forecast()!
  assert.ok(inDust.usedWh > clear.usedWh && inDust.hours > clear.hours)
  // one storm a mission
  const first = dustOf(m)
  assert.equal(m.deploy(), null)
  assert.equal(dustOf(m), first)
  assert.ok(m.causes().some(c => !c.good && /dust storm slowed the rover to 70% of its speed/.test(c.text)))
  // a high roll: no storm at all
  const lucky = aboard()
  stationReady(lucky)
  lucky.setPower({ life: 3, comms: 4, research: 2 })
  lucky.rng = () => 0
  lucky.chooseRover('perseverance'); lucky.chooseRocket('atlas541')
  lucky.rng = () => 0.999
  for (const y of [120, 240, 360]) { lucky.addWaypoint({ x: 0, y }); assert.equal(lucky.deploy(), null) }
  assert.equal(dustOf(lucky), null)
})

// ---------------------------------------------------------------- the mission score
test('every task adds to the mission score, and the report lists what was done and what was missed', () => {
  const fresh = docked()
  fresh.rng = () => 0 // one alert in this run
  const start = missionScore(fresh)
  assert.equal(start.total, 50, 'nothing done: only a crew in full health counts')
  assert.equal(start.max, start.lines.reduce((n, l) => n + l.max, 0))
  assert.deepEqual(start.done.map(l => l.id), ['health'])
  assert.ok(['schedule', 'payload', 'relay', 'power', 'water', 'calibration', 'battery', 'cargo', 'medical', 'greenhouse', 'earth', 'rocket', 'drive', 'samples', 'base', 'habitat'].every(id => start.missed.some(l => l.id === id)))
  assert.ok(!start.lines.some(l => ALERT_IDS.includes(l.id as never)), 'an alert that has not gone off is not counted against the player')
  assert.ok(!start.lines.some(l => l.id === 'rescue'), 'nor is a rescue that never happened')

  // each task done moves its points from missed to done
  const m = docked()
  m.rng = () => 0
  const points = (id: string) => missionScore(m).lines.find(l => l.id === id)!
  let last = missionScore(m).total
  const gained = (what: string) => { const now = missionScore(m).total; assert.ok(now > last, `${what} adds points (${last} to ${now})`); last = now }
  m.planDay(GOOD_DAY); gained('the crew schedule')
  assert.equal(points('schedule').points, 50)
  m.selectInstrument('ir'); m.activatePayload(); gained('the payload')
  m.complete('relay', 'test'); gained('the relay')
  m.setPower({ life: 4, comms: 4, research: 2 }); gained('the power')
  m.runWaterLoop(true); gained('the water loop')
  assert.deepEqual([points('water').points, points('water').state], [60, 'done'])
  m.setPower({ life: 3, comms: 4, research: 3 })
  assert.equal(points('water').points, 45, 'without the brine processor the loop is worth less')
  last = missionScore(m).total
  for (const t of ['calibration', 'battery', 'cargo', 'medical', 'earth'] as const) { m.complete(t, 'test'); gained(t) }
  const [alert] = m.alertPlan
  m.startAlert(alert); m.endAlert(alert, true, 64, 'dealt with'); gained('an alert')
  assert.deepEqual([points(alert).points, points(alert).max, points(alert).state], [64, ALERT_POINTS, 'done'])
  m.chooseRover('perseverance'); m.chooseRocket('atlas541'); gained("the rover's rocket")
  m.rng = () => 0.999
  m.addWaypoint({ x: 0, y: 150 }); m.deploy(); m.runTest('photo'); gained('a drive and a photograph')
  m.decideBase(m.spotHere!.id); gained('the base')
  m.complete('habitat', 'test'); gained('the habitat')
  const end = missionScore(m)
  assert.equal(end.total, end.lines.reduce((n, l) => n + l.points, 0))
  assert.ok(end.missed.some(l => l.id === 'samples') && end.missed.some(l => l.id === 'greenhouse'), 'what was skipped is listed as missed')
  for (const l of end.lines) assert.ok(l.points >= 0 && l.points <= l.max && l.name && l.note, `${l.id}: points within its maximum, with a note`)

  // an alert that is not dealt with scores nothing and costs the crew
  const hurt = docked()
  hurt.rng = () => 0
  const [id] = hurt.alertPlan
  hurt.startAlert(id); hurt.endAlert(id, false, 80, 'too late.')
  const s = missionScore(hurt)
  assert.deepEqual([s.lines.find(l => l.id === id)!.points, s.lines.find(l => l.id === id)!.state], [0, 'failed'])
  assert.equal(s.lines.find(l => l.id === 'health')!.points, (100 - HEALTH_COST[id]) / 2)
  assert.ok(s.missed.some(l => l.id === id) && s.missed.some(l => l.id === 'health'))
})
