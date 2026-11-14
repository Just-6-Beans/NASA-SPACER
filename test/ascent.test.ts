// The climb to orbit: the model the launch field flies. A launch has to be able to fail for the
// two reasons the design screen warns about (too much weight, bad steering), it has to be flyable
// by a person on a keyboard, and the forecast has to be the same calculation as the flight.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  APO_MIN, DT, MARGIN, ORBIT_SPEED, PERI_MIN, PLANET, REAL, TURN_RATE, VEHICLES, altitude, flyAscent, guidance, guidanceControls, liftForecast,
  liftLimitKg, orbitOf, pitch, resultOf, showAltKm, showSpeedKms, startAscent, stepAscent, thrustToWeight, type Ascent, type Controls,
} from '../src/core/ascent'
import { SHIPS, type ShipId } from '../src/core/data'

const rad = (deg: number) => (deg * Math.PI) / 180
const off = (s: Ascent) => { const e = guidance(s) - pitch(s); return Math.atan2(Math.sin(e), Math.cos(e)) }
/** A person on a keyboard: full rate or nothing, a look at the needle every `every` seconds, no reaction under `dead` degrees. */
function keyboard(every: number, dead: number) {
  let held = 0, next = 0
  return (s: Ascent): Controls => {
    if (s.t >= next) { next = s.t + every; const e = off(s); held = Math.abs(e) < rad(dead) ? 0 : Math.sign(e) }
    return { turn: held, throttle: 1 }
  }
}
/** Follows the guidance, but above `alt` metres holds the stick hard over for `secs` seconds. */
function yank(alt: number, secs: number) {
  let until = -1
  return (s: Ascent): Controls => {
    if (until < 0 && altitude(s) >= alt) until = s.t + secs
    return until >= 0 && s.t < until ? { turn: 1, throttle: 1 } : guidanceControls(s)
  }
}

test('read-outs show the model\'s small world at real scale', () => {
  assert.ok(Math.abs(showAltKm(PLANET.targetAlt) - REAL.altKm) < 1e-9, 'the station altitude reads as 408 km')
  assert.ok(Math.abs(showSpeedKms(ORBIT_SPEED) - REAL.speedKms) < 1e-9, 'orbital speed reads as 7.66 km/s')
  assert.ok(Math.abs(showAltKm(30) * 1000 - 30) < 2, 'near the pad a metre is a metre')
  assert.ok(showAltKm(3000) < showAltKm(6000) && showAltKm(6000) < showAltKm(9000), 'and it never runs backwards')
  assert.ok(Math.abs(ORBIT_SPEED - Math.sqrt((PLANET.g0 * PLANET.radius ** 2) / (PLANET.radius + PLANET.targetAlt))) < 1e-9)
})

test('every launch system reaches orbit on the guidance line with the cargo it is rated for', () => {
  for (const ship of SHIPS) {
    const r = flyAscent(ship.id, ship.payloadKg)
    assert.equal(r.outcome, 'orbit', `${ship.id} with ${ship.payloadKg} kg: ${r.outcome}`)
    assert.ok(r.apo >= APO_MIN && r.peri >= PERI_MIN, `${ship.id}: the orbit clears the air and reaches the station`)
    assert.ok(r.marginPct >= MARGIN.tight && r.marginPct < MARGIN.comfortable, `${ship.id}: rated cargo leaves a thin but real margin, got ${r.marginPct.toFixed(1)}%`)
    assert.equal(liftForecast(ship.id, ship.payloadKg).verdict, 'tight')
    assert.ok(r.seconds > 60 && r.seconds < 110, `${ship.id}: the climb takes about a minute and a half, got ${r.seconds.toFixed(0)} s`)
    assert.ok(r.peakLoad < 0.5, `${ship.id}: the guidance line is gentle on the stack`)
    // a light design leaves room for mistakes
    assert.equal(liftForecast(ship.id, 7).verdict, 'comfortable', `${ship.id} with one light instrument`)
  }
})

