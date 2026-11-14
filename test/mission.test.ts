import test from 'node:test'
import assert from 'node:assert/strict'
import { Mission, cleanCallSign } from '../src/core/mission'
import type { Power } from '../src/core/power'
import { simulatePass, roverPosition, commandStatus, heaterDraw, forecastWarnings } from '../src/core/rover'
import * as T from '../src/core/tasks'
import { validPose } from '../src/core/protocol'
import { DUST_DEADLINE, type InstrumentId, type RouteId, type ScanId, type ShipId } from '../src/core/data'
import { OPS_DATES } from '../src/data/opsDates'

// The three operations dates on offer (data/nasa/ops-dates.json).
const NEAR = '2029-03-30' // 5.4 light-minutes, -79 C night
const MID = '2029-07-15' // 10.4 light-minutes, -74 C night
const FAR = '2029-11-15' // 15.8 light-minutes, -66 C night
const DIRECT: Power = { life: 3, comms: 5, research: 2 } // direct link, no relay hand-off
const FILTER: Power = { life: 3, comms: 4, research: 3 } // research filter
const PLAIN: Power = { life: 3, comms: 4, research: 2 }

interface Opts { ship?: ShipId; inst: InstrumentId; cal: boolean; power: Power; date?: string; route: RouteId; scan: ScanId; balanced?: boolean; water?: boolean; medical?: boolean; relay?: 'repair' | 'patch' }

/** Plays a mission up to transmission. Every task asked for must fit in the crew-hours. */
function run(opts: Opts) {
  const m = new Mission({ callSign: 'Test', suit: 'ember', ship: opts.ship ?? 'odyssey' })
  assert.equal(m.selectInstrument(opts.inst), null)
  assert.equal(m.activatePayload(), null)
  assert.ok(m.relayFault)
  assert.match(m.transmitBlock()!, /Relay/)
  if (opts.relay === 'patch') assert.equal(m.patchRelay(), null)
  else assert.ok(m.complete('relay', 'test'))
  if (opts.cal) assert.ok(m.complete('calibration', 'test'))
  if (opts.balanced) assert.ok(m.complete('battery', 'test'))
  if (opts.water) assert.ok(m.complete('water', 'test'))
  if (opts.medical) assert.ok(m.complete('medical', 'test'))
  m.setPower(opts.power)
  assert.equal(m.setOpsDate(opts.date ?? NEAR), null)
  m.route = opts.route
  m.scan = opts.scan
  assert.equal(m.transmit(), null)
  return m
}

test('Scenario 1: clear Ares Shelf on the closest date', () => {
  const m = run({ inst: 'ir', cal: true, power: DIRECT, date: NEAR, route: 'ridge', scan: 'deep' })
  const p = m.pass!
  assert.equal(p.uplink, 5.4, 'a direct link leaves only the real light time')
  assert.equal(p.heaterDraw, 14, 'a -79 C night costs 14 points')
  assert.equal(p.wakeBattery, 86)
  assert.equal(p.readingAt, 34.8)
  assert.deepEqual([p.reading!.estimate, p.reading!.uncertainty], [31, 7])
  assert.equal(p.finalBattery, 22)
  assert.equal(p.finalTelemetryAt, 50.8)
  assert.equal(m.receivedReading, null, 'evidence hidden before downlink')
  m.advanceTo(34.7)
  assert.equal(m.receivedReading, null)
  m.advanceTo(34.8)
  assert.equal(m.receivedReading!.uncertainty, 7)
  assert.match(m.landingBlock()!, /final telemetry/)
  m.advanceTo(999)
  assert.equal(m.clock, 50.8, 'clock stops at final telemetry')
  assert.equal(m.assess('shelf').status, 'clear')
  assert.equal(m.decideLanding('shelf'), null)
  assert.ok(m.landing!.approved)
  const b = run({ inst: 'ir', cal: true, power: DIRECT, date: NEAR, route: 'ridge', scan: 'deep', balanced: true })
  assert.equal(b.pass!.finalBattery, 28)
})

