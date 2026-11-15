// The station greenhouse rules: mission G1 (Grow Light), mission G2 (What to Grow), the pump
// failure, the score, and the promise that a result is final.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CROPS, CROP_IDS, crop, stageAt, type CropId } from '../src/core/crops'
import {
  BAY_IDS, BAY_PLAN, DRIFTS, GH, Greenhouse, NEED_KCAL, SLIDERS, STEPS, collect, emptyPlan, fitSpare, forecast, newRun, slider, stepRun,
  type BayId, type LoopId, type Plan, type SliderId,
} from '../src/core/greenhouse'

const STEP = 0.05
/** A greenhouse with no drifts and no pump failure. */
const quiet = (opts = {}) => new Greenhouse({ seed: 1, events: false, ...opts })
function run(g: Greenhouse, seconds: number, each?: (g: Greenhouse) => void) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) { g.tick(STEP); each?.(g) }
}
const mid = (id: SliderId) => { const s = slider(id); return (s.good[0] + s.good[1]) / 2 }
/** Puts every control in the middle of its good zone. */
function setUp(g: Greenhouse) { for (const s of SLIDERS) assert.equal(g.setSlider(s.id, mid(s.id)), null) }
/** Brings a reading back into its zone by moving its control, as a player would. */
function correct(g: Greenhouse) {
  for (const s of SLIDERS) if (g.status(s.id) !== 'ok') g.setSlider(s.id, mid(s.id) - g.offsets[s.id])
}
const planOf = (crops: (CropId | null)[]): Plan => { const p = emptyPlan(); BAY_IDS.forEach((b, i) => { p[b] = crops[i] ?? null }); return p }
/** A plan that wins with room to spare: three tomato bays and five radish bays. */
const GOOD: (CropId | null)[] = ['radish', 'radish', 'tomato', 'tomato', 'radish', 'radish', 'tomato', 'radish']
/** Plays G1 to a pass and moves on to the planning screen of G2. */
function toPlan(g: Greenhouse) {
  setUp(g)
  assert.equal(g.startTest(), null)
  run(g, GH.testSeconds + 1, correct)
  assert.equal(g.phase, 'g1-result')
  assert.equal(g.next(), null)
  assert.equal(g.next(), null)
  assert.equal(g.phase, 'g2-plan')
}
/** Picks the crops of a plan (and others up to three, as the mission asks), then plants the bays. */
function plant(g: Greenhouse, crops: (CropId | null)[]) {
  const used = [...new Set(crops.filter(Boolean) as CropId[])]
  for (const c of [...used, ...CROP_IDS.filter(c => !used.includes(c))].slice(0, GH.picks)) assert.equal(g.togglePick(c), null)
  BAY_IDS.forEach((b, i) => assert.equal(g.assign(b, crops[i] ?? null), null))
}

// ------------------------------------------------------------------ data
test('the crop table has six fresh crops with a fast-to-slow trade-off', () => {
  assert.deepEqual(CROP_IDS, ['lettuce', 'radish', 'mizuna', 'kale', 'pepper', 'tomato'])
  for (const c of CROPS) {
    assert.ok(c.growDays > 0 && c.kcal > 0 && c.waterLPerDay > 0, c.id)
    // every crop takes between 2 and 8 real seconds of the 10-second run
    const seconds = c.growDays / (GH.runDays / GH.runSeconds)
    assert.ok(seconds >= 2 && seconds <= 8, `${c.id} grows in ${seconds} s`)
  }
  // slower crops give more food at each harvest and drink more
  for (let i = 1; i < CROPS.length; i++) {
    assert.ok(CROPS[i].growDays >= CROPS[i - 1].growDays, 'sorted from fast to slow')
    assert.ok(CROPS[i].kcal > CROPS[i - 1].kcal, `${CROPS[i].id} gives more than ${CROPS[i - 1].id}`)
    assert.ok(CROPS[i].waterLPerDay >= CROPS[i - 1].waterLPerDay)
  }
  assert.equal(stageAt(crop('lettuce'), 0), 'seed')
  assert.equal(stageAt(crop('lettuce'), 0.9), 'vegetative')
  assert.equal(stageAt(crop('tomato'), 0.9), 'reproductive')
  assert.equal(stageAt(crop('tomato'), 1), 'ready')
})

