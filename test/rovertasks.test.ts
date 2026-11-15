// The rover's rocket, the stuck-rover rescue and the sample selection: what is real, what each
// choice costs, and that no choice is best at everything.
import test from 'node:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { MISSION_BUDGET, SHIPS } from '../src/core/data'
import { BACKUP_SOLS, DELIVERY_ROCKETS, ROCKET_ANY, ROCKET_MIN, deliveryRocket, marginKg, rocketRefusal, rocketsFor, spacecraftKg } from '../src/core/delivery'
import { Mission } from '../src/core/mission'
import {
  CAUSES, CAUSE_ORDER, FIXES, FIX_ORDER, NOMINAL, OFF_TRACK_M, RESCUE_LIMIT_SOLS, START_WEAR, STUCK_CHANCE, WEAR_LIMIT, WORN_SPEED, cutPath, fixOutcome, newRescue, pointAlong, provenSlope,
  routeRisk, stuckOn, telemetry, type StuckCause,
} from '../src/core/rescue'
import { ROVERS } from '../src/core/rovers'
import { MAX_SAMPLE_VALUE, ROCKS, ROCK_IDS, SAMPLE_RANGE_M, SITE_DISTANCES_M, SITE_GAP_M, SITE_ROCKS, TUBE_COUNT, cacheRating, picksBlock, rock, rockTag, sampleSites, sampleValue } from '../src/core/samples'
import { SOL_HOURS, driveWhPerM, nearestStop, simulateDrive, slopeAt } from '../src/core/survey'
import { USD_MILLIONS_PER_CREDIT } from '../src/data/launchVehicles'
import { FALCON_MARS, ROVER_ROCKET_FACTS, ROVER_TASK_DATA, SAMPLE_FACTS, SPACECRAFT, TASK_CARDS, TUBES, roverRocketFacts, sampleFacts, taskSources } from '../src/data/roverTasks'

const NASA = /^https:\/\/(science\.nasa\.gov|www\.jpl\.nasa\.gov|www\.nasa\.gov|mars\.nasa\.gov)\//

/** A mission with the payload on, the relay mended and power routed: ready to choose a rover. */
function aboard(opts: { ship?: 'atlasv' | 'shuttle' | 'falcon9'; cargo?: Record<string, number>; calibrated?: boolean } = {}) {
  const m = new Mission({ callSign: 'Test', suit: 'ember', ship: opts.ship ?? 'atlasv', ...(opts.cargo ? { loadout: { cargo: opts.cargo } } : {}) })
  assert.equal(m.selectInstrument('ir'), null)
  assert.equal(m.activatePayload(), null)
  if (m.relayFault) m.complete('relay', 'test')
  if (opts.calibrated) m.complete('calibration', 'test')
  m.setPower({ life: 3, comms: 4, research: 2 })
  return m
}
/** On Mars with a rover that arrived safely, and dice that never roll wheel trouble. */
function landed(rover: 'perseverance' | 'curiosity' = 'perseverance', opts: Parameters<typeof aboard>[0] = {}) {
  const m = aboard(opts)
  m.rng = () => 0
  assert.equal(m.chooseRover(rover), null)
  assert.equal(m.chooseRocket('atlas541'), null)
  m.rng = () => 0.999
  return m
}
/** Stuck at a spot with a given cause. */
function stuck(cause: StuckCause, rover: 'perseverance' | 'curiosity' = 'perseverance') {
  const m = landed(rover)
  m.addWaypoint({ x: 0, y: 300 })
  assert.equal(m.deploy(), null)
  m.rescue = newRescue(cause, m.pos, m.spotHere!.label, m.wheelWear, () => 0.5)
  return m
}