test('Scenario 2: the relay hand-off misses the dust front', () => {
  const m = run({ inst: 'ir', cal: true, power: FILTER, date: NEAR, route: 'ridge', scan: 'deep' })
  assert.equal(m.pass!.uplink, 8.4, 'light time 5.4 plus the 3 minute hand-off')
  assert.ok(m.pass!.reading!.strong)
  assert.equal(m.pass!.finalTelemetryAt, 56.8)
  m.advanceTo(100)
  assert.equal(m.assess('shelf').status, 'closed')
  assert.notEqual(m.decideLanding('shelf'), null)
})

test('Scenario 3: reserve stop and Meridian fallback', () => {
  const m = run({ inst: 'gpr', cal: false, power: PLAIN, date: NEAR, route: 'basin', scan: 'quick' })
  const p = m.pass!
  assert.equal(p.commands[1].status, 'complete')
  assert.equal(p.commands[2].status, 'partial')
  assert.equal(p.finalBattery, 20)
  assert.equal(p.shortfall, 10)
  assert.ok(p.safeMode)
  assert.ok(!p.returned)
  assert.ok(!p.reading!.strong)
  assert.equal(m.credits, 32)
  m.advanceTo(200)
  assert.ok(m.clock < DUST_DEADLINE, 'the window is still open')
  const shelf = m.assess('shelf')
  assert.equal(shelf.status, 'held', 'a stranded rover holds the shelf landing')
  assert.equal(shelf.canLand, false)
  const plain = m.assess('plain')
  assert.equal(plain.cost, 38)
  assert.equal(plain.canLand, false)
  const w = run({ inst: 'gpr', cal: false, power: PLAIN, date: NEAR, route: 'basin', scan: 'quick', water: true })
  w.advanceTo(200)
  assert.equal(w.assess('plain').cost, 30)
  assert.equal(w.assess('plain').canLand, true)
  assert.equal(w.decideLanding('plain'), null)
  assert.equal(w.funds, 2)
})

test('Scenario 4: the same plan succeeds or fails with the operations date', () => {
  // Radar, fast route: needs a warm battery, and makes up for the long light time.
  const radar = (date: string) => run({ inst: 'gpr', cal: true, power: DIRECT, date, route: 'basin', scan: 'quick' })
  const far = radar(FAR)
  assert.equal(far.pass!.uplink, 15.8)
  assert.equal(far.pass!.heaterDraw, 1)
  assert.equal(far.pass!.finalBattery, 23)
  assert.equal(far.pass!.finalTelemetryAt, 55.6)
  far.advanceTo(100)
  assert.equal(far.assess('shelf').status, 'clear')
  for (const date of [NEAR, MID]) {
    const cold = radar(date)
    assert.ok(cold.pass!.safeMode, `${date}: the cold battery cannot finish the pass`)
    cold.advanceTo(100)
    assert.equal(cold.assess('shelf').status, 'held')
  }
  // The spectrometer plan that clears the shelf on the closest date is far too slow from far away.
  const slow = run({ inst: 'ir', cal: true, power: DIRECT, date: FAR, route: 'ridge', scan: 'deep' })
  assert.equal(slow.pass!.finalTelemetryAt, 71.6)
  assert.equal(slow.pass!.finalBattery, 35)
  slow.advanceTo(100)
  assert.equal(slow.assess('shelf').status, 'closed')
})

test('no operations date and no design wins everywhere', () => {
  const designs: [ShipId, InstrumentId][] = [['odyssey', 'ir'], ['odyssey', 'gpr'], ['atlas', 'ir'], ['atlas', 'gpr'], ['vector', 'ir']]
  const dates = OPS_DATES.map(d => d.id)
  /** True if any plan and any station preparation clears Ares Shelf for this design on this date. */
  const canClear = (ship: ShipId, inst: InstrumentId, date: string) => {
    for (const cal of [true, false]) for (const balanced of [true, false]) for (const power of [DIRECT, FILTER, PLAIN])
      for (const route of ['ridge', 'basin'] as RouteId[]) for (const scan of ['quick', 'deep'] as ScanId[]) {
        const m = run({ ship, inst, cal, balanced, power, date, route, scan })
        m.advanceTo(999)
        if (m.assess('shelf').status === 'clear') return true
      }
    return false
  }
  const table = new Map(designs.map(([ship, inst]) => [`${ship}-${inst}`, dates.filter(d => canClear(ship, inst, d))]))
  for (const [design, good] of table) assert.ok(good.length >= 1, `${design} can clear the shelf on some date`)
  for (const date of dates) {
    const winners = [...table].filter(([, good]) => good.includes(date)).map(([design]) => design)
    assert.ok(winners.length >= 1, `${date} works for at least one design`)
    assert.ok(winners.length < designs.length, `${date} does not work for every design`)
  }
  // The frugal spectrometer needs time for its deep scan: it never clears from far away.
  for (const design of ['odyssey-ir', 'atlas-ir', 'vector-ir']) assert.ok(!table.get(design)!.includes(FAR), design)
  // The power-hungry radar on the weakest battery only works when the nights are warm.
  assert.deepEqual(table.get('atlas-gpr'), [FAR])
  assert.deepEqual(table.get('odyssey-gpr'), [NEAR, MID, FAR])
})

