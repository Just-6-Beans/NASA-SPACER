import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Mission, WATER_BONUS, cleanCallSign } from '../src/core/mission'
import type { Power } from '../src/core/power'
import { ROVERS, mmrtgNowW } from '../src/core/rovers'
import {
  DRIVE_FILMS, DRIVE_PHOTO_WH, MAX_BASE_TILT, MAX_WAYPOINTS, MISSION_SOLS, PHOTO_BONUS_EACH, PHOTO_BONUS_MAX, PHOTO_RANGE_M, REGIONS, SOL_HOURS, STOP_RANGE_M, VIDEOS, costPct, spendPct, climbWhPerM,
  driveWhPerM, fullRechargeSols, groundAt, heightAt, legCost, photoBonus, photoPlaces, rangeM, reserveWh, roverTraits, simulateDrive, slopeAt, testWh,
  type RegionId,
} from '../src/core/survey'
import * as T from '../src/core/tasks'
import { validPose } from '../src/core/protocol'

const READY: Power = { life: 3, comms: 4, research: 2 }

function ready(region: RegionId, opts: { power?: Power; water?: boolean; balanced?: boolean; calibrated?: boolean; ship?: 'odyssey' | 'atlas' } = {}) {
  const m = new Mission({ callSign: 'Test', suit: 'ember', ship: opts.ship ?? 'odyssey' })
  assert.equal(m.selectInstrument('ir'), null)
  assert.equal(m.activatePayload(), null)
  assert.ok(m.relayFault)
  assert.match(m.roverAccess()!, /Relay/)
  m.complete('relay', 'test')
  if (opts.calibrated) m.complete('calibration', 'test')
  if (opts.water) m.complete('water', 'test')
  if (opts.balanced) m.complete('battery', 'test')
  m.setPower(opts.power ?? READY)
  assert.equal(m.chooseRover(region === 'jezero' ? 'perseverance' : 'curiosity'), null)
  return m
}

/** Real stops between `min` and `max` metres from the start: the flattest and the steepest. */
const near = (id: 'perseverance' | 'curiosity', min: number, max: number) => ROVERS[id].area.stops.filter(s => Math.hypot(s.x, s.y) >= min && Math.hypot(s.x, s.y) <= max)
const flatStop = (id: 'perseverance' | 'curiosity', min = 100, max = 600) => [...near(id, min, max)].sort((a, b) => a.tiltDeg - b.tiltDeg)[0]
const steepStop = (id: 'perseverance' | 'curiosity') => [...near(id, 100, 600)].sort((a, b) => b.tiltDeg - a.tiltDeg)[0]

