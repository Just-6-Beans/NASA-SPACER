// The launch systems on the launch field: what the game calls NASA data must be exactly what the
// snapshot says, every fact must rest on the words of a NASA source, and the two numbers the
// game takes from it (thrust over weight, launch price) must follow from those words.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { VEHICLES } from '../src/core/ascent'
import { MISSION_BUDGET, SHIPS } from '../src/core/data'
import { ROCKETS, ROCKET_DATA, USD_MILLIONS_PER_CREDIT, rocket, rocketDataLine, rocketSources, rocketStatements, sourceNumbers } from '../src/data/launchVehicles'

const snapshot = JSON.parse(readFileSync(new URL('../data/nasa/launch-vehicles.json', import.meta.url), 'utf8'))
const onNasa = (url: string) => { const u = new URL(url); return u.protocol === 'https:' && /(^|\.)nasa\.gov$/.test(u.hostname) }

test('the snapshot records when it was retrieved, how it was checked, its limits and what is our model', () => {
  assert.match(snapshot.retrieved, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(ROCKET_DATA.retrieved, snapshot.retrieved)
  assert.ok(snapshot.how.includes('exact words'), 'the snapshot says how a fact is tied to its source')
  assert.ok(snapshot.limits.length > 200, 'the limits are written down')
  assert.ok(snapshot.model.startsWith('Our model'), 'the snapshot says what is not NASA data')
  assert.match(rocketDataLine(), /^NASA pages, retrieved \d/)
})

test('the three launch systems are the Space Shuttle, Falcon 9 with Crew Dragon and Atlas V with Starliner', () => {
  assert.deepEqual(ROCKETS.map(r => r.id).sort(), ['atlas-v-n22-starliner', 'falcon-9-crew-dragon', 'space-shuttle'])
  assert.deepEqual(SHIPS.map(s => s.rocket).sort(), ROCKETS.map(r => r.id).sort(), 'each choice on the launch field is one of them')
  assert.deepEqual(SHIPS.map(s => s.id), ['shuttle', 'falcon9', 'atlasv'], 'in the order they first flew crews to the station')
  for (const s of SHIPS) assert.equal(rocket(s.rocket).name, s.name, 'the game uses the snapshot\'s name')
  assert.throws(() => rocket('saturn-v' as never), /Unknown launch system/)
})

test('every fact rests on the exact words of a NASA source', () => {
  for (const r of ROCKETS) {
    const quotes = rocketStatements(r)
    assert.ok(quotes.length >= 12, `${r.id} has ${quotes.length} quotes`)
    for (const b of quotes) {
      assert.ok(b.quote.length >= 15, `${r.id}: a quote is too short to mean anything: "${b.quote}"`)
      assert.ok(onNasa(b.source.url), `${r.id}: ${b.source.url} is not a NASA page`)
      assert.ok(b.source.title && b.source.provider.includes('NASA'), `${r.id}: a source has no title or provider`)
      assert.ok(b.checked === 'by script' || b.checked === 'by hand')
    }
    for (const line of r.brief) assert.ok(line.backing.length > 0 && line.text && line.label, `${r.id}: "${line.label}" has no quote behind it`)
    for (const n of r.numbers) {
      // the one honest gap: a tile may say that NASA gives no figure, and then it cites nothing
      if (n.backing.length === 0) assert.match(n.value, /not given by NASA/, `${r.id}: "${n.label}" has no quote behind it`)
    }
    assert.ok(r.brief.length >= 3 && r.brief.length <= 5, `${r.id}: the "?" card stays short`)
    assert.equal(r.numbers.length, 6, `${r.id}: six tiles`)
    for (const line of r.brief) assert.ok(line.text.length <= 170, `${r.id}: "${line.label}" is too long for a compact card (${line.text.length})`)
  }
})

test('sources are numbered once each, in the order the facts cite them', () => {
  for (const r of ROCKETS) {
    const sources = rocketSources(r)
    assert.equal(new Set(sources.map(s => s.url)).size, sources.length)
    for (const fact of [...r.brief, ...r.numbers]) {
      const n = sourceNumbers(r, fact)
      assert.deepEqual(n, [...new Set(n)].sort((a, b) => a - b))
      for (const i of n) assert.ok(i >= 1 && i <= sources.length)
      assert.equal(n.length, new Set(fact.backing.map(b => b.source.url)).size)
    }
  }
})

test('the years on the launch field follow from the dated flights', () => {
  const year = (value: string) => /\b(19|20)\d{2}\b/.exec(value)![0]
  for (const r of ROCKETS) {
    assert.ok(r.years.startsWith(year(r.first.value)), `${r.id}: ${r.years} does not start in ${r.first.value}`)
    assert.ok(r.first.backing.some(b => b.quote.includes(year(r.first.value))), `${r.id}: no quote names the first year`)
    if (r.last) {
      assert.ok(r.years.endsWith(year(r.last.value)), `${r.id}: ${r.years} does not end in ${r.last.value}`)
      assert.ok(r.last.backing.some(b => b.quote.includes(year(r.last!.value))), `${r.id}: no quote names the last year`)
    } else assert.ok(r.years.endsWith('to now'), `${r.id} is still flying crews`)
  }
})

test('thrust over weight is NASA\'s two figures divided, and the ascent starts from it', () => {
  const shuttle = rocket('space-shuttle').liftoff!, falcon = rocket('falcon-9-crew-dragon').liftoff!
  assert.ok(shuttle.backing.some(b => b.quote.includes('6.8 million pounds of thrust') && b.quote.includes('4.5-million-pound')))
  assert.deepEqual([shuttle.thrustLbf, shuttle.weightLb], [6_800_000, 4_500_000])
  assert.ok(falcon.backing.some(b => b.quote.includes('more than 1.7 million pounds of thrust at sea level')))
  assert.ok(falcon.backing.some(b => b.quote.includes('1,207,920 pounds')))
  assert.deepEqual([falcon.thrustLbf, falcon.weightLb], [1_700_000, 1_207_920])
  for (const s of SHIPS) {
    const l = rocket(s.rocket).liftoff
    if (!l) continue
    assert.equal(l.twr, Math.round((l.thrustLbf / l.weightLb) * 100) / 100)
    assert.equal(VEHICLES[s.id].twr, l.twr, `${s.id}: the ascent model uses NASA's ratio`)
    assert.ok(l.note.length > 20, 'what the figure covers is written down')
  }
  assert.equal(VEHICLES.shuttle.twr, 1.51)
  assert.equal(VEHICLES.falcon9.twr, 1.41)
  // NASA gives no lift-off weight for the Atlas V with Starliner: the snapshot says so and the game's figure is its own
  assert.equal(rocket('atlas-v-n22-starliner').liftoff, null)
  assert.ok(rocket('atlas-v-n22-starliner').numbers.some(n => n.label === 'Lift-off weight' && n.value === 'not given by NASA'))
  assert.ok(snapshot.model.includes('our own estimate for the Atlas V'))
})

test('launch prices are NASA\'s cost figures at one credit for each ten million dollars', () => {
  for (const s of SHIPS) {
    const c = rocket(s.rocket).cost
    assert.equal(s.launchCost * USD_MILLIONS_PER_CREDIT, c.usdMillions, `${s.id}: ${s.launchCost} cr against $${c.usdMillions} million`)
    assert.equal(s.budget, MISSION_BUDGET - s.launchCost, `${s.id}: what is left after the launch`)
    if (c.perSeatUsdMillions) {
      assert.equal(c.perSeatUsdMillions * c.seats!, c.usdMillions)
      assert.ok(c.backing.some(b => b.quote.includes('four astronauts per flight') && b.quote.includes(`$${c.perSeatUsdMillions} million`)), `${s.id}: the seat price is not in the quote`)
    } else assert.ok(c.backing.some(b => b.quote.includes(`$${c.usdMillions} million per mission`)), `${s.id}: the price is not in the quote`)
    assert.ok(c.basis.length > 20)
  }
  const cost = (id: 'shuttle' | 'falcon9' | 'atlasv') => SHIPS.find(s => s.id === id)!.launchCost
  assert.ok(cost('falcon9') < cost('atlasv') && cost('atlasv') < cost('shuttle'), 'Falcon 9 is the cheapest, the Shuttle the dearest')
})

test('where NASA\'s pages disagree with a figure the game uses, the snapshot says so and quotes the other page', () => {
  assert.ok(ROCKET_DATA.disagreements.length >= 2)
  for (const d of ROCKET_DATA.disagreements) {
    assert.ok(ROCKETS.some(r => r.id === d.about))
    assert.ok(d.text.length > 40 && d.backing.length > 0)
    for (const b of d.backing) assert.ok(onNasa(b.source.url) && b.quote.length > 20)
  }
  assert.ok(ROCKET_DATA.disagreements.some(d => d.backing.some(b => b.quote.includes('7.8 million pounds'))), 'the other Shuttle thrust figure')
  assert.ok(ROCKET_DATA.disagreements.some(d => d.backing.some(b => b.quote.includes('$775 million'))), 'the other Shuttle cost figure')
})

test('the snapshot carries nothing but the three systems and words about them', () => {
  // no leftovers from an earlier build, and no NASA insignia or imagery referenced anywhere
  const text = JSON.stringify(snapshot)
  for (const gone of ['Delta II', 'Agena', 'Atlas V 541', 'PENDING', 'PROVISIONAL']) assert.ok(!text.includes(gone), `"${gone}" is still in the snapshot`)
  assert.ok(!/\.(png|jpe?g|svg|gif)\b/i.test(text), 'the snapshot holds no image')
})
