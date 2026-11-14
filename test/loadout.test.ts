// Mission design on the ground: one budget, real weight, and no launch system that is best at
// everything. Then what each item of station cargo does once it is aboard, and how a launch is explained.
import test from 'node:test'
import assert from 'node:assert/strict'
import { flyAscent, liftLimitKg } from '../src/core/ascent'
import { CARGO, INSTRUMENTS, MISSION_BUDGET, SHIPS, byId, cargoStep, type CargoId, type ShipId } from '../src/core/data'
import {
  INSTRUMENT_MIN, STARTER, aboard, cargoKg, cargoValue, cleanLoadout, designBlock, designCost, designForecast, failureCauses, instrumentLine, launchCauses, liftLine,
  type LaunchRecord, type Loadout,
} from '../src/core/loadout'
import { Mission } from '../src/core/mission'
import type { Power } from '../src/core/power'
import { ROVERS } from '../src/core/rovers'
import { MISSION_SOLS, testWh } from '../src/core/survey'

const ship = (id: ShipId) => byId(SHIPS, id)
const load = (cargo: Partial<Record<CargoId, number>> = {}): Loadout => ({ cargo })
const MOST = load({ water: 2000, oxygen: 800, food: 600, parts: 1000, shielding: 1500, rack: 500 })

test('the six station cargo items come in amounts, each with a mass, a price and an effect', () => {
  assert.deepEqual(CARGO.map(c => c.id), ['water', 'oxygen', 'food', 'parts', 'shielding', 'rack'])
  // the masses stay inside the team's table: water 500-2,000 kg, oxygen 200-800, food 300-600, spare parts 400-1,000, shielding 500-1,500, rack 200-500
  const range: Record<CargoId, [number, number]> = { water: [500, 2000], oxygen: [200, 800], food: [300, 600], parts: [400, 1000], shielding: [500, 1500], rack: [200, 500] }
  for (const c of CARGO) {
    assert.ok(c.steps.length >= 2, `${c.id} comes in more than one amount`)
    for (let i = 0; i < c.steps.length; i++) {
      const st = c.steps[i]
      assert.ok(st.kg >= range[c.id][0] && st.kg <= range[c.id][1], `${c.id} ${st.kg} kg is inside its range`)
      if (i) {
        const prev = c.steps[i - 1]
        assert.ok(st.kg > prev.kg && st.cost > prev.cost && st.value > prev.value, `${c.id}: more mass costs more and does more`)
      }
      assert.ok(c.effect(st.value).length > 20)
    }
  }
})

test('a loadout keeps only known items at amounts they come in', () => {
  assert.deepEqual(cleanLoadout({ cargo: { water: 1000, food: 333, rack: 500, fuel: 100, oxygen: '400' } }), load({ water: 1000, rack: 500 }))
  // saves from older builds (instruments and supplies) and junk leave an empty hold
  for (const junk of [null, undefined, 3, 'ir', [], { instruments: ['ir'], extras: ['water'] }, { cargo: 'water' }]) assert.deepEqual(cleanLoadout(junk), STARTER)
  assert.deepEqual(aboard(load({ rack: 200, water: 500 })).map(x => x.item.id), ['water', 'rack'], 'catalogue order')
})

test('cost and weight add up, and one budget pays for the launch, the cargo and the rover instrument', () => {
  assert.equal(cargoKg(STARTER), 0)
  assert.equal(cargoKg(MOST), 6400)
  for (const s of SHIPS) {
    const l = load({ water: 1000, shielding: 500 })
    assert.deepEqual(designCost(s, l), { launch: s.launchCost, cargo: 11, spent: s.launchCost + 11, left: MISSION_BUDGET - s.launchCost - 11 })
    assert.equal(designCost(s, STARTER).left, s.budget)
    assert.equal(designBlock(s, STARTER), null, `${s.id}: an empty hold may launch`)
  }
  assert.equal(INSTRUMENT_MIN, Math.min(...INSTRUMENTS.map(i => i.cost)))
})

