// Mission design on the ground: one budget, real weight, and no launch system that is best at
// everything. Also what the design does to the rest of the mission, and how a launch is explained.
import test from 'node:test'
import assert from 'node:assert/strict'
import { flyAscent, liftLimitKg } from '../src/core/ascent'
import { CELLS_BONUS, EXTRAS, INSTRUMENTS, MISSION_BUDGET, SHIPS, byId, type ExtraId, type InstrumentId, type ShipId } from '../src/core/data'
import {
  STARTER, cargoKg, cleanLoadout, designBlock, designCost, designForecast, extraNote, failureCauses, launchCauses, liftLine, type LaunchRecord, type Loadout,
} from '../src/core/loadout'
import { Mission } from '../src/core/mission'

const ship = (id: ShipId) => byId(SHIPS, id)
const load = (instruments: InstrumentId[], extras: ExtraId[] = []): Loadout => ({ instruments, extras })
const EVERYTHING = load(['ir', 'gpr'], ['water', 'kit', 'cells'])

test('a loadout keeps only known items, once each, in catalogue order', () => {
  assert.deepEqual(cleanLoadout({ instruments: ['gpr', 'ir', 'ir', 'laser'], extras: ['cells', 'water', 42] }), load(['ir', 'gpr'], ['water', 'cells']))
  for (const junk of [null, undefined, 3, 'ir', [], { instruments: 'ir' }, { extras: {} }]) assert.deepEqual(cleanLoadout(junk), load([]))
})

test('cost and weight add up, and the budget is one pot for the whole mission', () => {
  assert.equal(cargoKg(load([])), 0)
  assert.equal(cargoKg(EVERYTHING), INSTRUMENTS.reduce((kg, i) => kg + i.massKg, 0) + EXTRAS.reduce((kg, x) => kg + x.massKg, 0))
  for (const s of SHIPS) {
    const c = designCost(s, load(['gpr'], ['water']))
    assert.deepEqual(c, { launch: s.launchCost, instruments: 68, extras: 15, spent: s.launchCost + 83, left: MISSION_BUDGET - s.launchCost - 83 })
    assert.equal(designCost(s, load([])).left, s.budget)
  }
})

test('only the budget and an empty instrument bay stop a launch; weight is the pilot\'s risk', () => {
  for (const s of SHIPS) {
    assert.match(designBlock(s, load([], ['water']))!, /at least one instrument/)
    assert.equal(designBlock(s, STARTER), null, `${s.id}: the starter design may launch`)
    assert.equal(designForecast(s, STARTER).verdict, 'comfortable', `${s.id}: and it launches with room to spare`)
  }
  assert.match(designBlock(ship('shuttle'), EVERYTHING)!, /Over budget by \d+ cr/)
  // far too heavy for the Atlas V, but inside the budget: nothing blocks it, the forecast says what will happen
  const heavy = load(['ir'], ['water', 'kit'])
  assert.equal(designBlock(ship('atlasv'), heavy), null)
  assert.ok(cargoKg(heavy) > liftLimitKg('atlasv'))
  assert.equal(designForecast(ship('atlasv'), heavy).verdict, 'short')
  assert.match(liftLine(ship('atlasv'), heavy), /Too heavy by about \d+ kg/)
  assert.equal(flyAscent('atlasv', cargoKg(heavy)).outcome, 'out-of-propellant', 'and the flight agrees with the forecast')
})

test('no launch system is best at everything', () => {
  const by = <K extends 'launchCost' | 'payloadKg' | 'battery' | 'handoffMin'>(k: K) => [...SHIPS].sort((a, b) => a[k] - b[k]).map(s => s.id)
  assert.equal(by('launchCost')[0], 'falcon9', 'Falcon 9 is the cheapest')
  assert.equal(by('payloadKg').at(-1), 'shuttle', 'the Shuttle carries the most')
  assert.equal(by('payloadKg')[0], 'atlasv', 'the Atlas V the least')
  assert.equal(by('launchCost').at(-1), 'shuttle', 'and the Shuttle costs the most')
  assert.equal(by('battery')[0], 'falcon9', 'Falcon 9 delivers the rover with the least charge')
  assert.equal(by('handoffMin')[0], 'shuttle', 'the Shuttle has the shortest relay hand-off')
  for (const s of SHIPS) assert.ok(s.pros.length >= 2 && s.cons.length >= 2, `${s.id} shows both sides`)

  // the same wish list comes out differently on each
  const both = load(['ir', 'gpr'])
  assert.equal(designBlock(ship('falcon9'), both), null, 'both instruments fit the budget only on the cheapest launch')
  assert.ok(designBlock(ship('atlasv'), both) && designBlock(ship('shuttle'), both))
  const supplied = load(['gpr'], ['water', 'kit']) // 31 kg
  assert.equal(designBlock(ship('shuttle'), supplied), null)
  assert.equal(designForecast(ship('shuttle'), supplied).outcome, 'orbit', 'the Shuttle lifts a fully supplied radar mission')
  assert.equal(designCost(ship('shuttle'), supplied).left, 0, 'and has nothing left afterwards')
  assert.equal(designForecast(ship('atlasv'), supplied).outcome, 'out-of-propellant', 'the Atlas V cannot lift it')
  assert.ok(['marginal', 'tight'].includes(designForecast(ship('falcon9'), supplied).verdict), 'Falcon 9 can, just, if it is flown well')
  const all = load(['gpr'], ['water', 'kit', 'cells']) // 36 kg
  assert.equal(designForecast(ship('falcon9'), all).verdict, 'short', 'one more item and Falcon 9 falls short')
})