test('eight bays, four on each side, and the plants the deck draws', () => {
  assert.equal(BAY_IDS.length, 8)
  for (const side of ['A', 'B'] as LoopId[]) assert.equal(BAY_IDS.filter(b => BAY_PLAN[b].loop === side).length, 4)
  assert.deepEqual(GH.plants, { tier: 8, tall: 3 })
})

test('the six controls sit under three steps and start outside their good zones', () => {
  assert.equal(SLIDERS.length, 6)
  assert.deepEqual(STEPS.map(s => s.sliders).flat().sort(), SLIDERS.map(s => s.id).sort())
  assert.equal(STEPS.length, 3)
  for (const s of SLIDERS) {
    assert.ok(s.min < s.good[0] && s.good[0] < s.good[1] && s.good[1] < s.max, `${s.id} zone is inside its range`)
    assert.ok(s.start < s.good[0] || s.start > s.good[1], `${s.id} starts outside its zone`)
  }
  // a drift always pushes the reading out, wherever the control stood in the zone, and can always be corrected
  for (const d of DRIFTS) {
    const s = slider(d.slider)
    assert.ok(Math.abs(d.delta) > s.good[1] - s.good[0], `${d.slider} drift leaves the zone`)
    const fixed = (s.good[0] + s.good[1]) / 2 - d.delta
    assert.ok(fixed >= s.min && fixed <= s.max, `${d.slider} drift can be corrected`)
  }
})

// ------------------------------------------------------------------ G1
test('G1: the test starts only when all three steps are set', () => {
  const g = quiet()
  assert.equal(g.phase, 'g1-setup')
  assert.ok(!g.attempted)
  assert.match(g.startTest()!, /step 1/i)
  g.setSlider('light', 60)
  assert.ok(g.stepOk(1))
  assert.match(g.startTest()!, /step 2/i)
  for (const id of ['temp', 'humidity', 'co2'] as SliderId[]) g.setSlider(id, mid(id))
  assert.match(g.startTest()!, /step 3/i)
  for (const id of ['water', 'nutrients'] as SliderId[]) g.setSlider(id, mid(id))
  assert.equal(g.startTest(), null)
  assert.equal(g.phase, 'g1-test')
  assert.ok(g.attempted)
})

test('G1: healthy plants inside the power budget pass after 10 seconds', () => {
  const g = quiet()
  setUp(g)
  assert.ok(!g.overBudget)
  g.startTest()
  run(g, GH.testSeconds - 0.5)
  assert.equal(g.phase, 'g1-test')
  assert.equal(g.testDay, GH.testDays)
  run(g, 1)
  assert.equal(g.phase, 'g1-result')
  assert.ok(g.testResult!.won)
  assert.equal(g.testResult!.minHealth, 100)
  assert.equal(g.score().parts[0].points, GH.points.g1)
})

test('G1: the plants change the room, and a player who corrects the controls still passes', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const g = new Greenhouse({ seed })
    setUp(g)
    g.startTest()
    assert.equal(g.test!.drifts.length, 2)
    assert.notEqual(g.test!.drifts[0].slider, g.test!.drifts[1].slider)
    // a slow player: looks at the sensors once a second
    let n = 0
    run(g, GH.testSeconds + 1, x => { if (++n % 20 === 0) correct(x) })
    assert.ok(g.testResult!.won, `seed ${seed}: ${g.testResult!.reason}`)
    assert.ok(g.testResult!.minHealth < 100, 'the drifts cost some health')
    const pts = g.score().parts[0].points
    assert.ok(pts >= 0.6 * GH.points.g1 && pts < GH.points.g1)
  }
})