test('the budget stops a launch only when it leaves too little for a rover instrument', () => {
  const s = ship('shuttle') // 91 cr after the launch
  const fine = load({ water: 2000, shielding: 1500, oxygen: 400 }) // 33 cr: leaves 58
  assert.equal(designBlock(s, fine), null)
  assert.match(instrumentLine(s, fine), /enough for the ir spectrometer aboard, not the ground radar/i)
  const tight = load({ water: 2000, shielding: 1500, parts: 1000 }) // 43 cr: leaves 48
  assert.equal(designBlock(s, tight), null)
  const greedy = load({ water: 2000, shielding: 1500, parts: 1000, rack: 500 }) // 61 cr: leaves 30
  assert.match(designBlock(s, greedy)!, /Leave at least 42 cr for the rover instrument/)
  assert.match(designBlock(s, MOST)!, /Leave at least 42 cr/, 'everything at once leaves only 8 cr')
  assert.match(instrumentLine(ship('falcon9'), STARTER), /enough for either rover instrument/)
})

test('weight is the pilot\'s risk: an overloaded design may launch, and the forecast says what will happen', () => {
  const heavy = load({ water: 2000, shielding: 1500 }) // 3,500 kg, 27 cr
  for (const id of ['falcon9', 'atlasv'] as const) assert.equal(designBlock(ship(id), heavy), null, `${id}: nothing blocks it`)
  assert.equal(designForecast(ship('atlasv'), heavy).verdict, 'short')
  assert.match(liftLine(ship('atlasv'), heavy), /Too heavy by about [\d,]+ kg/)
  assert.equal(flyAscent('atlasv', cargoKg(heavy)).outcome, 'out-of-propellant', 'and the flight agrees with the forecast')
  assert.equal(designForecast(ship('falcon9'), heavy).outcome, 'orbit', 'Falcon 9 lifts what the Atlas V cannot')
  assert.equal(designForecast(ship('shuttle'), heavy).verdict, 'comfortable', 'and the Shuttle lifts it easily')
})

test('no launch system is best at everything', () => {
  const by = <K extends 'launchCost' | 'payloadKg' | 'battery' | 'handoffMin'>(k: K) => [...SHIPS].sort((a, b) => a[k] - b[k]).map(s => s.id)
  assert.equal(by('launchCost')[0], 'falcon9', 'Falcon 9 is the cheapest')
  assert.equal(by('launchCost').at(-1), 'shuttle', 'the Shuttle the dearest')
  assert.equal(by('payloadKg').at(-1), 'shuttle', 'the Shuttle carries the most')
  assert.equal(by('payloadKg')[0], 'atlasv', 'the Atlas V the least')
  assert.equal(by('battery')[0], 'falcon9', 'Falcon 9 starts the rover with the least charge')
  assert.equal(by('handoffMin')[0], 'shuttle', 'the Shuttle has the shortest relay hand-off')
  for (const s of SHIPS) assert.ok(s.pros.length >= 2 && s.cons.length >= 2, `${s.id} shows both sides`)
  assert.ok(liftLimitKg('shuttle') > cargoKg(MOST), 'the Shuttle could lift everything at once')
  assert.ok(designBlock(ship('shuttle'), MOST), 'but cannot afford it')
  // the same affordable wish list comes out differently on each
  const wish = load({ water: 1500, oxygen: 800, food: 600, shielding: 1000 }) // 3,900 kg, 41 cr
  for (const s of SHIPS) assert.equal(designBlock(s, wish), null, `${s.id} can afford it`)
  assert.equal(designForecast(ship('shuttle'), wish).outcome, 'orbit')
  assert.notEqual(designForecast(ship('falcon9'), wish).verdict, 'short')
  assert.equal(designForecast(ship('atlasv'), wish).verdict, 'short')
})