test('heater draw is one point per degree below -65 C', () => {
  assert.equal(heaterDraw(-65), 0)
  assert.equal(heaterDraw(-40), 0)
  assert.equal(heaterDraw(-66), 1)
  assert.equal(heaterDraw(-79), 14)
})

test('partial scan gives no reading; return can still hit reserve after a completed scan', () => {
  const s = { date: NEAR, lightMin: 8, nightLowC: -65, handoffMin: 0, startBattery: 60, power: PLAIN, instrument: 'gpr' as const, calibrated: true, route: 'basin' as const, scan: 'deep' as const, balanced: false }
  const r = simulatePass(s)
  assert.equal(r.heaterDraw, 0)
  assert.equal(r.commands[1].status, 'partial')
  assert.equal(r.reading, null)
  assert.equal(r.commands[2].status, 'cancelled')
  assert.ok(forecastWarnings(s, r).some(w => /No ice reading/.test(w.text)))
  const mid = roverPosition(r, r.commands[0].start + 5)
  assert.ok(mid.along > 0 && mid.along < 1)
  assert.equal(commandStatus(r, 2, 0), 'queued')
})

test('transmit rules: a date is required, the plan locks, one pass per run', () => {
  const m = new Mission({ callSign: 'Test', suit: 'ember', ship: 'odyssey' })
  m.selectInstrument('ir')
  m.activatePayload()
  m.complete('relay', 'test')
  m.setPower(PLAIN)
  assert.equal(m.forecast(), null, 'no forecast without an operations date')
  assert.match(m.transmitBlock()!, /operations date/)
  assert.ok(m.setOpsDate('2031-01-01'), 'only the dates in the snapshot are on offer')
  assert.equal(m.setOpsDate(MID), null)
  assert.equal(m.forecast()!.uplink, 13.4)
  assert.equal(m.transmit(), null)
  assert.deepEqual(m.pass, simulatePass(m.plan!), 'forecast and execution are one calculation')
  assert.match(m.transmit()!, /One rover pass/)
  assert.ok(m.setOpsDate(NEAR), 'the date cannot change after transmission')
  assert.equal(m.plan!.date, MID)
})

test('the debrief names the choices behind the outcome', () => {
  const late = run({ inst: 'ir', cal: true, power: FILTER, date: NEAR, route: 'ridge', scan: 'deep' })
  const [clock, battery, evidence] = late.causes
  assert.deepEqual([clock.ok, battery.ok, evidence.ok], [false, true, true])
  assert.match(clock.headline, /0\.8 min after the dust front/)
  assert.ok(clock.parts.some(p => /light time 5\.4 min \+ relay hand-off 3 min/.test(p)))
  assert.ok(battery.parts.some(p => /Night heaters: 14% for a −79 °C night/.test(p)))
  const stranded = run({ inst: 'gpr', cal: false, power: PLAIN, date: NEAR, route: 'basin', scan: 'quick' })
  assert.match(stranded.causes[1].headline, /needed 10% more battery/)
  assert.equal(stranded.causes[2].ok, false)
  assert.deepEqual(new Mission({ callSign: 'x', suit: 'ember', ship: 'odyssey' }).causes, [])
})