// ---------------------------------------------------------------- the data
test('the rover-task snapshot keeps the words of its sources, and says what is not NASA', () => {
  assert.match(ROVER_TASK_DATA.retrieved, /^\d{4}-\d{2}-\d{2}$/)
  assert.match(ROVER_TASK_DATA.model, /success rate/)
  assert.match(ROVER_TASK_DATA.limits, /drill, not to a wheel/)
  const facts = [
    ...ROVER_ROCKET_FACTS.flatMap(r => [...r.brief, ...r.numbers, ...(r.cost ? [r.cost] : [])]),
    SPACECRAFT.curiosity, SPACECRAFT.perseverance, TUBES, TUBES.collected,
    ...SAMPLE_FACTS.flatMap(s => [{ backing: s.catalog }, ...s.story]),
    ...TASK_CARDS,
  ]
  for (const f of facts) {
    assert.ok(f.backing.length >= 1, 'every fact rests on at least one quote')
    for (const b of f.backing) {
      assert.ok(b.quote.length > 10)
      assert.ok(['by script', 'by hand'].includes(b.checked))
    }
  }
  // Everything is a NASA page, except the one news report about funding, which says so.
  const news = TASK_CARDS.find(c => c.id === 'sample-return')!
  assert.match(news.provider, /not NASA/)
  for (const s of taskSources(facts.filter(f => f !== news))) assert.match(s.url, NASA, s.url)
  // The one figure that is not NASA's is labelled as SpaceX's.
  assert.equal(FALCON_MARS.provider, 'SpaceX')
  assert.equal(FALCON_MARS.checked, 'by hand')
  assert.match(FALCON_MARS.note, /Not a NASA figure/)
})