test('the forecast is the flight: same steps, same guidance, same answer', () => {
  for (const ship of SHIPS) {
    const s = startAscent(ship.id, 12)
    let steps = 0
    while ((s.status === 'pad' || s.status === 'flying') && steps++ < 60 * 400) stepAscent(s, guidanceControls(s))
    const flown = resultOf(s), forecast = liftForecast(ship.id, 12)
    assert.equal(flown.outcome, forecast.outcome)
    assert.equal(flown.marginPct, forecast.marginPct)
    assert.equal(flown.seconds, forecast.seconds)
    assert.deepEqual(flyAscent(ship.id, 12), flyAscent(ship.id, 12), 'and it is the same every time')
    assert.ok(Math.abs(s.t - steps * DT) < 1e-6 + DT, 'one fixed step at a time')
  }
})

test('weight costs propellant, and too much of it fails the launch', () => {
  for (const ship of SHIPS) {
    const margins = [0, 6, 12, 18].map(kg => flyAscent(ship.id, kg).marginPct)
    for (let i = 1; i < margins.length; i++) assert.ok(margins[i] < margins[i - 1], `${ship.id}: more cargo, less propellant left (${margins.map(m => m.toFixed(1)).join(' > ')})`)
    const limit = liftLimitKg(ship.id)
    assert.ok(limit > ship.payloadKg, `${ship.id}: more than the rating can fly, on a thinner margin`)
    assert.equal(flyAscent(ship.id, limit).outcome, 'orbit')
    const over = flyAscent(ship.id, limit + 1)
    assert.equal(over.outcome, 'out-of-propellant', `${ship.id}: one kilogram more runs the tanks dry`)
    assert.ok(over.speedShare > 0.9 && over.speedShare < 1.01, 'agonisingly close')
    assert.equal(liftForecast(ship.id, limit + 1).verdict, 'short')
    // and far too much never leaves the pad
    const grounded = flyAscent(ship.id, 600)
    assert.equal(grounded.outcome, 'too-heavy')
    assert.ok(grounded.liftoffTwr < 1 && grounded.alt < 1)
    assert.equal(liftForecast(ship.id, 600).verdict, 'grounded')
  }
  assert.ok(liftLimitKg('shuttle') > liftLimitKg('falcon9') && liftLimitKg('falcon9') > liftLimitKg('atlasv'), 'the Shuttle lifts the most, the Atlas V the least')
})

test('thrust over weight at lift-off falls as cargo is added', () => {
  for (const ship of SHIPS) {
    assert.ok(Math.abs(thrustToWeight(startAscent(ship.id, 0)) - VEHICLES[ship.id].twr) < 1e-9, `${ship.id}: empty, it is the vehicle's own ratio`)
    assert.ok(thrustToWeight(startAscent(ship.id, 30)) < thrustToWeight(startAscent(ship.id, 0)))
    assert.ok(Math.abs(flyAscent(ship.id, 30).liftoffTwr - thrustToWeight(startAscent(ship.id, 30))) < 1e-9)
  }
})

test('a launch nobody steers does not reach orbit', () => {
  for (const ship of SHIPS) {
    const r = flyAscent(ship.id, 7, () => ({ turn: 0, throttle: 1 }))
    assert.notEqual(r.outcome, 'orbit', `${ship.id}: straight up is not an orbit`)
    assert.ok(r.speedShare < 0.5, 'it goes up and comes down')
  }
})

test('a person on a keyboard can fly every launch system at its rated cargo', () => {
  for (const ship of SHIPS) {
    for (const [every, dead] of [[0.25, 3], [0.6, 5], [0.9, 6]]) {
      const r = flyAscent(ship.id, ship.payloadKg, keyboard(every, dead))
      assert.equal(r.outcome, 'orbit', `${ship.id}, a look every ${every} s: ${r.outcome} at ${(r.speedShare * 100).toFixed(0)}% of orbital speed`)
      assert.ok(r.wander > 0, 'and the report knows the steering was not perfect')
    }
  }
})