test('real data snapshots are present and labelled', () => {
  for (const rv of Object.values(ROVERS)) {
    assert.equal(rv.area.sizeM, 3000)
    assert.ok(rv.area.stops.length > 50, `${rv.name}: real stops on the map`)
    assert.ok(rv.area.provider.includes('NASA'))
    assert.ok(rv.area.photos.length >= 16)
    for (const p of rv.area.photos) assert.ok(existsSync(join('public', p.file)), `photo saved: ${p.file}`)
    assert.ok(rv.parts.length >= 15, `${rv.name} parts explained`)
    for (const p of rv.parts) assert.match(p.url, /^https:\/\/(science\.nasa\.gov|www\.jpl\.nasa\.gov|www\.nasa\.gov|mars\.nasa\.gov)\//)
    assert.ok(VIDEOS.some(v => v.rover === rv.id && existsSync(join('public', v.file))), `${rv.name}: NASA video saved`)
    assert.ok(DRIVE_FILMS.some(v => v.rover === rv.id && existsSync(join('public', v.file))), `${rv.name}: real drive film saved`)
    // The real picture from orbit behind the map: every tile of the 3 km square is saved.
    const sat = rv.satellite
    assert.ok(sat.provider.includes('NASA'))
    for (let row = 0; row < sat.rows; row++) for (let col = 0; col < sat.cols; col++) {
      if (!sat.missing.includes(`${col}_${row}`)) assert.ok(existsSync(join('public', sat.files.replace('{col}', String(col)).replace('{row}', String(row)))), `map tile saved: ${col}_${row}`)
    }
    assert.ok(sat.square.width > 2000 && Math.abs(sat.square.width - sat.square.height) < 2, 'the 3 km square is square in the picture')
    // A real selfie for the choice screen, and NASA's 3D picture with a dot for every part.
    for (const pic of [rv.selfie, rv.partsPicture]) assert.ok(existsSync(join('public', pic.file)), `picture saved: ${pic.file}`)
    assert.equal(rv.selfie.kind, 'Real photo')
    assert.match(rv.partsPicture.kind, /artist/)
    for (const p of rv.parts) assert.ok(rv.anchors[p.anchor], `${rv.name}: a dot for ${p.name}`)
    const [x0, y0, x1, y1] = rv.partsCrop
    for (const [x, y] of Object.values(rv.anchors)) assert.ok(x > x0 && x < x1 && y > y0 && y < y1, 'every dot is inside the part of the picture that is shown')
  }
  assert.deepEqual(REGIONS.map(r => r.rover), ['perseverance', 'curiosity'])
})

test('real power figures: battery, 40 % floor, MMRTG decay, climbing', () => {
  const p = ROVERS.perseverance, c = ROVERS.curiosity
  assert.equal(p.batteryWh, 2408)
  assert.equal(reserveWh(p), 963)
  assert.ok(mmrtgNowW(p) < 110 && mmrtgNowW(p) > 70, 'Perseverance MMRTG has decayed from 110 W')
  assert.ok(mmrtgNowW(c) < mmrtgNowW(p), 'older Curiosity MMRTG makes less power')
  assert.ok(driveWhPerM(c, false) > driveWhPerM(p, false), 'so Curiosity spends more battery per metre')
  assert.ok(driveWhPerM(p, true) < driveWhPerM(p, false), 'a balanced pack drives on less')
  assert.equal(Math.round(climbWhPerM(p) * 100), 106, '1,025 kg x 3.71 m/s2 = 1.06 Wh per metre climbed')
  // The battery gauge: 100 % is full, 0 % is the safe-mode line.
  assert.equal(spendPct(p, 2408), 100)
  assert.equal(spendPct(p, 963), 0)
  assert.equal(spendPct(p, 900), 0)
  assert.equal(costPct(p, 300), 21, 'a 300 Wh drill is 21 % of the spendable battery')
})

test('terrain: MOLA heights near the rover match its real elevation', () => {
  for (const rv of Object.values(ROVERS)) {
    const h = heightAt(rv, { x: 0, y: 0 })
    assert.ok(Math.abs(h - rv.area.centre.elevationM) < 60, `${rv.name}: MOLA ${Math.round(h)} m vs rover ${rv.area.centre.elevationM} m`)
    assert.ok(slopeAt(rv, { x: 0, y: 0 }) >= 0 && slopeAt(rv, { x: 0, y: 0 }) < 30)
  }
  const p = ROVERS.perseverance
  const s = flatStop('perseverance')
  const g = groundAt(p, { x: s.x + 20, y: s.y })
  assert.equal(g.source, 'rover', 'near a real stop: the tilt NASA measured')
  const far = groundAt(p, { x: -1400, y: 1400 })
  assert.equal(far.source, 'mola', `more than ${STOP_RANGE_M} m from any stop: MOLA from orbit`)
  assert.equal(far.tiltDeg, slopeAt(p, { x: -1400, y: 1400 }))
})

test('driving: cost is distance plus climb, and uphill costs more than downhill', () => {
  const p = ROVERS.perseverance
  const a = { x: 0, y: 0 }, east = { x: 1200, y: 0 } // the crater rim rises to the east
  const up = legCost(p, a, east, false), down = legCost(p, east, a, false)
  assert.equal(up.distM, 1200)
  assert.ok(up.climbM > down.climbM + 20, `east is uphill (${up.climbM} m vs ${down.climbM} m)`)
  assert.ok(up.wh > down.wh)
  assert.equal(Math.round(up.hours * 10) / 10, 7.9, '1,200 m at 152 m/h')
})

test('the player places points, deploys, and the rover stops at a new spot', () => {
  const m = ready('jezero')
  assert.equal(m.batteryWh, 2408, 'one full charge')
  assert.equal(m.spots.length, 1, 'the starting position is spot A')
  assert.match(m.deployBlock()!, /Tap the map/)
  const s = flatStop('perseverance')
  assert.equal(m.addWaypoint({ x: s.x / 2, y: s.y / 2 + 40 }), null, 'a route point')
  assert.equal(m.addWaypoint({ x: s.x, y: s.y }), null, 'the spot to check')
  assert.match(m.addWaypoint({ x: s.x + 2, y: s.y })!, /Too close/)
  assert.match(m.addWaypoint({ x: 5000, y: 0 })!, /off the map/)
  const f = m.forecast()!
  assert.equal(f.reached, 2)
  assert.equal(m.deploy(), null)
  assert.deepEqual(m.drives[0], f, 'forecast and deployment share one calculation')
  assert.deepEqual(m.pos, { x: Math.round(s.x), y: Math.round(s.y) })
  assert.equal(m.batteryWh, f.endWh)
  assert.equal(m.spotHere!.label, 'B')
  assert.equal(m.waypoints.length, 0)
  m.undoWaypoint()
  for (let i = 0; i < MAX_WAYPOINTS; i++) assert.equal(m.addWaypoint({ x: m.pos.x + 40 * (i + 1), y: m.pos.y }), null)
  assert.match(m.addWaypoint({ x: 0, y: 0 })!, /At most/)
  m.clearWaypoints()
  assert.equal(m.waypoints.length, 0)
  // A tap beside a spot already visited goes back to exactly that spot.
  assert.equal(m.addWaypoint({ x: 12, y: -9 }), null)
  assert.deepEqual(m.waypoints[0], { x: 0, y: 0 })
  assert.equal(m.deploy(), null)
  assert.equal(m.spotHere!.label, 'A')
  assert.equal(m.spots.length, 2, 'no duplicate spot')
})

test('tests fill in the bars: a flat real stop becomes a good place', () => {
  const m = ready('jezero', { calibrated: true })
  const s = flatStop('perseverance')
  m.addWaypoint({ x: s.x, y: s.y })
  m.deploy()
  let r = m.report(m.spotHere!)
  assert.equal(r.verdict.level, 'unknown', 'nothing measured yet')
  assert.equal(r.bars.filter(b => b.score !== null).length, 1, 'only roughness is known from orbit')
  const before = m.batteryWh
  for (const t of ['photo', 'weather', 'radiation', 'drill'] as const) assert.equal(m.runTest(t), null)
  assert.equal(before - m.batteryWh, 80 + 40 + 40 + 300)
  assert.match(m.runTest('photo')!, /Already done/)
  r = m.report(m.spotHere!)
  assert.equal(r.ground.source, 'rover')
  assert.equal(r.ground.tiltDeg, s.tiltDeg)
  assert.ok(r.bars.every(b => b.score !== null))
  assert.equal(r.verdict.level, 'good')
  assert.ok(r.score >= 60)
  // Region-wide readings carry over to the starting spot; its own photo and drill do not.
  const a = m.report(m.spots[0])
  assert.deepEqual(a.bars.filter(b => b.score === null).map(b => b.id), ['level', 'sample'])
})

test('a bad spot can still be built on: it scores low and the report says why', () => {
  const m = ready('jezero')
  const s = steepStop('perseverance')
  assert.ok(s.tiltDeg > MAX_BASE_TILT)
  m.addWaypoint({ x: s.x, y: s.y })
  m.deploy()
  m.runTest('photo')
  const r = m.report(m.spotHere!)
  assert.equal(r.verdict.level, 'bad')
  assert.match(r.verdict.title, /too steep/)
  assert.ok(m.canDrive, 'battery left: the player may explore another spot instead')
  assert.equal(m.decideBase(m.spotHere!.id), null, 'or build anyway')
  assert.ok(m.base!.approved)
  assert.equal(m.base!.stars, 1)
  assert.ok(m.causes().some(c => !c.good && /steeper than/.test(c.text)))
  assert.match(m.deployBlock()!, /already decided/)
  assert.equal(m.taskAvailable('habitat') !== null, true, 'still needs the medical check')
})

test('one charge: a drive that is too long ends in safe mode partway', () => {
  const m = ready('gale')
  const rv = ROVERS.curiosity
  for (const p of [{ x: -1400, y: 1400 }, { x: 1400, y: 1400 }, { x: 1400, y: -1400 }]) assert.equal(m.addWaypoint(p), null)
  const f = m.forecast()!
  assert.ok(f.safeMode && f.reached < 3)
  assert.equal(m.deploy(), null, 'risky plans can be sent')
  assert.ok(m.stranded)
  assert.equal(m.batteryWh, reserveWh(rv))
  assert.ok(m.spotHere!.stranded)
  assert.match(m.testBlock('photo')!, /Safe mode/)
  assert.match(m.addWaypoint({ x: 0, y: 0 })!, /safe mode/)
  assert.equal(m.canDrive, false)
  assert.match(m.deployBlock()!, /Recharge/)
  assert.equal(m.decideBase('defer'), null)
  assert.equal(m.base!.approved, false)
})

test('choosing a rover: one for the whole mission, with pros and cons from the real numbers', () => {
  const m = new Mission({ callSign: 'Test', suit: 'ember', ship: 'odyssey' })
  assert.equal(m.rover, null)
  assert.match(m.deployBlock() ?? '', /payload|rover/i)
  assert.equal(m.chooseRover('curiosity'), null)
  assert.match(m.chooseRover('perseverance')!, /whole mission/)
  assert.equal(m.rover!.id, 'curiosity', 'the first choice stays')
  const p = roverTraits(ROVERS.perseverance), c = roverTraits(ROVERS.curiosity)
  for (const t of [p, c]) assert.ok(t.pros.length >= 2 && t.cons.length >= 2, 'each rover has things it is good and bad at')
  assert.equal(p.pros.length, c.cons.length, 'what one rover is good at, the other is not')
  assert.equal(p.cons.length, c.pros.length)
  assert.ok(p.easier && !c.easier)
  assert.ok(rangeM(ROVERS.perseverance) > rangeM(ROVERS.curiosity))
  assert.ok(p.pros.some(t => t.title === 'Goes farther') && c.cons.some(t => t.title === 'Shorter range'))
  assert.ok(c.pros.some(t => t.title === 'Light') && p.cons.some(t => t.title === 'Heavy'))
  assert.ok(c.cons.some(t => /steep/.test(t.title)), 'Curiosity is parked on a slope too steep for a base')
  assert.ok(ROVERS.curiosity.area.centre.tiltDeg > MAX_BASE_TILT)
})

test('recharging: parking refills the battery, ends safe mode and uses up Mars days', () => {
  const m = ready('gale')
  const rv = ROVERS.curiosity
  assert.match(m.rechargeBlock()!, /already full/)
  for (const p of [{ x: -1400, y: 1400 }, { x: 1400, y: 1400 }]) m.addWaypoint(p)
  m.deploy()
  assert.ok(m.stranded, 'a drive that is too long ends in safe mode')
  const hours = m.hoursUsed
  const plan = m.rechargePlan()!
  assert.ok(plan.full)
  assert.ok(Math.abs(plan.sols - fullRechargeSols(rv)) < 0.01, 'from the safe-mode line it is a full recharge')
  assert.ok(plan.sols > 2 && plan.sols < 3, `Curiosity needs about 2.5 Mars days (${plan.sols.toFixed(2)})`)
  assert.equal(m.recharge(), null)
  assert.equal(m.batteryWh, rv.batteryWh)
  assert.equal(m.stranded, false, 'safe mode ends')
  assert.ok(m.canDrive)
  assert.equal(m.recharges, 1)
  assert.ok(Math.abs(m.hoursUsed - hours - plan.hours) < 1e-9)
  assert.equal(m.testBlock('photo'), null, 'and the rover can test again')
  const fast = fullRechargeSols(ROVERS.perseverance)
  assert.ok(fast > 1 && fast < 1.3, `Perseverance needs about 1.1 Mars days (${fast.toFixed(2)})`)
  assert.ok(fast < fullRechargeSols(rv) / 2, 'its newer power source recharges more than twice as fast')
})

test('the mission lasts 10 Mars days: driving and recharging use them up', () => {
  const m = ready('gale')
  const rv = ROVERS.curiosity
  assert.equal(m.sol, 1)
  assert.equal(m.solsLeft, MISSION_SOLS)
  m.addWaypoint({ x: 0, y: 720 })
  const f = m.forecast()!
  m.deploy()
  assert.equal(f.hours, 5, '720 m at 144 m/h')
  assert.equal(m.hoursUsed, 5, 'driving counts at the real rover speed')
  let n = 0
  while (!m.timeUp && n < 20) { m.batteryWh = reserveWh(rv); assert.equal(m.recharge(), null); n++ }
  assert.ok(m.timeUp)
  assert.equal(n, 4, 'Curiosity fits three full recharges and part of a fourth')
  assert.ok(m.batteryWh < rv.batteryWh, 'the last recharge was cut short by the end of the mission')
  assert.ok(Math.abs(m.hoursUsed - MISSION_SOLS * SOL_HOURS) < 1e-6)
  assert.equal(m.sol, MISSION_SOLS)
  assert.match(m.rechargeBlock()!, /Mars days are used up/)
  assert.match(m.addWaypoint({ x: 100, y: 100 })!, /Mars days are used up/)
  assert.match(m.testBlock('photo')!, /Mars days are used up/)
  assert.equal(m.canDrive, false)
  assert.equal(m.decideBase(m.spotHere!.id), null, 'the base can still be built on a spot already visited')
  assert.ok(m.causes().some(c => !c.good && /ran out/.test(c.text)))
  // A drive has to fit in the time that is left.
  const t = ready('jezero')
  t.hoursUsed = MISSION_SOLS * SOL_HOURS - 1
  t.addWaypoint({ x: 400, y: 0 })
  assert.match(t.deployBlock()!, /hours of the mission are left/)
})

test('photos on the way: real photo spots in reach join the album and add to the score', () => {
  const m = ready('jezero')
  const rv = ROVERS.perseverance
  const places = photoPlaces(rv)
  assert.equal(places.length, 16)
  assert.equal(places.reduce((a, p) => a + p.photos.length, 0), rv.area.photos.length)
  const far = places.find(p => Math.hypot(p.x, p.y) > 500)!
  assert.match(m.photoBlock(far.id)!, /Too far/)
  const here = places.find(p => Math.hypot(p.x, p.y) < PHOTO_RANGE_M)!
  const score = m.report(m.spots[0]).score, wh = m.batteryWh
  assert.equal(m.takePhoto(here.id), null, 'the rover starts beside a real photo spot')
  assert.equal(m.batteryWh, wh - DRIVE_PHOTO_WH)
  assert.equal(m.report(m.spots[0]).score, score + PHOTO_BONUS_EACH, 'a useful photo raises the score')
  assert.match(m.takePhoto(here.id)!, /Already/)
  // A spot the drive passes stays in reach after the rover has driven on.
  const next = [...places].filter(p => p.id !== here.id).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0]
  m.addWaypoint({ x: next.x, y: next.y })
  m.addWaypoint({ x: next.x + 200, y: next.y })
  m.deploy()
  assert.ok(Math.hypot(m.pos.x - next.x, m.pos.y - next.y) > PHOTO_RANGE_M)
  assert.equal(m.takePhoto(next.id), null)
  assert.deepEqual(m.photos, [here.id, next.id])
  assert.equal(m.photoBonus, 2 * PHOTO_BONUS_EACH)
  assert.equal(photoBonus(9), PHOTO_BONUS_MAX, 'the bonus stops at its maximum')
  assert.ok(m.causes().some(c => c.good && /photo place/.test(c.text)))
  // No battery to spare, no photo.
  const s = ready('gale')
  s.batteryWh = reserveWh(ROVERS.curiosity) + DRIVE_PHOTO_WH - 1
  assert.match(s.photoBlock(photoPlaces(ROVERS.curiosity)[0].id)!, /Needs/)
})

