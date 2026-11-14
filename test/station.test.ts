// Station geometry. The art, the collision boxes and the terminals all come from
// src/art/geo.json (written by scripts/build-geo.mjs); these checks keep the deck playable when
// someone moves a module, a console or a greenhouse rack.
import test from 'node:test'
import assert from 'node:assert/strict'
import { BAY_IDS, BAY_PLAN, GH } from '../src/core/greenhouse'
import { WORLD } from '../src/core/protocol'
import { BAYS, BUSES, CONDUITS, DECK, LINKS, MODULES, PROPS, REACH, SOLIDS, SPAWN, TERMINALS, WINDOWS, inGreenhouse, inRect, moduleAt, moduleById, reachOf, solid, terminal } from '../src/game/deck'
import { findPath, pathLength, reachableFrom, walkable } from '../src/game/nav'

const centre = ([x, y, w, h]: number[]): [number, number] => [x + w / 2, y + h / 2]

test('the deck is the size the co-op protocol validates poses against', () => {
  assert.equal(DECK.width, WORLD.width)
  assert.equal(DECK.height, WORLD.height)
  assert.deepEqual(SPAWN, [WORLD.spawnX, WORLD.spawnY])
})

test('the docking port spawn is open floor, with room for a crewmate on either side', () => {
  // the co-op server moves a second astronaut 70 px left or right of the first
  for (const dx of [0, -70, 70]) assert.ok(walkable(SPAWN[0] + dx, SPAWN[1]), `open floor at spawn ${dx >= 0 ? '+' : ''}${dx}`)
  assert.equal(moduleAt(SPAWN[0], SPAWN[1]).id, 'dock')
  for (const t of TERMINALS) assert.ok(Math.hypot(t.at[0] - SPAWN[0], t.at[1] - SPAWN[1]) > REACH, `${t.id} is not in reach on arrival`)
})