// ---- what the cargo does aboard -------------------------------------------------------
const READY: Power = { life: 3, comms: 4, research: 2 }
function aboardMission(cargo: Partial<Record<CargoId, number>>, opts: { ship?: ShipId; power?: Power; instrument?: 'ir' | 'gpr' } = {}) {
  const m = new Mission({ callSign: 'Test', suit: 'ember', ship: opts.ship ?? 'atlasv', loadout: load(cargo) })
  assert.equal(m.selectInstrument(opts.instrument ?? 'ir'), null)
  assert.equal(m.activatePayload(), null)
  if (m.relayFault) m.complete('relay', 'test')
  m.setPower(opts.power ?? READY)
  assert.equal(m.chooseRover('perseverance'), null)
  return m
}
/** The flattest real Perseverance stop 100 to 600 m out: a place where tests can run. */
const flat = () => [...ROVERS.perseverance.area.stops].filter(s => Math.hypot(s.x, s.y) >= 100 && Math.hypot(s.x, s.y) <= 600).sort((a, b) => a.tiltDeg - b.tiltDeg)[0]
function atFlatStop(m: Mission) {
  const s = flat()
  assert.equal(m.addWaypoint({ x: s.x, y: s.y }), null)
  assert.equal(m.deploy(), null)
  return m.spotHere!
}

test('the instrument is bought aboard from what the launch left', () => {
  const m = new Mission({ callSign: 'T', suit: 'ember', ship: 'shuttle', loadout: load({ water: 2000, shielding: 1500, oxygen: 400 }) })
  assert.equal(m.launchSpent, 33)
  assert.match(m.selectInstrument('gpr')!, /GPR-2 costs 68 cr; the launch and its cargo left 58 cr/)
  assert.equal(m.selectInstrument('ir'), null)
  assert.equal(m.credits, 91 - 33 - 42)
  // without a launch design (tests, old saves) main's rules still apply
  const plain = new Mission({ callSign: 'T', suit: 'ember', ship: 'shuttle' })
  assert.equal(plain.selectInstrument('gpr'), null)
  assert.equal(plain.credits, 91 - 68)
})

test('water storage tanks add to the base score, more water more points', () => {
  const none = aboardMission({}), some = aboardMission({ water: 1000 }), full = aboardMission({ water: 2000 })
  const scores = [none, some, full].map(m => { const spot = atFlatStop(m); assert.equal(m.runTest('photo'), null); return m.report(spot).score })
  assert.deepEqual([scores[1] - scores[0], scores[2] - scores[0]], [cargoStep('water', 1000)!.value, cargoStep('water', 2000)!.value])
  assert.equal(full.decideBase(full.spotHere!.id), null)
  assert.ok(full.causes().some(c => /Water storage tanks \(2,000 kg\): \+8 to the base score/.test(c.text)))
})

test('oxygen storage tanks let life support run on fewer power units', () => {
  const low: Power = { life: 2, comms: 5, research: 3 }
  const without = aboardMission({}, { power: low }), with400 = aboardMission({ oxygen: 400 }, { power: low }), with800 = aboardMission({ oxygen: 800 }, { power: { life: 1, comms: 5, research: 4 } })
  assert.deepEqual([without.lifeNeed, with400.lifeNeed, with800.lifeNeed], [3, 2, 1])
  for (const m of [without, with400, with800]) m.addWaypoint({ x: 100, y: 0 })
  assert.match(without.deployBlock()!, /Life support needs at least 3 units/)
  assert.equal(with400.deployBlock(), null, 'two units are enough with the tanks aboard, so comms 5 and research 3 both fit')
  assert.equal(with800.deployBlock(), null)
  assert.ok(with400.fastDrill, 'research 3 is now affordable alongside the direct link')
})

test('a food supply container gives the crew more Mars days in orbit', () => {
  const plain = aboardMission({}), more = aboardMission({ food: 600 })
  assert.equal(plain.missionSols, MISSION_SOLS)
  assert.equal(more.missionSols, MISSION_SOLS + 3)
  assert.ok(more.hoursLeft > plain.hoursLeft)
  // the same day count ends the mission later
  plain.hoursUsed = more.hoursUsed = MISSION_SOLS * 24.6597 + 1
  assert.ok(plain.timeUp && !more.timeUp)
})

test('a spare parts container fixes the relay fault, and the bigger one balances the rover battery', () => {
  const m = new Mission({ callSign: 'T', suit: 'ember', ship: 'atlasv', loadout: load({ parts: 400 }) })
  m.selectInstrument('ir'); m.activatePayload()
  assert.equal(m.relayFault, false, 'no repair needed')
  assert.ok(m.completed.has('relay'))
  assert.ok(m.log.some(e => /fixed with a spare/.test(e.text)))
  assert.equal(m.balanced, false)
  const big = aboardMission({ parts: 1000 })
  assert.equal(big.balanced, true, 'driving draws 30 W less, as after the balancing task')
})