test('the five rocks are real samples from NASA\'s catalog', () => {
  assert.deepEqual(SAMPLE_FACTS.map(s => [s.number, s.name, s.feature, s.sol]), [
    [1, 'Roubion', 'Roubion', 164], [2, 'Montdenier', 'Rochette', 194], [11, 'Skyland', 'Skinner Ridge', 495], [12, 'Hazeltop', 'Wildcat Ridge', 509], [25, 'Sapphire Canyon', 'Cheyava Falls', 1215],
  ])
  for (const s of SAMPLE_FACTS) {
    // the catalog entry itself carries the number, the rock, the sol and the core length the game shows
    const entry = s.catalog[0].quote
    assert.ok(entry.includes(`Sample No. ${s.number} `) && entry.includes(`Feature Name: ${s.feature} `) && entry.includes(`Sol Sealed: ${s.sol} `), s.name)
    if (s.heightCm !== null) assert.ok(entry.includes(`${s.heightCm} cm`), `${s.name}: core length`)
    else assert.ok(entry.includes('Sample Height: n/a'), `${s.name}: no core`)
    assert.ok(s.story.length >= 1)
    // NASA's own picture of the sample is saved, with the caption printed beside it on the catalog page
    assert.ok(existsSync(join('public', s.image.file)), `${s.name}: picture saved`)
    assert.equal(s.image.credit, 'NASA/JPL-Caltech')
    assert.match(s.image.url, /^https:\/\/science\.nasa\.gov\//)
    assert.ok(s.image.caption.quote.length > 30)
  }
  assert.deepEqual([...ROCK_IDS].sort(), SAMPLE_FACTS.map(s => s.id).sort(), 'one rock in the game for each sample')
  assert.equal(TUBES.total, 43)
  assert.equal(TUBES.forSamples, 38)
  assert.match(sampleFacts('skyland').note!, /our reading/)
})

// ---------------------------------------------------------------- the rover's rocket
test('rocket prices are NASA cost figures at one credit for each ten million dollars', () => {
  for (const k of DELIVERY_ROCKETS) {
    const cost = roverRocketFacts(k.facts).cost
    assert.equal(k.price, cost ? Math.round(cost.usdMillions / USD_MILLIONS_PER_CREDIT) : null, k.id)
  }
  assert.equal(deliveryRocket('atlas541').price, 24, '$243 million to launch Mars 2020')
  assert.equal(deliveryRocket('falcon9x').price, 11, '$109.4 million to launch IMAP on a Falcon 9')
  assert.equal(deliveryRocket('saturnv').price, null)
  assert.match(roverRocketFacts('atlas-v-541').cost!.backing[0].quote, /\$243 million/)
  assert.match(roverRocketFacts('falcon-9-expendable').cost!.backing[0].quote, /\$109\.4 million/)
  assert.match(roverRocketFacts('falcon-9-expendable').cost!.basis, /stand-in/)
  assert.deepEqual([ROCKET_MIN, ROCKET_ANY], [11, 24])
  // The budget grew by exactly the price of the rocket that carries either rover.
  assert.equal(MISSION_BUDGET, 160)
  for (const s of SHIPS) assert.equal(s.budget, MISSION_BUDGET - s.launchCost)
})

test('no rocket is best at everything, and two of them cannot be bought for every rover', () => {
  const atlas = deliveryRocket('atlas541'), falcon = deliveryRocket('falcon9x'), saturn = deliveryRocket('saturnv')
  assert.ok(falcon.price! < atlas.price! / 2, 'the Falcon 9 costs less than half as much')
  assert.ok(falcon.successPct! < atlas.successPct!, 'and is less likely to get the rover there')
  for (const k of [atlas, falcon]) assert.ok(k.pros.length >= 1 && k.cons.length >= 1, `${k.id} shows both sides`)
  // Real masses: the whole spacecraft, not the rover alone.
  assert.equal(spacecraftKg('curiosity'), 3893)
  assert.equal(spacecraftKg('perseverance'), 3893 + 126, "our sum of two NASA numbers: Curiosity's spacecraft plus the heavier rover")
  assert.equal(marginKg('falcon9x', 'perseverance'), FALCON_MARS.kg - 4019)
  assert.equal(marginKg('falcon9x', 'perseverance'), 1, 'one kilogram to spare')
  assert.equal(marginKg('atlas541', 'perseverance'), null, 'no published figure to compare the Atlas V with')
  assert.equal(falcon.verdict, "It works, but it's right at the limit. One extra kilogram and you'd miss Mars.")
  assert.equal(rocketRefusal(saturn, 'perseverance'), 'Too old and too expensive. It retired in 1973!')
  assert.match(rocketRefusal(falcon, 'curiosity')!, /Perseverance only/)
  assert.equal(rocketRefusal(atlas, 'curiosity'), null)
  assert.deepEqual(rocketsFor('perseverance').map(k => k.id), ['falcon9x', 'atlas541'])
  assert.deepEqual(rocketsFor('curiosity').map(k => k.id), ['atlas541'])
})

test('the rover needs a rocket before it can do anything, and the choice is made once', () => {
  const m = aboard()
  assert.match(m.rocketBlock('atlas541')!, /Choose a rover first/)
  m.rng = () => 0
  assert.equal(m.chooseRover('perseverance'), null)
  assert.equal(m.delivery, null)
  for (const block of [m.addWaypoint({ x: 100, y: 0 }), m.deployBlock(), m.testBlock('photo'), m.rechargeBlock(), m.sampleBlock(), m.decideBase(0)]) assert.match(block!, /rocket/)
  assert.equal(m.canDrive, false)
  assert.equal(m.rocketBlock('saturnv'), 'Too old and too expensive. It retired in 1973!')
  const before = m.credits
  assert.equal(m.chooseRocket('atlas541'), null)
  assert.deepEqual(m.delivery, { rocket: 'atlas541', ok: true, solsLost: 0 })
  assert.equal(m.credits, before - 24)
  assert.equal(m.hoursUsed, 0)
  assert.match(m.chooseRocket('falcon9x')!, /already been launched/)
  assert.equal(m.addWaypoint({ x: 100, y: 0 }), null, 'now the rover can work')
  assert.ok(m.causes().some(c => c.good && /Atlas V 541 carried Perseverance to Mars for 24 cr/.test(c.text)))
})

test('a failed launch is never a dead end: a backup flies and three Mars days are lost', () => {
  const m = aboard()
  m.rng = () => 0
  m.chooseRover('perseverance')
  m.rng = () => 0.85 // above the Falcon 9's 80 %, below the Atlas V's 98 %
  assert.equal(m.chooseRocket('falcon9x'), null)
  assert.deepEqual(m.delivery, { rocket: 'falcon9x', ok: false, solsLost: BACKUP_SOLS })
  assert.equal(m.hoursUsed, BACKUP_SOLS * SOL_HOURS)
  assert.equal(m.sol, BACKUP_SOLS + 1, 'the mission starts on day 4')
  assert.ok(m.canDrive, 'the backup rover is on Mars and ready')
  assert.ok(m.log.some(e => e.kind === 'alert' && /launch failed/.test(e.text)))
  assert.ok(m.causes().some(c => !c.good && /Falcon 9 launch failed.*3 Mars days were lost/.test(c.text)))
  // The same roll on the Atlas V would have reached Mars.
  const safe = aboard()
  safe.rng = () => 0
  safe.chooseRover('perseverance')
  safe.rng = () => 0.85
  safe.chooseRocket('atlas541')
  assert.equal(safe.delivery!.ok, true)
  // The cheaper rocket leaves more in the budget.
  assert.equal(m.credits - safe.credits, 24 - 11)
})

test('station cargo and the instrument decide which rover and rocket are still affordable', () => {
  // A full hold on the Shuttle leaves 54 cr: the IR spectrometer (42) and 12 cr for a rocket.
  const m = aboard({ ship: 'shuttle', cargo: { water: 2000, shielding: 1500, parts: 1000, rack: 500 } })
  assert.equal(m.credits, 12)
  assert.match(m.roverBlock('curiosity')!, /Curiosity can only reach Mars on the Atlas V 541 \(24 cr\), and 12 cr is left/)
  assert.equal(m.roverBlock('perseverance'), null)
  m.rng = () => 0
  assert.equal(m.chooseRover('perseverance'), null)
  assert.match(m.rocketBlock('atlas541')!, /costs 24 cr, and 12 cr is left/)
  assert.equal(m.chooseRocket('falcon9x'), null)
  assert.equal(m.credits, 1)
})

// ---------------------------------------------------------------- stuck rover rescue
test('route risk reads the real terrain: slope under the path, and distance from where the rover parked', () => {
  for (const rv of Object.values(ROVERS)) {
    assert.ok(provenSlope(rv) > 3 && provenSlope(rv) < 15, `${rv.name}: ${provenSlope(rv)} degrees`)
    // Driving between two places the real rover parked, close together, is as safe as it gets.
    const stops = rv.area.stops
    const safe = routeRisk(rv, stops[0], [stops[1]])
    assert.ok(safe.offTrackM <= OFF_TRACK_M)
    assert.equal(safe.offTrack, false)
    // The far corner of the map is ground no rover has driven.
    const corner = { x: -1400, y: -1400 }
    assert.ok(nearestStop(rv, corner).distM > OFF_TRACK_M)
    const wild = routeRisk(rv, { x: 0, y: 0 }, [corner])
    assert.ok(wild.offTrack)
    assert.notEqual(wild.level, 'low')
    assert.equal(wild.chance, STUCK_CHANCE[wild.level])
    assert.equal(wild.steep, wild.maxSlopeDeg > provenSlope(rv))
    assert.ok(wild.maxSlopeDeg >= slopeAt(rv, corner))
  }
  assert.ok(STUCK_CHANCE.low < STUCK_CHANCE.medium && STUCK_CHANCE.medium < STUCK_CHANCE.high)
})

test('wheel trouble ends a drive early, once a mission, and never on a short hop', () => {
  const rv = ROVERS.perseverance
  const far = [{ x: 0, y: 600 }], hop = [{ x: 0, y: 100 }]
  const plan = simulateDrive(rv, { x: 0, y: 0 }, far, rv.batteryWh, false)
  const hit = stuckOn(rv, { x: 0, y: 0 }, far, plan, 0, () => 0)!
  assert.ok(hit.alongM >= plan.distM * 0.4 && hit.alongM <= plan.distM * 0.75)
  assert.ok(CAUSE_ORDER.includes(hit.cause))
  assert.equal(stuckOn(rv, { x: 0, y: 0 }, far, plan, 0, () => 0.999), null, 'the dice can spare a drive')
  assert.equal(stuckOn(rv, { x: 0, y: 0 }, hop, simulateDrive(rv, { x: 0, y: 0 }, hop, rv.batteryWh, false), 3, () => 0), null, 'a short hop is safe')
  // From the second drive on the chance is high whatever the route, so a mission rarely goes by without it.
  assert.ok(stuckOn(rv, { x: 0, y: 0 }, far, plan, 1, () => 0.85), 'drive 2: a roll of 0.85 is under 0.9')
  assert.deepEqual(pointAlong({ x: 0, y: 0 }, far, 240), { x: 0, y: 240 })
  assert.deepEqual(cutPath({ x: 0, y: 0 }, [{ x: 0, y: 100 }, { x: 100, y: 100 }], 150), [{ x: 0, y: 100 }, { x: 50, y: 100 }])

  const m = landed()
  m.rng = () => 0
  m.addWaypoint({ x: 0, y: 600 })
  const forecast = m.forecast()!
  assert.equal(m.deploy(), null)
  assert.ok(m.stuck)
  assert.ok(m.drives[0].distM < forecast.distM, 'the rover stopped before the point it was sent to')
  assert.equal(m.rescue!.spot, m.spotHere!.label)
  assert.equal(m.rescue!.wearBefore, START_WEAR.perseverance)
  for (const block of [m.addWaypoint({ x: 0, y: 0 }), m.deployBlock(), m.testBlock('photo'), m.rechargeBlock(), m.decideBase(0)]) assert.match(block!, /stuck/)
  assert.equal(m.canDrive, false)
  // Free it, then drive again with the same dice: it does not happen twice.
  assert.equal(m.tryFix('reroute'), null)
  if (m.stuck) assert.equal(m.tryFix('wait'), null)
  assert.equal(m.stuck, false)
  m.addWaypoint({ x: 0, y: 0 })
  assert.equal(m.deploy(), null)
  assert.equal(m.stuck, false)
  assert.equal(m.spotHere!.label, 'A')
})

test('the telemetry shows each cause in its own way, with one reading always missing', () => {
  const [lo, hi] = NOMINAL.currentA
  for (const roll of [0, 0.3, 0.6, 0.99]) {
    const rock = telemetry('rock', () => roll)
    assert.equal(rock.currentA.filter(a => a !== null && a >= NOMINAL.stallA).length, 1, 'rock: one wheel stalls')
    assert.ok(rock.currentA.filter(a => a !== null && a < NOMINAL.stallA).every(a => a! >= lo && a! <= hi), 'the others are calm')
    assert.equal(rock.motorC, null, 'the temperature reading did not arrive')
    const sand = telemetry('sand', () => roll)
    const got = sand.currentA.filter((a): a is number => a !== null)
    assert.equal(got.length, 5, 'sand: one wheel reading is missing')
    assert.ok(got.every(a => a > hi && a < NOMINAL.stallA), 'every other wheel works hard, none stalls')
    assert.ok(sand.tiltRising && sand.tiltDeg < NOMINAL.tiltCalmDeg)
    const slope = telemetry('slope', () => roll)
    assert.ok(slope.tiltDeg >= 25 && slope.tiltDeg < NOMINAL.tiltLimitDeg, 'slope: tilt near its limit')
    assert.ok(slope.currentA.every(a => a !== null && a < NOMINAL.stallA))
    const heat = telemetry('heat', () => roll)
    assert.ok(heat.motorC! > NOMINAL.motorLimitC, 'heat: motors over their limit')
    assert.ok(heat.currentA.filter((a): a is number => a !== null).every(a => a >= lo && a <= hi) && heat.tiltDeg < NOMINAL.tiltCalmDeg, 'everything else looks normal')
  }
})

test('each cause has one fix that frees the rover at once, and wrong fixes cost days and wheels', () => {
  for (const cause of CAUSE_ORDER) {
    const right = CAUSES[cause].fix
    assert.ok(fixOutcome(cause, right).freed, `${cause}: ${right} frees it`)
    // the right fix is the quickest one that works, and no fix is right for two causes
    const working = FIX_ORDER.filter(f => fixOutcome(cause, f).freed)
    assert.equal([...working].sort((a, b) => FIXES[a].sols - FIXES[b].sols)[0], right)
    const m = stuck(cause)
    const hours = m.hoursUsed
    assert.equal(m.diagnose(cause), null)
    assert.equal(m.tryFix(right), null)
    assert.equal(m.rescue!.result, 'clean')
    assert.equal(m.stuck, false)
    assert.ok(Math.abs(m.hoursUsed - hours - FIXES[right].sols * SOL_HOURS) < 1e-9, 'the Mars days pass')
    assert.ok(!m.wheelsWorn)
    assert.ok(m.canDrive)
    assert.ok(m.causes().some(c => c.good && /freed the rover at the first try/.test(c.text)))
    assert.match(m.tryFix(right)!, /not stuck/)
  }
  assert.equal(new Set(CAUSE_ORDER.map(c => CAUSES[c].fix)).size, 4)
  // Waiting never hurts the wheels and only cures heat; changing route is the slow way out of anything mechanical.
  for (const cause of CAUSE_ORDER) {
    assert.equal(fixOutcome(cause, 'wait').wear, 0)
    assert.equal(fixOutcome(cause, 'wait').freed, cause === 'heat')
    assert.equal(fixOutcome(cause, 'reroute').freed, cause !== 'heat')
  }
  assert.ok(FIXES.reroute.sols > FIXES.rotate.sols && FIXES.rotate.sols > FIXES.reverse.sols)
})

test('worn wheels slow the rover for the rest of the mission', () => {
  const m = stuck('rock')
  const rv = ROVERS.perseverance
  assert.equal(m.diagnose('sand'), null, 'a wrong reading of the telemetry')
  assert.equal(m.tryFix('rotate'), null)
  assert.ok(m.stuck, 'the wrong fix does not free it')
  assert.equal(m.wheelWear, 14)
  assert.ok(!m.wheelsWorn)
  assert.equal(m.rover!.topSpeedMh, rv.topSpeedMh)
  assert.equal(m.tryFix('rotate'), null)
  assert.equal(m.wheelWear, 28)
  assert.ok(m.wheelsWorn && m.wheelWear >= WEAR_LIMIT)
  assert.equal(m.tryFix('reverse'), null)
  assert.equal(m.rescue!.result, 'freed')
  assert.equal(m.rescue!.solsUsed, 2.5)
  // Slower wheels: every metre takes longer and costs more battery.
  assert.equal(m.rover!.topSpeedMh, Math.round(rv.topSpeedMh * WORN_SPEED))
  assert.ok(driveWhPerM(m.rover!, false) > driveWhPerM(rv, false) * 1.3)
  m.addWaypoint({ x: 0, y: 0 })
  const back = m.forecast()!
  assert.ok(Math.abs(back.hours - 300 / (rv.topSpeedMh * WORN_SPEED)) < 0.06, `300 m at 70 % speed: ${back.hours} h`)
  const text = m.causes().map(c => c.text).join(' ')
  assert.match(text, /it took 3 tries and 2\.5 Mars days/)
  assert.match(text, /The telemetry showed blocked wheel, not soft sand/)
  assert.match(text, /Wheel wear reached 31%, past the 20% limit, so top speed fell to 70%/)
  // Curiosity's wheels start worn (real), so it forgives less (our number).
  const c = stuck('rock', 'curiosity')
  assert.equal(c.wheelWear, START_WEAR.curiosity)
  c.tryFix('rotate')
  assert.ok(c.wheelsWorn, 'one bad fix is enough')
})

test('the rover is held for at most five Mars days', () => {
  const m = stuck('rock')
  const hours = m.hoursUsed
  for (let i = 0; i < 4; i++) assert.equal(m.tryFix('wait'), null)
  assert.ok(m.stuck)
  assert.match(m.fixBlock('reroute')!, /takes 2 Mars days, and only 1 are left before the 5-day limit/)
  assert.equal(m.tryFix('wait'), null)
  assert.equal(m.rescue!.result, 'held')
  assert.equal(m.rescue!.solsUsed, RESCUE_LIMIT_SOLS)
  assert.equal(m.stuck, false, 'after five days the team has worked it free')
  assert.ok(Math.abs(m.hoursUsed - hours - RESCUE_LIMIT_SOLS * SOL_HOURS) < 1e-9)
  assert.equal(m.wheelWear, 0, 'waiting never hurts the wheels')
  assert.ok(m.canDrive)
  assert.ok(m.causes().some(c => !c.good && /no fix worked, and the rover was held for 5 Mars days/.test(c.text)))
})

// ---------------------------------------------------------------- sample selection
test('the three sample sites are real rover stops, each one leg farther out', () => {
  for (const rv of Object.values(ROVERS)) {
    const sites = sampleSites(rv)
    assert.equal(sites.length, 3)
    assert.deepEqual(sites.map(s => s.rocks), SITE_ROCKS)
    sites.forEach((site, i) => {
      assert.ok(rv.area.stops.includes(site.stop), `${rv.name} ${site.name}: a place the real rover parked`)
      const d = Math.hypot(site.x, site.y)
      assert.ok(Math.abs(d - SITE_DISTANCES_M[i]) <= 150, `${rv.name} ${site.name}: ${Math.round(d)} m from the start`)
      for (const other of sites) if (other !== site) assert.ok(Math.hypot(other.x - site.x, other.y - site.y) >= SITE_GAP_M, `${rv.name}: sites stand apart`)
      if (i) assert.ok(Math.hypot(sites[i - 1].x - site.x, sites[i - 1].y - site.y) <= 600, `${rv.name} ${site.name}: one leg on from the site before`)
    })
  }
  // Every rock lies at exactly one site: the common ones near the start, the rarest farthest out.
  assert.deepEqual([...SITE_ROCKS.flat()].sort(), [...ROCK_IDS].sort())
  const worth = SITE_ROCKS.map(ids => Math.max(...ids.map(id => rock(id).value)))
  assert.deepEqual(worth, [...worth].sort((a, b) => a - b), 'the best rock at each site is worth more the farther out it lies')
  assert.deepEqual(ROCK_IDS.map(rockTag).sort().join(''), 'ABCDE')
  assert.equal(rockTag('montdenier'), 'A')
  assert.equal(rockTag('sapphire'), 'E')
  const m = landed()
  const [site] = m.sampleSites
  assert.equal(m.atSampleSite, false)
  assert.match(m.sampleBlock()!, /Drive to a sample site/)
  // A tap near the marker goes to the site itself.
  assert.equal(m.addWaypoint({ x: site.x + 15, y: site.y - 10 }), null)
  assert.deepEqual(m.waypoints[0], { x: site.x, y: site.y })
  assert.equal(m.deploy(), null)
  assert.ok(m.atSampleSite && Math.hypot(m.pos.x - site.x, m.pos.y - site.y) <= SAMPLE_RANGE_M)
  assert.equal(m.siteHere!.id, 0)
  assert.ok(m.siteOpen)
  assert.equal(m.sampleBlock(), null)
  // Stopping anywhere within range of a site counts as being there.
  const near = landed()
  near.addWaypoint({ x: site.x + 40, y: site.y })
  near.deploy()
  assert.ok(near.atSampleSite)
  assert.notDeepEqual(near.pos, { x: site.x, y: site.y })
})

test('three tubes, five rocks, three sites: the value is in the choice', () => {
  assert.equal(TUBE_COUNT, 3)
  assert.equal(ROCKS.length, 5)
  assert.equal(MAX_SAMPLE_VALUE, 100)
  assert.equal(sampleValue(['sapphire', 'hazeltop', 'skyland']), 100)
  assert.equal(sampleValue(['montdenier', 'skyland', 'roubion']), 45, 'common rocks only')
  assert.equal(cacheRating(100).level, 'great')
  assert.equal(cacheRating(45).level, 'fair')
  assert.equal(cacheRating(44).word, 'Common rocks only')
  assert.equal(ROCKS.find(r => r.id === 'roubion')!.value, 0, 'the crumbling rock leaves an empty tube')
  assert.deepEqual(ROCKS.filter(r => r.organic).map(r => r.id).sort(), ['hazeltop', 'sapphire'])
  const [s1, s2, s3] = sampleSites(ROVERS.perseverance)
  assert.equal(sampleValue(s1.rocks), 20, 'the nearest site alone is a weak cache')
  assert.equal(sampleValue([...s2.rocks, ...s3.rocks]), 100, 'the best cache needs the two far sites')
  assert.match(picksBlock([], s1, [])!, /at least one rock/)
  assert.match(picksBlock(['skyland', 'skyland'], s2, [])!, /different rock/)
  assert.match(picksBlock(['sapphire'], s1, [])!, /not at this site/)
  assert.match(picksBlock(['skyland'], s2, ['skyland'])!, /already in a tube/)
  assert.match(picksBlock(['skyland', 'hazeltop'], s2, ['montdenier', 'roubion'])!, /Only 1 tube is left/)
  assert.equal(picksBlock(['skyland', 'hazeltop'], s2, ['montdenier']), null, 'tubes can be spread over sites')
  assert.equal(picksBlock(['sapphire'], s3, ['skyland', 'hazeltop']), null)
})

test('tubes are shared between the sites, fill the rock-samples check for the whole region, and the debrief names what was left', () => {
  const m = landed('perseverance')
  const [s1, s2, s3] = m.sampleSites
  const go = (x: Mission, site: typeof s1) => { assert.equal(x.addWaypoint({ x: site.x, y: site.y }), null); assert.equal(x.deploy(), null); assert.equal(x.siteHere?.id, site.id) }
  const bar = (x: Mission) => x.report(x.spots[0]).bars.find(b => b.id === 'sample')!
  go(m, s1)
  assert.equal(bar(m).score, null)
  assert.ok(bar(m).shared, 'one cache counts for every spot')
  assert.equal(m.tubesLeft, 3)
  assert.deepEqual(m.rocksLeft(s1), s1.rocks)
  const before = m.batteryWh
  assert.equal(m.tubeCost, 100)
  assert.match(m.collectSamples(['sapphire'])!, /not at this site/)
  assert.equal(m.collectSamples(['montdenier', 'roubion']), null)
  assert.equal(before - m.batteryWh, 200, 'each tube costs battery')
  assert.equal(m.tubesLeft, 1)
  assert.equal(m.siteOpen, false, 'nothing left to core at this site')
  assert.match(m.sampleBlock()!, /Every rock at this site is already in a tube/)
  assert.equal(bar(m).score, 20, 'the check fills as tubes are sealed')
  assert.match(bar(m).value, /2 of 3 tubes: Montdenier, Roubion/)
  // The last tube goes to the second site.
  go(m, s2)
  assert.ok(m.siteOpen)
  assert.match(m.collectSamples(['skyland', 'hazeltop'])!, /Only 1 tube is left/)
  assert.equal(m.collectSamples(['skyland']), null)
  assert.deepEqual(m.samples!.picks, ['montdenier', 'roubion', 'skyland'])
  assert.deepEqual({ value: m.samples!.value, clear: m.samples!.clear, organics: m.samples!.organics, wh: m.samples!.wh }, { value: 45, clear: false, organics: 0, wh: 300 })
  assert.equal(m.siteOpen, false)
  assert.match(m.sampleBlock()!, /already sealed/)
  assert.match(m.collectSamples(['hazeltop'])!, /already sealed/)
  for (const spot of m.spots) assert.equal(m.report(spot).bars.find(b => b.id === 'sample')!.score, 45)
  assert.match(bar(m).value, /Fair cache: Montdenier, Roubion, Skyland/)
  const text = m.causes().map(c => c.text).join(' ')
  assert.match(text, /Three tubes sealed, science value 45 of 100/)
  assert.match(text, /2 rocks with an organic-like signal stayed behind: the uncalibrated instrument could not read it/)
  assert.match(text, /sealed empty/)
  // A calibrated instrument reads the composition, and the best three lie at the two far sites.
  const best = landed('perseverance', { calibrated: true })
  go(best, s2)
  assert.equal(best.collectSamples(['skyland', 'hazeltop']), null)
  go(best, s3)
  assert.equal(best.collectSamples(['sapphire']), null)
  assert.deepEqual({ value: best.samples!.value, clear: best.samples!.clear, organics: best.samples!.organics }, { value: 100, clear: true, organics: 2 })
  assert.ok(best.causes().some(c => c.good && /science value 100 of 100: Skyland, Hazeltop, Sapphire Canyon/.test(c.text)))
  // Tubes that were never filled are named in the debrief.
  const part = landed('perseverance')
  go(part, s1)
  assert.equal(part.collectSamples(['montdenier']), null)
  assert.ok(part.siteOpen, "a rock and two tubes are left")
  part.decideBase(part.spotHere!.id)
  const short = part.causes().map(c => c.text).join(' ')
  assert.match(short, /One tube sealed, science value 20 of 100: Montdenier/)
  assert.match(short, /2 tubes were never filled/)
  // A base built without any tubes says so.
  const none = landed('perseverance')
  none.addWaypoint({ x: 0, y: 200 })
  none.deploy()
  none.decideBase(none.spotHere!.id)
  assert.ok(none.causes().some(c => !c.good && /No rock samples/.test(c.text)))
})