test('supplies that do nothing on a launch system say so', () => {
  assert.match(extraNote(ship('shuttle'), 'cells')!, /No effect/)
  assert.match(extraNote(ship('atlasv'), 'cells')!, /No effect/)
  assert.match(extraNote(ship('falcon9'), 'cells')!, /100% instead of 92%/)
  assert.equal(extraNote(ship('falcon9'), 'water'), null)
})

test('the design carries through the mission: what was loaded, what was spent, what it saves', () => {
  const bare = new Mission({ callSign: 'Ada', suit: 'ember', ship: 'falcon9', loadout: load(['ir']) })
  const full = new Mission({ callSign: 'Ada', suit: 'ember', ship: 'falcon9', loadout: load(['ir'], ['water', 'kit', 'cells']) })
  assert.equal(bare.credits, MISSION_BUDGET - 22 - 42)
  assert.equal(full.credits, MISSION_BUDGET - 22 - 42 - 15 - 8 - 10)
  assert.equal(bare.instrumentDraft, 'ir', 'one instrument aboard is already in the rover bay')
  assert.match(bare.instrumentBlock('gpr')!, /stayed on Earth/)
  assert.equal(bare.startBattery, 92)
  assert.equal(full.startBattery, Math.min(100, 92 + CELLS_BONUS))
  assert.ok(bare.waterCost > 0 && bare.kitCost > 0)
  assert.deepEqual([full.waterCost, full.kitCost], [0, 0], 'supplies carried from Earth are not bought again')
  // carrying them was cheaper than buying them at the landing
  assert.ok(byId(EXTRAS, 'water').cost < bare.waterCost && byId(EXTRAS, 'kit').cost < bare.kitCost)
  const two = new Mission({ callSign: 'Ada', suit: 'ember', ship: 'falcon9', loadout: load(['ir', 'gpr']) })
  assert.equal(two.instrumentDraft, null, 'with two aboard the pilot still has to mount one')
  assert.equal(two.instrumentBlock('gpr'), null)
  assert.equal(two.credits, MISSION_BUDGET - 22 - 42 - 68, 'and both were paid for')
})

test('a failed launch is explained by the choice or the handling that caused it', () => {
  const s = ship('falcon9')
  // too much weight: the debrief names the weight
  const heavy = load(['gpr'], ['water', 'kit', 'cells'])
  const short = failureCauses(s, heavy, flyAscent('falcon9', cargoKg(heavy)))
  assert.match(short.parts.join(' '), /Weight decided it: 36 kg of cargo is \d+ kg more than a perfect ascent can lift/)
  // a fine design flown badly: the debrief names the steering and says the guidance would have made it
  const light = load(['ir'])
  const drift = flyAscent('falcon9', cargoKg(light), () => ({ turn: 0, throttle: 1 }))
  const why = failureCauses(s, light, drift)
  assert.ok(!/Weight decided it/.test(why.parts.join(' ')))
  assert.ok(why.headline.length > 5 && why.parts.length >= 1)
  const lagging = flyAscent('falcon9', 25, a => ({ turn: a.t < 30 ? 0 : 1, throttle: 1 }))
  if (lagging.outcome === 'out-of-propellant') assert.match(failureCauses(s, load(['ir'], ['water', 'kit']), lagging).parts.join(' '), /steering decided it/)
  // a break-up: the debrief names the air load and where it happened
  const torn = flyAscent('shuttle', 7, a => ({ turn: a.t > 9 && a.t < 12 ? 1 : 0, throttle: 1 }))
  assert.equal(torn.outcome, 'breakup')
  const blast = failureCauses(ship('shuttle'), light, torn)
  assert.equal(blast.headline, 'Broke up under air load')
  assert.match(blast.parts[0], /sideways air load reached \d+% of what the Space Shuttle stack takes/)
  // a stack that cannot lift at all
  const pad = failureCauses(s, EVERYTHING, flyAscent('falcon9', 600))
  assert.match(pad.headline, /never left the pad/)
})

test('the report says how the launch went and what it took', () => {
  const s = ship('atlasv')
  const rec: LaunchRecord = { attempts: 1, failures: [], cargoKg: 13, marginPct: 7.2, forecastPct: 9.4, seconds: 81, assisted: false }
  const first = launchCauses(s, rec)
  assert.equal(first.ok, true)
  assert.match(first.headline, /Reached orbit on the first launch, 81 s/)
  assert.match(first.parts.join(' '), /Flown by hand: 7% of the upper stage's propellant left at orbit, against 9% for the guidance line/)
  const third = launchCauses(s, { ...rec, attempts: 3, failures: ['breakup', 'out-of-propellant'], assisted: true })
  assert.equal(third.ok, false)
  assert.match(third.headline, /Reached orbit on launch 3/)
  assert.match(third.parts.join(' '), /The guidance flew the ascent/)
  assert.match(third.parts.join(' '), /Earlier attempts: it broke up under air load; it ran out of propellant short of orbit\./)
})