test('the station is eight modules joined into one walkable deck', () => {
  assert.deepEqual(MODULES.map(m => m.id).sort(), ['comms', 'cupola', 'dock', 'greenhouse', 'lab', 'node1', 'node2', 'node3'])
  for (const m of MODULES) {
    assert.ok(m.x >= 0 && m.y >= 0 && m.x + m.w <= DECK.width && m.y + m.h <= DECK.height, `${m.id} is inside the world`)
    const c = centre(m.floor)
    const path = findPath(SPAWN, c)
    assert.ok(path && pathLength(path) >= 0, `${m.id} can be walked to from the docking port`)
    assert.equal(moduleAt(c[0], c[1]).id, m.id)
  }
  // modules do not overlap
  for (const a of MODULES) for (const b of MODULES) {
    if (a.id < b.id) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} and ${b.id} overlap`)
  }
  // every hatch and tunnel can be walked through, end to end
  for (const l of LINKS) {
    const [x, y, w, h] = l.rect
    const ends: [number, number][] = l.kind === 'hatch' ? [[x - 30, y + h / 2], [x + w + 30, y + h / 2]] : [[x + w / 2, y - 30], [x + w / 2, y + h + 30]]
    assert.ok(walkable(...ends[0]) && walkable(...ends[1]), `${l.id} opens onto floor at both ends`)
    const path = findPath(ends[0], ends[1])
    assert.ok(path && pathLength(path) < (l.kind === 'hatch' ? w : h) + 120, `${l.id} is a straight walk`)
  }
})

test('nobody can walk out into space', () => {
  // every cell the crew can reach must be on a module floor or inside a hatch or tunnel
  const reach = reachableFrom(SPAWN)
  let cells = 0
  for (let y = 5; y < DECK.height; y += 10) for (let x = 5; x < DECK.width; x += 10) {
    if (!reach(x, y)) continue
    cells++
    assert.ok(MODULES.some(m => inRect(m.floor, x, y)) || LINKS.some(l => inRect(l.rect, x, y, 2)), `the crew can reach ${x}, ${y}, which is outside every module and link`)
  }
  assert.ok(cells > 5000, 'the flood fill covered the station')
  assert.ok(!reach(5, 5) && !reach(1250, 300), 'open space is out of reach')
})

test('every terminal has a console, stands on open floor, and can be walked to from the docking port', () => {
  const ids = TERMINALS.map(t => t.id).sort()
  assert.deepEqual(ids, [...BAY_IDS.map(b => `bay-${b}`), 'calibration', 'comms', 'gh-control', 'gh-prep', 'gh-service', 'hab', 'ops', 'payload', 'power'].sort())
  for (const t of TERMINALS) {
    const box = SOLIDS.find(s => s.id === t.id)
    assert.ok(box, `${t.id} has a collision box`)
    assert.ok(walkable(t.at[0], t.at[1]), `${t.id} terminal is on open floor`)
    const [x, y, w, h] = box.rect
    const gap = Math.hypot(Math.max(x - t.at[0], 0, t.at[0] - x - w), Math.max(y - t.at[1], 0, t.at[1] - y - h))
    assert.ok(gap < REACH / 2, `${t.id} terminal is next to its console`)
    const path = findPath(SPAWN, t.at)
    assert.ok(path && pathLength(path) > 0, `${t.id} is reachable from the docking port`)
  }
})

test('terminals are far enough apart that the nearest one is never in doubt', () => {
  for (const a of TERMINALS) for (const b of TERMINALS) {
    if (a.id < b.id) assert.ok(Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) > reachOf(a) + reachOf(b), `${a.id} and ${b.id}`)
  }
})

test('windows are in a back wall and props are inside the world', () => {
  for (const w of WINDOWS) {
    const m = moduleById(w.module), [x, y, ww, h] = w.rect
    assert.ok(x > m.x + DECK.wall && x + ww < m.x + m.w - DECK.wall && y > m.y && y + h < m.y + m.wallH, `window in the ${m.id} back wall`)
  }
  for (const p of PROPS) assert.ok(p.at[0] >= 0 && p.at[1] >= 0 && p.at[0] + p.size[0] <= DECK.width && p.at[1] + p.size[1] <= DECK.height, `prop ${p.id}`)
  for (const s of SOLIDS) assert.ok(s.rect[0] >= 0 && s.rect[1] >= 0 && s.rect[0] + s.rect[2] <= DECK.width && s.rect[1] + s.rect[3] <= DECK.height, `solid ${s.id}`)
})

test('each power bus runs from the Power Grid console to the system it feeds', () => {
  const ends = { life: 'hab', comms: 'comms', research: 'calibration' } as const
  for (const bus of BUSES) {
    const pts = CONDUITS[bus], first = pts[0], last = pts[pts.length - 1]
    const grow = (r: number[]) => [r[0] - 8, r[1] - 8, r[2] + 16, r[3] + 16]
    assert.ok(inRect(grow(solid('power')), first[0], first[1]), `${bus} bus starts at the Power Grid`)
    assert.ok(inRect(grow(solid(ends[bus])), last[0], last[1]), `${bus} bus ends at ${ends[bus]}`)
    for (let i = 1; i < pts.length; i++) assert.ok(pts[i][0] === pts[i - 1][0] || pts[i][1] === pts[i - 1][1], `${bus} bus runs along the deck plates`)
    // a bus runs under the floor of a module or a link, never through open space
    for (const [x, y] of pts) assert.ok(MODULES.some(m => inRect([m.x, m.y, m.w, m.h], x, y)) || LINKS.some(l => inRect(l.rect, x, y, 2)), `${bus} bus point ${x}, ${y}`)
  }
})

test('the greenhouse racks match the bays the rules know', () => {
  const gh = moduleById('greenhouse')
  assert.deepEqual(BAYS.map(b => b.id), BAY_IDS)
  for (const b of BAYS) {
    const plan = BAY_PLAN[b.id]
    assert.equal(b.kind, plan.kind, `${b.id} kind`)
    assert.equal(b.loop, plan.loop, `${b.id} loop`)
    assert.equal(b.shelves.length * b.slots.length, GH.plants[b.kind], `${b.id} holds the plants the rules count`)
    const [x, y, w, h] = b.box
    assert.ok(x >= gh.floor[0] && x + w <= gh.floor[0] + gh.floor[2] && y >= gh.y && y + h <= gh.floor[1] + gh.floor[3], `${b.id} rack is inside the module`)
    for (const s of b.slots) assert.ok(s > x && s < x + w, `${b.id} plant stands on its rack`)
    for (const s of b.shelves) assert.ok(s > y && s < y + h, `${b.id} shelf is inside its rack`)
    const t = terminal(`bay-${b.id}`)
    assert.ok(inGreenhouse(t.at[0], t.at[1]), `${b.id} is worked from inside the greenhouse`)
    assert.ok(Math.abs(t.at[0] - (x + w / 2)) < 2, `${b.id} is worked from in front of the rack`)
  }
  // both walkways run the length of the module, so every bay has a way out
  assert.ok(findPath(terminal('gh-control').at, terminal('gh-service').at))
  assert.ok(!inGreenhouse(SPAWN[0], SPAWN[1]))
})