test('G1: ignoring the sensors fails the test, and the reason names the cause', () => {
  const g = new Greenhouse({ seed: 3 })
  setUp(g)
  g.startTest()
  const first = g.test!.drifts[0]
  run(g, GH.testSeconds + 1)
  const r = g.testResult!
  assert.ok(!r.won)
  assert.equal(r.cause, 'health')
  assert.ok(r.day < GH.testDays, 'the test ends early')
  const s = slider(first.slider)
  assert.ok(r.reason.includes(first.delta > 0 ? s.high : s.low), r.reason)
  assert.equal(g.score().parts[0].points, 0)
  assert.ok(g.takeNotices().some(n => n.kind === 'bad'))
})

test('G1: over-watering is a failure of its own', () => {
  const g = quiet()
  setUp(g)
  g.startTest()
  g.setSlider('water', 90)
  run(g, GH.testSeconds + 1)
  assert.ok(!g.testResult!.won)
  assert.match(g.testResult!.reason, /over-watering/)
})

test('G1: more light costs more power, and an overdraw trips the breaker', () => {
  const g = quiet()
  setUp(g)
  const before = g.powerKw
  g.setSlider('light', 80) // still in the good zone for the plants
  assert.ok(g.powerKw > before)
  assert.equal(g.status('light'), 'ok')
  assert.ok(g.overBudget)
  assert.equal(g.startTest(), null)
  run(g, GH.overdrawSeconds - 0.5)
  assert.equal(g.phase, 'g1-test')
  run(g, 1)
  assert.equal(g.testResult!.cause, 'power')
  assert.match(g.testResult!.reason, /overdraw/i)
  assert.equal(g.testResult!.minHealth, 100, 'the plants were healthy: it was the power')
})

test('G1: a result is final, and the controls lock', () => {
  const g = quiet()
  setUp(g)
  g.startTest()
  run(g, GH.testSeconds + 1)
  assert.match(g.startTest()!, /already/)
  assert.match(g.setSlider('light', 10)!, /locked/)
  assert.equal(g.settings.light, mid('light'))
})

// ------------------------------------------------------------------ G2
test('G2 opens after G1 whether the test was passed or failed', () => {
  const lost = quiet()
  setUp(lost)
  lost.startTest()
  lost.setSlider('water', 90)
  run(lost, GH.testSeconds + 1)
  assert.ok(!lost.testResult!.won)
  assert.equal(lost.next(), null)
  assert.equal(lost.phase, 'g2-brief')
  assert.equal(lost.next(), null)
  assert.equal(lost.phase, 'g2-plan')
})

test('G2: pick three crops and plant the bays', () => {
  const g = quiet()
  toPlan(g)
  assert.match(g.cycle('A1')!, /pick/i)
  assert.match(g.startRun()!, /pick 3/i)
  assert.equal(g.togglePick('tomato'), null)
  assert.equal(g.togglePick('lettuce'), null)
  assert.equal(g.togglePick('kale'), null)
  assert.deepEqual(g.picks, ['lettuce', 'kale', 'tomato'], 'kept in table order')
  assert.match(g.togglePick('radish')!, /take one out/i)
  assert.match(g.assign('A1', 'radish')!, /pick that crop/i)
  assert.match(g.startRun()!, /plant at least one bay/i)
  // clicking a bay goes round: empty, each picked crop, empty
  const seen: (CropId | null)[] = []
  for (let i = 0; i < 4; i++) { assert.equal(g.cycle('A1'), null); seen.push(g.plan.A1) }
  assert.deepEqual(seen, ['lettuce', 'kale', 'tomato', null])
  g.assign('A1', 'kale'); g.assign('B2', 'kale'); g.assign('B3', 'tomato')
  assert.equal(g.planted, 3)
  // taking a crop out clears its bays
  assert.equal(g.togglePick('kale'), null)
  assert.equal(g.plan.A1, null)
  assert.equal(g.plan.B3, 'tomato')
  assert.equal(g.planted, 1)
})

