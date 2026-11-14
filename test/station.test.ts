// Station geometry. The art, the collision boxes and the terminals all come from
// src/art/geo.json; these checks keep the deck playable when someone moves a console.
import test from 'node:test'
import assert from 'node:assert/strict'
import { WORLD } from '../src/core/protocol'
import { BUSES, CONDUITS, DECK, MODULES, PROPS, REACH, SOLIDS, SPAWN, TERMINALS, WINDOWS, solid } from '../src/game/deck'
import { findPath, pathLength, walkable } from '../src/game/nav'

const inside = ([x, y, w, h]: number[], px: number, py: number) => px >= x && px <= x + w && py >= y && py <= y + h

test('the deck is the size the co-op protocol validates poses against', () => {
  assert.equal(DECK.width, WORLD.width)
  assert.equal(DECK.height, WORLD.height)
})

test('the airlock spawn is open floor, with room for a crewmate on either side', () => {
  // the co-op server moves a second astronaut 70 px left or right of the first
  for (const dx of [0, -70, 70]) assert.ok(walkable(SPAWN[0] + dx, SPAWN[1]), `open floor at spawn ${dx >= 0 ? '+' : ''}${dx}`)
  for (const t of TERMINALS) assert.ok(Math.hypot(t.at[0] - SPAWN[0], t.at[1] - SPAWN[1]) > REACH, `${t.id} is not in reach on arrival`)
})

test('every terminal has a console, stands on open floor, and can be walked to from the airlock', () => {
  assert.deepEqual(TERMINALS.map(t => t.id).sort(), ['calibration', 'comms', 'hab', 'ops', 'payload', 'power'])
  for (const t of TERMINALS) {
    const box = SOLIDS.find(s => s.id === t.id)
    assert.ok(box, `${t.id} has a collision box`)
    assert.ok(walkable(t.at[0], t.at[1]), `${t.id} terminal is on open floor`)
    const [x, y, w, h] = box.rect
    const gap = Math.hypot(Math.max(x - t.at[0], 0, t.at[0] - x - w), Math.max(y - t.at[1], 0, t.at[1] - y - h))
    assert.ok(gap < REACH / 2, `${t.id} terminal is next to its console`)
    const path = findPath(SPAWN, t.at)
    assert.ok(path && pathLength(path) > 0, `${t.id} is reachable from the airlock`)
  }
})

test('terminals are far enough apart that the nearest one is never in doubt', () => {
  for (const a of TERMINALS) for (const b of TERMINALS) {
    if (a.id < b.id) assert.ok(Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) > REACH * 2, `${a.id} and ${b.id}`)
  }
})

test('nodes, windows and props sit inside the hull', () => {
  assert.equal(MODULES.length, 3)
  for (const [x, y, w, h] of WINDOWS) assert.ok(x > 40 && x + w < DECK.width - 40 && y > 0 && y + h < DECK.wallY, 'window is in the back wall')
  for (const p of PROPS) assert.ok(p.at[0] >= 0 && p.at[1] >= 0 && p.at[0] + p.size[0] <= DECK.width && p.at[1] + p.size[1] <= DECK.height, `prop ${p.id}`)
  // both hatches are wide enough to walk through
  assert.ok(findPath([200, 400], [580, 400]) && findPath([580, 400], [960, 400]))
})

test('each power bus runs from the Power Grid console to the system it feeds', () => {
  const ends = { life: 'hab', comms: 'comms', research: 'calibration' } as const
  for (const bus of BUSES) {
    const pts = CONDUITS[bus], first = pts[0], last = pts[pts.length - 1]
    const grow = (r: number[]) => [r[0] - 8, r[1] - 8, r[2] + 16, r[3] + 16]
    assert.ok(inside(grow(solid('power')), first[0], first[1]), `${bus} bus starts at the Power Grid`)
    assert.ok(inside(grow(solid(ends[bus])), last[0], last[1]), `${bus} bus ends at ${ends[bus]}`)
    for (let i = 1; i < pts.length; i++) assert.ok(pts[i][0] === pts[i - 1][0] || pts[i][1] === pts[i - 1][1], `${bus} bus runs along the deck plates`)
  }
})