test('steering well off the line spends the margin, and far off it fails', () => {
  const lagging = (deg: number) => (s: Ascent): Controls => {
    const e = off(s) - rad(deg)
    return { turn: Math.max(-1, Math.min(1, e / (TURN_RATE * 0.25))), throttle: 1 }
  }
  for (const ship of SHIPS) {
    const clean = flyAscent(ship.id, ship.payloadKg)
    const sloppy = flyAscent(ship.id, ship.payloadKg, lagging(8))
    assert.equal(sloppy.outcome, 'orbit', `${ship.id}: eight degrees behind the line still makes it`)
    assert.ok(sloppy.marginPct < clean.marginPct - 1, `${ship.id}: but it costs propellant (${sloppy.marginPct.toFixed(1)}% against ${clean.marginPct.toFixed(1)}%)`)
    assert.notEqual(flyAscent(ship.id, ship.payloadKg, lagging(20)).outcome, 'orbit', `${ship.id}: twenty degrees behind does not`)
    assert.equal(flyAscent(ship.id, 7, lagging(-40)).outcome, 'breakup', `${ship.id}: forty degrees ahead of the line, low down, tears it apart`)
  }
})

test('the stacks differ in how much rough steering they take', () => {
  const limits = Object.fromEntries(SHIPS.map(s => [s.id, VEHICLES[s.id].loadLimit])) as Record<ShipId, number>
  assert.ok(limits.shuttle < limits.falcon9 && limits.falcon9 < limits.atlasv, 'the winged Shuttle takes the least sideways air load, the Atlas V the most')
  // the same mistake, two seconds hard over at 800 m: the Shuttle breaks up, the other two fly on
  assert.equal(flyAscent('shuttle', 7, yank(800, 2)).outcome, 'breakup')
  assert.equal(flyAscent('falcon9', 7, yank(800, 2)).outcome, 'orbit')
  assert.equal(flyAscent('atlasv', 7, yank(800, 2)).outcome, 'orbit')
})

test('cutting the engines low down ends the launch', () => {
  for (const ship of SHIPS) {
    let cut = false
    const r = flyAscent(ship.id, 7, s => { cut ||= altitude(s) > 400; return { ...guidanceControls(s), throttle: cut ? 0 : 1 } })
    // it falls back; the Shuttle's stack comes apart in the airflow before it gets there
    assert.ok(r.outcome === 'crash' || r.outcome === 'breakup', `${ship.id}: ${r.outcome}`)
    assert.ok(r.speedShare < 0.3)
  }
})

test('the state stays physical all the way up', () => {
  for (const ship of SHIPS) {
    const s = startAscent(ship.id, ship.payloadKg)
    let lastMass = s.mass, staged = false, n = 0
    while ((s.status === 'pad' || s.status === 'flying') && n++ < 60 * 400) {
      stepAscent(s, guidanceControls(s))
      assert.ok(s.fuel1 >= 0 && s.fuel2 >= 0, 'no negative propellant')
      assert.ok(s.mass <= lastMass + 1e-9, 'mass only ever falls')
      assert.ok(Number.isFinite(s.x + s.y + s.vx + s.vy + s.att))
      if (s.stage === 2 && !staged) { staged = true; assert.ok(s.fuel1 < 1e-6, 'the first stage is spent before it is dropped') }
      lastMass = s.mass
    }
    assert.equal(s.status, 'orbit')
    assert.ok(staged && s.stagedAt !== null && s.liftoffAt !== null)
    const o = orbitOf(s)
    assert.ok(o.bound && o.apo >= APO_MIN && o.peri >= PERI_MIN)
  }
})

test('the guidance arrives level at the station\'s altitude, not still climbing', () => {
  for (const ship of SHIPS) {
    for (const kg of [0, ship.payloadKg]) {
      const r = flyAscent(ship.id, kg)
      assert.equal(r.outcome, 'orbit')
      assert.ok(r.apo >= APO_MIN && r.apo < PLANET.targetAlt * 1.12, `${ship.id} with ${kg} kg: high point ${Math.round(showAltKm(r.apo))} km is near the station's ${REAL.altKm} km`)
      assert.ok(Math.abs(r.alt - PLANET.targetAlt) < 600, `${ship.id} with ${kg} kg: it is at the station's altitude when orbit is reached`)
    }
  }
})

test('speed read-outs are true near the pad and real at orbit', () => {
  assert.ok(Math.abs(showSpeedKms(30) * 1000 - 30) < 8, 'thirty metres a second off the pad reads as about that')
  let last = -1
  for (let v = 0; v <= ORBIT_SPEED * 1.2; v += 10) { const shown = showSpeedKms(v); assert.ok(shown > last, 'and it never runs backwards'); last = shown }
})