test('G2: no single crop feeds the crew, and leafy crops alone never do', () => {
  for (const c of CROPS) {
    const f = forecast(planOf(Array(8).fill(c.id)))
    assert.ok(!f.won, `eight bays of ${c.id} must fail`)
  }
  // too thirsty: the tank runs dry
  assert.equal(forecast(planOf(Array(8).fill('tomato'))).cause, 'water')
  assert.equal(forecast(planOf(Array(8).fill('pepper'))).cause, 'water')
  // too few calories
  assert.equal(forecast(planOf(Array(8).fill('lettuce'))).cause, 'food')
  const leafy: CropId[] = ['lettuce', 'radish', 'mizuna', 'kale']
  for (const a of leafy) for (const b of leafy) assert.ok(!forecast(planOf([a, a, a, a, b, b, b, b])).won, `${a} + ${b}`)
})

test('G2: a mix of a big crop and fast crops wins with room to spare', () => {
  const f = forecast(planOf(GOOD))
  assert.ok(f.won)
  assert.ok(f.kcalHarvested >= NEED_KCAL * 1.2, `margin: ${f.kcalHarvested}`)
  assert.ok(f.waterL > 100)
  assert.equal(f.curve.length, GH.runDays)
  assert.equal(f.curve[GH.runDays - 1], f.kcalHarvested)
  for (let i = 1; i < f.curve.length; i++) assert.ok(f.curve[i] >= f.curve[i - 1], 'food harvested only goes up')
  // radish comes in three times, tomato once
  assert.equal(f.harvests.filter(h => h.crop === 'radish').length, 3)
  assert.equal(f.harvests.filter(h => h.crop === 'tomato').length, 1)
  assert.equal(f.harvests.find(h => h.crop === 'tomato')!.bays, 3)
})

test('G2: the run plays out in 10 seconds with one harvest-all button', () => {
  const g = quiet()
  toPlan(g)
  plant(g, GOOD)
  assert.ok(g.forecast().won)
  assert.equal(g.startRun(), null)
  assert.equal(g.phase, 'g2-run')
  assert.match(g.harvestAll()!, /nothing is ready/i)
  let presses = 0
  // a slow player: presses about a second after something is ready
  let waited = 0
  run(g, GH.runSeconds + 1, x => {
    if (x.phase !== 'g2-run') return
    waited = x.readyBays ? waited + STEP : 0
    if (waited >= 1) { assert.equal(x.harvestAll(), null); presses++; waited = 0 }
  })
  assert.equal(g.phase, 'g2-result')
  const r = g.runResult!
  assert.ok(r.won, r.reason)
  assert.equal(r.fedDays, GH.runDays)
  assert.equal(r.pump, null)
  assert.ok(presses >= 2 && presses <= 5, `${presses} presses`)
  assert.ok(r.kcalHarvested >= NEED_KCAL)
  const s = g.score()
  assert.ok(s.parts[1].points >= 0.6 * GH.points.g2)
  assert.equal(s.parts[2].points, GH.points.pump, 'no pump failed')
  assert.equal(g.next(), null)
  assert.ok(g.finished && g.complete)
  assert.equal(s.total, s.parts.reduce((a, p) => a + p.points, 0))
})

test('G2: a ready bay waits for the harvest, and the last harvest comes in by itself', () => {
  const r = newRun(planOf(['lettuce']))
  while (!r.bays[0].ready) stepRun(r, STEP)
  const t = r.t
  assert.ok(Math.abs(t - crop('lettuce').growDays / 3) < 0.06, `ready after ${t} s`)
  const water = r.waterL
  for (let i = 0; i < 20; i++) stepRun(r, STEP)
  assert.ok(r.bays[0].ready && r.bays[0].progress === 1, 'it waits')
  assert.equal(r.waterL, water, 'a waiting bay drinks nothing')
  assert.equal(r.kcalHarvested, 0)
  assert.equal(collect(r), 1)
  assert.equal(r.kcalHarvested, crop('lettuce').kcal)
  assert.equal(r.bays[0].progress, 0)
  while (!r.over) stepRun(r, STEP)
  // the second harvest ripened before day 30 and was brought in at the end
  assert.equal(r.kcalHarvested, 2 * crop('lettuce').kcal)
  assert.equal(r.over.cause, 'food')
})