test('battery limits how many spots can be checked', () => {
  const m = ready('gale')
  m.runTest('photo'); m.runTest('weather'); m.runTest('radiation'); m.runTest('drill')
  const s = flatStop('curiosity', 300, 500)
  m.addWaypoint({ x: s.x, y: s.y })
  m.deploy()
  m.runTest('photo'); m.runTest('drill')
  assert.ok(m.spareWh < 400, `little left: ${m.spareWh} Wh`)
  const d = simulateDrive(ROVERS.curiosity, m.pos, [{ x: 1400, y: -1400 }], m.batteryWh, false)
  assert.ok(d.safeMode, 'not enough for another long drive')
  const cost = testWh('drill', 'ir', false)
  if (m.spareWh < cost) assert.match(m.testBlock('drill') ?? 'Already done', /Already done|Needs/)
})

test('station choices change the rover: ship charge, balancing, research, water, comms', () => {
  assert.equal(ready('jezero', { ship: 'atlas' }).batteryWh, Math.round(2408 * 0.92), 'Atlas delivers the rover at 92 %')
  const a = ready('jezero'), b = ready('jezero', { balanced: true })
  for (const m of [a, b]) { m.addWaypoint({ x: 600, y: 0 }); m.deploy() }
  assert.ok(b.batteryWh > a.batteryWh, 'balanced pack drives on less energy')
  assert.equal(ready('jezero', { power: { life: 3, comms: 4, research: 3 } }).testCost('drill'), 210, 'research power makes drilling cheaper')
  const w = ready('jezero', { water: true }), n = ready('jezero')
  for (const m of [w, n]) m.runTest('photo')
  assert.equal(w.report(w.spots[0]).score, n.report(n.spots[0]).score + WATER_BONUS)
  const c = ready('jezero', { power: { life: 3, comms: 3, research: 2 } })
  c.addWaypoint({ x: 100, y: 0 })
  assert.match(c.deployBlock()!, /Communications/)
})

test('Curiosity at Gale works the same way and has level real stops nearby', () => {
  const m = ready('gale', { calibrated: true })
  assert.equal(m.rover!.id, 'curiosity')
  const s = flatStop('curiosity')
  assert.ok(s.tiltDeg <= MAX_BASE_TILT)
  m.addWaypoint({ x: s.x, y: s.y })
  m.deploy()
  for (const t of ['photo', 'weather', 'radiation', 'drill'] as const) assert.equal(m.runTest(t), null)
  const r = m.report(m.spotHere!)
  assert.notEqual(r.verdict.level, 'bad')
  assert.equal(m.decideBase(m.spotHere!.id), null)
  assert.ok(m.base!.stars >= 2)
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

test('task rewards apply once; habitat needs a base and medical', () => {
  const m = ready('jezero')
  assert.equal(m.complete('cargo', 'x'), true)
  assert.equal(m.complete('cargo', 'x'), false)
  assert.equal(m.credits, 63)
  assert.match(m.taskAvailable('habitat')!, /base site/)
  m.decideBase(0)
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
