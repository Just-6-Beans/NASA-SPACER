import test from 'node:test'
import assert from 'node:assert/strict'
import { Mission, cleanCallSign } from '../src/core/mission'
import type { Power } from '../src/core/power'
import { simulatePass, roverPosition, commandStatus, queueError } from '../src/core/rover'
import * as T from '../src/core/tasks'
import { validPose } from '../src/core/protocol'
import type { InstrumentId, RouteId, ScanId, ShipId } from '../src/core/data'

function run(opts: { ship?: ShipId; inst: InstrumentId; cal: boolean; power: Power; route: RouteId; scan: ScanId; balanced?: boolean; water?: boolean }) {
  const m = new Mission({ callSign: 'Test', suit: 'ember', ship: opts.ship ?? 'odyssey' })
  assert.equal(m.selectInstrument(opts.inst), null)
  assert.equal(m.activatePayload(), null)
  assert.ok(m.relayFault)
  assert.match(m.transmitBlock()!, /Relay/)
  m.complete('relay', 'test')
  if (opts.cal) m.complete('calibration', 'test')
  if (opts.balanced) m.complete('battery', 'test')
  if (opts.water) m.complete('water', 'test')
  m.setPower(opts.power)
  m.route = opts.route
  m.scan = opts.scan
  m.queue = ['drive', 'scan', 'return']
  assert.equal(m.transmit(), null)
  return m
}

test('Scenario 1: clear Ares Shelf', () => {
  const m = run({ inst: 'ir', cal: true, power: { life: 3, comms: 5, research: 2 }, route: 'ridge', scan: 'deep' })
  const p = m.pass!
  assert.equal(p.readingAt, 36)
  assert.deepEqual([p.reading!.estimate, p.reading!.uncertainty], [31, 7])
  assert.equal(p.finalBattery, 36)
  assert.equal(p.finalTelemetryAt, 52)
  assert.equal(m.receivedReading, null, 'evidence hidden before downlink')
  m.advanceTo(35.9)
  assert.equal(m.receivedReading, null)
  m.advanceTo(36)
  assert.equal(m.receivedReading!.uncertainty, 7)
  assert.match(m.landingBlock()!, /final telemetry/)
  m.advanceTo(999)
  assert.equal(m.clock, 52, 'clock stops at final telemetry')
  assert.equal(m.assess('shelf').status, 'clear')
  assert.equal(m.decideLanding('shelf'), null)
  assert.ok(m.landing!.approved)
  const b = run({ inst: 'ir', cal: true, power: { life: 3, comms: 5, research: 2 }, route: 'ridge', scan: 'deep', balanced: true })
  assert.equal(b.pass!.finalBattery, 42)
})

test('Scenario 2: miss the solar window', () => {
  const m = run({ inst: 'ir', cal: true, power: { life: 3, comms: 4, research: 3 }, route: 'ridge', scan: 'deep' })
  assert.ok(m.pass!.reading!.strong)
  assert.equal(m.pass!.finalTelemetryAt, 56)
  m.advanceTo(100)
  assert.equal(m.assess('shelf').status, 'closed')
  assert.notEqual(m.decideLanding('shelf'), null)
})

test('Scenario 3: reserve stop and Meridian fallback', () => {
  const m = run({ inst: 'gpr', cal: false, power: { life: 3, comms: 4, research: 2 }, route: 'basin', scan: 'quick' })
  const p = m.pass!
  assert.equal(p.commands[1].status, 'complete')
  assert.equal(p.commands[2].status, 'partial')
  assert.equal(p.finalBattery, 20)
  assert.ok(p.safeMode)
  assert.ok(!p.reading!.strong)
  assert.equal(m.credits, 32)
  m.advanceTo(200)
  const plain = m.assess('plain')
  assert.equal(plain.cost, 38)
  assert.equal(plain.canLand, false)
  const w = run({ inst: 'gpr', cal: false, power: { life: 3, comms: 4, research: 2 }, route: 'basin', scan: 'quick', water: true })
  w.advanceTo(200)
  assert.equal(w.assess('plain').cost, 30)
  assert.equal(w.assess('plain').canLand, true)
  assert.equal(w.decideLanding('plain'), null)
  assert.equal(w.funds, 2)
})

test('partial scan gives no reading; return can still hit reserve after a completed scan', () => {
  const r = simulatePass({ relayMin: 8, startBattery: 60, power: { life: 3, comms: 4, research: 2 }, instrument: 'gpr', calibrated: true, route: 'basin', scan: 'deep', balanced: false, queue: ['drive', 'scan', 'return'] })
  assert.equal(r.commands[1].status, 'partial')
  assert.equal(r.reading, null)
  assert.equal(r.commands[2].status, 'cancelled')
  const mid = roverPosition(r, r.commands[0].start + 5)
  assert.ok(mid.along > 0 && mid.along < 1)
  assert.equal(commandStatus(r, 2, 0), 'queued')
})

test('queue order and transmit rules', () => {
  assert.equal(queueError(['drive', 'scan', 'return']), null)
  assert.ok(queueError(['scan']))
  assert.ok(queueError(['drive', 'return']))
  const m = run({ inst: 'ir', cal: true, power: { life: 3, comms: 4, research: 3 }, route: 'ridge', scan: 'quick' })
  assert.match(m.transmit()!, /One rover pass/)
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
  const m = run({ inst: 'ir', cal: true, power: { life: 3, comms: 5, research: 2 }, route: 'ridge', scan: 'deep' })
  assert.equal(m.complete('cargo', 'x'), true)
  assert.equal(m.complete('cargo', 'x'), false)
  assert.equal(m.credits, 63)
  m.advanceTo(100)
  m.decideLanding('shelf')
  assert.match(m.taskAvailable('habitat')!, /medical/)
  m.complete('medical', 'x')
  assert.equal(m.taskAvailable('habitat'), null)
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