test('G2: never pressing harvest all leaves the crew short', () => {
  const g = quiet()
  toPlan(g)
  // six radish bays count on three harvests each; without the button they give one
  plant(g, ['radish', 'radish', 'tomato', 'radish', 'radish', 'radish', 'tomato', 'radish'])
  assert.ok(g.forecast().won, 'the plan itself is good')
  g.startRun()
  run(g, GH.runSeconds + 1)
  const r = g.runResult!
  assert.ok(!r.won)
  assert.equal(r.cause, 'food')
  assert.ok(r.fedDays < GH.runDays)
  assert.match(r.reason, new RegExp(`${r.fedDays} of the ${GH.runDays} days`))
  assert.equal(g.score().parts[1].points, 0)
})

test('G2: too many thirsty bays run the tank dry and end the run early', () => {
  const g = quiet()
  toPlan(g)
  plant(g, ['tomato', 'tomato', 'tomato', 'tomato', 'tomato', 'pepper', 'pepper', 'lettuce'])
  assert.equal(g.forecast().cause, 'water')
  g.startRun()
  run(g, GH.runSeconds + 1, x => { if (x.readyBays) x.harvestAll() })
  const r = g.runResult!
  assert.ok(!r.won)
  assert.equal(r.cause, 'water')
  assert.ok(r.day < GH.runDays)
  assert.equal(r.waterL, 0)
})

test('the repaired water purifier puts more water in the tank', () => {
  const g = quiet()
  assert.equal(g.tankStartL, GH.tankL)
  g.setPurifier(true)
  assert.equal(g.tankStartL, GH.tankL + GH.purifierBonusL)
  toPlan(g)
  plant(g, GOOD)
  g.startRun()
  assert.equal(g.run!.tankL, GH.tankL + GH.purifierBonusL)
})

// ------------------------------------------------------------------ pump failure
test('pump failure: the run waits for the choice, and the other side grows at half speed', () => {
  const g = quiet({ pumpAt: 5 })
  toPlan(g)
  plant(g, GOOD)
  g.startRun()
  run(g, 5.2, x => { if (x.readyBays) x.harvestAll() })
  assert.ok(g.pumpPending)
  assert.ok(g.takeNotices().some(n => /pump failure/i.test(n.text)))
  const t = g.run!.t, day = g.runDay
  run(g, 3)
  assert.equal(g.run!.t, t, 'the 30 days are paused')
  assert.equal(g.runDay, day)
  assert.match(g.harvestAll()!, /choose which side/i)
  assert.equal(g.choosePump('A'), null)
  assert.match(g.choosePump('B')!, /no pump/i)
  for (const b of g.run!.bays) assert.equal(b.speed, b.loop === 'A' ? 1 : GH.slowSpeed)
  run(g, GH.runSeconds, x => { if (x.phase === 'g2-run' && x.readyBays) x.harvestAll() })
  const r = g.runResult!
  assert.equal(r.pump, 'A')
  assert.ok(r.won, 'a plan with room to spare survives a pump failure')
  assert.equal(g.score().parts[2].points, GH.points.pump)
})

test('pump failure: the saved side keeps its harvests, the other side loses one', () => {
  const play = (side: LoopId | null) => {
    const r = newRun(planOf(Array(8).fill('kale')), GH.tankL, side ? 5 : null)
    while (!r.over) {
      if (r.pump.state === 'pending') fitSpare(r, side!)
      collect(r)
      stepRun(r, STEP)
    }
    return r
  }
  const clean = play(null), hit = play('B')
  const count = (r: typeof clean, side: LoopId) => r.bays.filter(b => b.loop === side).reduce((a, b) => a + b.harvests, 0)
  assert.equal(count(clean, 'A'), 8)
  assert.equal(count(hit, 'B'), 8, 'the saved side is untouched')
  assert.equal(count(hit, 'A'), 4, 'the other side misses its second harvest')
  assert.ok(hit.waterL > clean.waterL, 'slower plants drink less')
})