test('radiation shielding panels raise the base site\'s radiation score', () => {
  const plain = aboardMission({}), shielded = aboardMission({ shielding: 1500 })
  const rad = (m: Mission) => { const spot = atFlatStop(m); assert.equal(m.runTest('radiation'), null); return m.report(spot).bars.find(b => b.id === 'rad')! }
  const a = rad(plain), b = rad(shielded)
  assert.equal(b.score, Math.min(100, a.score! + 30))
  assert.match(b.value, /\+30 from the shielding panels/)
  assert.match(b.model, /our model/)
})

test('a scientific experiment rack makes drilling cheaper, and the full rack studies samples without calibration', () => {
  const plain = aboardMission({}), small = aboardMission({ rack: 200 }), full = aboardMission({ rack: 500 })
  assert.equal(plain.testCost('drill'), testWh('drill', 'ir', false))
  assert.equal(small.testCost('drill'), testWh('drill', 'ir', true), 'the research filter, without 3 research units')
  assert.equal(small.samplesStudied, false)
  assert.equal(full.samplesStudied, true, 'studied even though nobody calibrated the instrument')
  const spot = atFlatStop(full)
  assert.equal(full.runTest('drill'), null)
  assert.equal(full.report(spot).bars.find(b => b.id === 'sample')!.score, 100)
})

test('cargo values are zero when an item was not loaded', () => {
  for (const c of CARGO) assert.equal(cargoValue(STARTER, c.id), 0)
  assert.equal(cargoValue(undefined, 'water'), 0)
  const m = aboardMission({})
  assert.deepEqual([m.lifeNeed, m.missionSols, m.balanced, m.fastDrill, m.samplesStudied], [3, MISSION_SOLS, false, false, false])
})

// ---- the launch explained --------------------------------------------------------------
test('a failed launch is explained by the choice or the handling that caused it', () => {
  const s = ship('atlasv')
  const heavy = load({ water: 2000, shielding: 1500 })
  const short = failureCauses(s, heavy, flyAscent('atlasv', cargoKg(heavy)))
  assert.match(short.parts.join(' '), /Weight decided it: 3,500 kg of cargo is [\d,]+ kg more than a perfect ascent can lift/)
  const light = load({ rack: 200 })
  const drift = failureCauses(s, light, flyAscent('atlasv', cargoKg(light), () => ({ turn: 0, throttle: 1 })))
  assert.ok(!/Weight decided it/.test(drift.parts.join(' ')))
  assert.match(drift.parts[0], /Height is not orbit/)
  const torn = flyAscent('shuttle', 840, a => ({ turn: a.t > 9 && a.t < 12 ? 1 : 0, throttle: 1 }))
  assert.equal(torn.outcome, 'breakup')
  const blast = failureCauses(ship('shuttle'), load({ food: 600 }), torn)
  assert.equal(blast.headline, 'Broke up under air load')
  assert.match(blast.parts[0], /sideways air load reached \d+% of what the Space Shuttle stack takes/)
  assert.match(failureCauses(s, load(), flyAscent('atlasv', 72000)).headline, /never left the pad/)
})

test('the report says how the launch went and what it took', () => {
  const s = ship('atlasv')
  const rec: LaunchRecord = { attempts: 1, failures: [], cargoKg: 1500, marginPct: 7.2, forecastPct: 9.4, seconds: 81, assisted: false }
  const first = launchCauses(s, rec)
  assert.equal(first.ok, true)
  assert.match(first.headline, /Reached orbit on the first launch, 81 s/)
  assert.match(first.parts.join(' '), /1,500 kg of cargo: it carries 2,100 kg/)
  assert.match(first.parts.join(' '), /Flown by hand: 7% of the upper stage's propellant left at orbit, against 9% for the guidance line/)
  const third = launchCauses(s, { ...rec, attempts: 3, failures: ['breakup', 'out-of-propellant'], assisted: true })
  assert.equal(third.ok, false)
  assert.match(third.headline, /Reached orbit on launch 3/)
  assert.match(third.parts.join(' '), /Earlier attempts: it broke up under air load; it ran out of propellant short of orbit\./)
})