test('payload rules: Vector cannot carry radar, payload locks', () => {
  const m = new Mission({ callSign: '  ', suit: 'sage', ship: 'vector' })
  assert.equal(m.profile.callSign, 'Pilot')
  assert.ok(m.selectInstrument('gpr'))
  assert.equal(m.selectInstrument('ir'), null)
  m.activatePayload()
  assert.ok(m.selectInstrument('ir'))
  assert.equal(cleanCallSign('  A very very long callsign here '), 'A very very long cal')
})

test('tasks validate', () => {
  let cells = T.BATTERY_START
  for (const [a, b] of [[0, 3], [0, 3], [1, 2]]) cells = T.transferCell(cells, a, b).cells
  assert.ok(T.batteryBalanced(cells))
  assert.equal(T.batteryTotal(cells), 12)
  assert.ok(T.cargoCheck(['pump', 'mast']).ok)
  assert.ok(!T.cargoCheck(['battery', 'seal', 'pump']).ok)
  assert.ok(T.waterCheck(['screen', 'carbon', 'uv']).ok)
  assert.ok(!T.waterCheck(['uv', 'carbon', 'screen']).ok)
  assert.ok(T.medicalCheck(['baseline', 'exertion', 'recovery']).ok)
  assert.ok(T.calibrationCheck([20, 60], [27, 77], 125, 2).ok)
  assert.ok(T.calibrationCheck([16, 56], [22, 82], 150, -2).ok)
  assert.ok(!T.calibrationCheck([20, 60], [27, 77], 100, 0).ok)
  let r = T.RELAY_START
  r = T.rotateRelay(T.rotateRelay(r, 0), 0)
  r = T.rotateRelay(T.rotateRelay(r, 1), 1)
  r = T.rotateRelay(T.rotateRelay(r, 2), 2)
  assert.ok(T.relayCheck(r).ok)
  assert.ok(T.habitatCheck(['anchor', 'seal', 'energize']).ok)
})

test('task rewards apply once; habitat needs medical', () => {
  // A patched relay is free, which leaves an hour each for calibration, cargo and the medical check.
  const m = run({ inst: 'ir', cal: true, power: DIRECT, date: NEAR, route: 'ridge', scan: 'deep', relay: 'patch' })
  assert.equal(m.complete('cargo', 'x'), true)
  assert.equal(m.complete('cargo', 'x'), false)
  assert.equal(m.credits, 63)
  m.advanceTo(100)
  m.decideLanding('shelf')
  assert.match(m.taskAvailable('habitat')!, /medical/)
  assert.ok(m.complete('medical', 'x'))
  assert.equal(m.taskAvailable('habitat'), null)
  assert.ok(m.complete('habitat', 'x'), 'commissioning the habitat takes no crew-hour')
})

test('preparation is limited: three crew-hours, one per task', () => {
  const m = new Mission({ callSign: 'Test', suit: 'ember', ship: 'odyssey' })
  assert.equal(m.prepLeft, 3)
  m.selectInstrument('ir')
  m.activatePayload()
  assert.ok(m.complete('relay', 'x'), 'a full relay repair takes an hour')
  assert.ok(m.complete('calibration', 'x'))
  assert.equal(m.prepLeft, 1)
  assert.equal(m.taskAvailable('water'), null)
  assert.ok(m.complete('battery', 'x'))
  assert.equal(m.prepLeft, 0)
  // Nothing is left for the medical check, so this crew can land but cannot commission the habitat.
  assert.match(m.taskAvailable('medical')!, /No crew-hours left/)
  assert.equal(m.complete('medical', 'x'), false)
  assert.ok(!m.completed.has('medical'))
  assert.equal(m.taskAvailable('battery'), null, 'a finished task is never blocked')
  // The whole mission fits in the three hours: calibrate, clear the crew, and one hour to spare.
  const full = run({ inst: 'ir', cal: true, medical: true, power: DIRECT, date: NEAR, route: 'ridge', scan: 'deep', relay: 'patch' })
  assert.equal(full.prepLeft, 1)
  full.advanceTo(100)
  assert.equal(full.decideLanding('shelf'), null)
  assert.equal(full.taskAvailable('habitat'), null)
})