test('pump failure: the dice follow the seed, and about half the runs get one', () => {
  let failures = 0
  for (let seed = 1; seed <= 200; seed++) {
    const g = new Greenhouse({ seed })
    setUp(g); g.startTest(); run(g, GH.testSeconds + 1, correct)
    g.next(); g.next()
    plant(g, GOOD)
    g.startRun()
    const at = g.run!.pump.at
    if (at !== null) { failures++; assert.ok(at >= GH.pumpWindow[0] && at <= GH.pumpWindow[1]) }
    if (seed === 1) {
      const again = new Greenhouse({ seed })
      setUp(again); again.startTest(); run(again, GH.testSeconds + 1, correct)
      again.next(); again.next(); plant(again, GOOD); again.startRun()
      assert.equal(again.run!.pump.at, at, 'the same seed gives the same game')
    }
  }
  assert.ok(failures > 70 && failures < 130, `${failures} of 200`)
})

// ------------------------------------------------------------------ score and the deck
test('the score is 40 + 50 + 10, and a failed mission gives nothing', () => {
  const g = quiet()
  assert.deepEqual(g.score().parts.map(p => p.max), [40, 50, 10])
  assert.equal(g.score().total, 0)
  assert.ok(!g.complete)
  // G1 failed, G2 won: the task still counts as done
  setUp(g); g.startTest(); g.setSlider('nutrients', 0); run(g, GH.testSeconds + 1)
  g.next(); g.next(); plant(g, GOOD); g.startRun()
  run(g, GH.runSeconds + 1, x => { if (x.phase === 'g2-run' && x.readyBays) x.harvestAll() })
  g.next()
  const s = g.score()
  assert.equal(s.parts[0].points, 0)
  assert.ok(s.parts[1].points > 0)
  assert.ok(s.total <= 60)
  assert.ok(g.finished && g.complete)
  assert.match(g.next()!, /nothing to continue/i)

  // both failed: finished, but not done
  const bad = quiet()
  setUp(bad); bad.startTest(); bad.setSlider('nutrients', 0); run(bad, GH.testSeconds + 1)
  bad.next(); bad.next(); plant(bad, Array(8).fill('lettuce')); bad.startRun(); run(bad, GH.runSeconds + 1)
  bad.next()
  assert.ok(bad.finished && !bad.complete)
  assert.equal(bad.score().total, GH.points.pump, 'only the pump points: none failed')
})

test('the bays the deck draws follow the missions', () => {
  const g = quiet()
  // G1: lettuce test trays on A1 and A2
  assert.deepEqual(g.bayViews().filter(b => b.crop).map(b => b.id), ['A1', 'A2'])
  toPlan(g)
  plant(g, GOOD)
  // the plan shows as seed plugs
  for (const b of g.bayViews()) { assert.equal(b.crop, GOOD[BAY_IDS.indexOf(b.id as BayId)]); assert.equal(b.stage, 'seed') }
  g.startRun()
  run(g, 3)
  const radish = g.bayViews().find(b => b.id === 'A1')!
  assert.ok(radish.ready)
  assert.equal(radish.stage, 'ready')
  assert.ok(!g.bayViews().find(b => b.id === 'A3')!.ready, 'the tomato is still growing')
})

test('the greenhouse keeps its own clock: nothing moves until the player starts a mission', () => {
  const g = new Greenhouse({ seed: 9 })
  run(g, 60)
  assert.equal(g.phase, 'g1-setup')
  assert.equal(g.health, 100)
  assert.equal(g.takeNotices().length, 0)
  assert.ok(!g.briefed)
  g.markBriefed()
  assert.ok(g.briefed)
})