test('relay fault: a quick patch is free but slows the relay; a direct link does not care', () => {
  const patched = run({ inst: 'ir', cal: true, power: FILTER, date: NEAR, route: 'ridge', scan: 'deep', relay: 'patch' })
  assert.equal(patched.prepLeft, 2, 'the patch took no crew-hour')
  assert.ok(patched.relayPatched)
  assert.equal(patched.pass!.uplink, 10.4, 'light time 5.4, hand-off 3, patch 2')
  assert.ok(patched.causes[0].parts.some(p => /relay hand-off 5 min \(patched relay\)/.test(p)))
  const repaired = run({ inst: 'ir', cal: true, power: FILTER, date: NEAR, route: 'ridge', scan: 'deep' })
  assert.equal(repaired.prepLeft, 1)
  assert.equal(repaired.pass!.uplink, 8.4)
  const direct = run({ inst: 'ir', cal: true, power: DIRECT, date: NEAR, route: 'ridge', scan: 'deep', relay: 'patch' })
  assert.equal(direct.pass!.uplink, 5.4, 'a direct link skips the relay, patched or not')
  assert.equal(direct.pass!.finalTelemetryAt, 50.8)
  // A patch can be upgraded to the full repair before transmission, for a crew-hour.
  const m = new Mission({ callSign: 'Test', suit: 'ember', ship: 'odyssey' })
  assert.match(m.patchRelay()!, /nominal/)
  m.selectInstrument('ir')
  m.activatePayload()
  assert.equal(m.patchRelay(), null)
  assert.equal(m.roverAccess(), null)
  assert.equal(m.handoffMin, 5)
  assert.equal(m.taskAvailable('relay'), null)
  assert.ok(m.complete('relay', 'x'))
  assert.ok(!m.relayPatched)
  assert.equal(m.handoffMin, 3)
  assert.equal(m.prepLeft, 2)
})

test('Eos Hollow: no deadline, but it needs rover battery to spare and a power kit', () => {
  // Late, strong evidence, 15% to spare: the shelf is closed and the hollow costs only the kit.
  const late = run({ inst: 'ir', cal: true, power: DIRECT, date: FAR, route: 'ridge', scan: 'deep' })
  late.advanceTo(100)
  assert.equal(late.assess('shelf').status, 'closed')
  const hollow = late.assess('hollow')
  assert.deepEqual([hollow.canLand, hollow.cost], [true, 12])
  assert.equal(late.assess('plain').cost, 38, 'Meridian costs more than three times as much')
  assert.equal(late.decideLanding('hollow'), null)
  assert.equal(late.funds, 100 - 42 - 12)
  assert.ok(!late.landing!.importedWater)
  // Scenario 1 comes home with 2% to spare: not enough for the slope survey.
  const tight = run({ inst: 'ir', cal: true, power: DIRECT, date: NEAR, route: 'ridge', scan: 'deep' })
  tight.advanceTo(100)
  assert.equal(tight.assess('hollow').status, 'held')
  assert.match(tight.assess('hollow').reason, /only 2% to spare/)
  // Weak evidence: the hollow needs imported water too, so it costs what Meridian costs.
  const weak = run({ inst: 'ir', cal: false, power: DIRECT, date: FAR, route: 'ridge', scan: 'quick' })
  weak.advanceTo(100)
  assert.ok(!weak.pass!.reading!.strong)
  assert.equal(weak.assess('hollow').cost, 38)
  // A stranded rover cannot survey anything.
  const stranded = run({ inst: 'gpr', cal: false, power: PLAIN, date: NEAR, route: 'basin', scan: 'quick' })
  stranded.advanceTo(200)
  assert.equal(stranded.assess('hollow').status, 'held')
  assert.equal(stranded.assess('hollow').canLand, false)
})

test('pose validation', () => {
  const ok = { x: 500, y: 400, facing: 'down', left: false, moving: true, jog: false, name: 'Ada', suit: 'aurora' }
  assert.ok(validPose(ok))
  assert.ok(!validPose({ ...ok, x: Infinity }))
  assert.ok(!validPose({ ...ok, x: 5000 }))
  assert.ok(!validPose({ ...ok, suit: 'gold' }))
  assert.ok(!validPose({ ...ok, facing: 'diag' }))
  assert.ok(!validPose({ ...ok, name: 'x'.repeat(21) }))
  assert.ok(!validPose({ ...ok, moving: 'yes' }))
})
