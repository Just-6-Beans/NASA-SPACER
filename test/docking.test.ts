// The docking film's staging (src/ui/scene/docking.ts): the spacecraft only ever closes, the rings
// touch when the film says they do, the hatch stays shut until then, and the film ends in the light.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SHIPS } from '../src/core/data'
import { CONTACT, CUT, DOCK_SECONDS, FRAMING, HATCH, dockShot } from '../src/ui/scene/docking'

const at = (t: number, ship = SHIPS[0].id, aspect = 1.6) => dockShot(t, FRAMING[ship], aspect)

test('every launch system has its framing for the film', () => {
  for (const ship of SHIPS) assert.ok(FRAMING[ship.id], ship.id)
})

test('the film is 8 to 12 seconds long', () => {
  assert.ok(DOCK_SECONDS >= 8 && DOCK_SECONDS <= 12)
})

test('the spacecraft closes all the way and never backs off', () => {
  let last = Infinity
  for (let t = 0; t <= DOCK_SECONDS; t += 0.05) {
    const gap = at(t).gap
    assert.ok(gap <= last + 1e-9, `gap grows at ${t.toFixed(2)} s`)
    last = gap
  }
  assert.ok(at(0).gap > 15)
  assert.equal(at(CONTACT).gap, 0)
  assert.equal(at(DOCK_SECONDS).gap, 0)
})

test('it slows as it closes: the last metre takes longer than the first', () => {
  const timeAt = (gap: number) => { for (let t = 0; t <= CONTACT; t += 0.01) if (at(t).gap <= gap) return t; return CONTACT }
  const first = timeAt(at(0).gap - 1), last = CONTACT - timeAt(1)
  assert.ok(last > first * 3, `first metre ${first.toFixed(2)} s, last metre ${last.toFixed(2)} s`)
})

test('the outside view comes first, then the docking camera, and the change is hidden in a dip to black', () => {
  assert.equal(at(CUT - 0.5).view, 'outside')
  assert.equal(at(CUT + 0.5).view, 'nose')
  assert.ok(at(CUT - 0.001).black > 0.99 && at(CUT).black > 0.99)
  assert.equal(at(CUT - 1).black, 0)
  assert.equal(at(CUT + 1).black, 0)
  assert.equal(at(0).black, 1) // it opens out of black
})

test('the hatch stays shut until the rings have met, then opens, and the film ends in its light', () => {
  for (let t = 0; t <= HATCH; t += 0.1) assert.equal(at(t).hatch, 0, `hatch moves at ${t.toFixed(1)} s`)
  assert.ok(CONTACT < HATCH)
  assert.equal(at(DOCK_SECONDS).hatch, 1)
  assert.equal(at(HATCH).white, 0)
  assert.equal(at(DOCK_SECONDS).white, 1)
  assert.equal(at(DOCK_SECONDS).beat, 'hatch')
})

test('the outside camera keeps the spacecraft and the docking ring in the picture on a wide or a tall screen', () => {
  for (const ship of SHIPS) for (const aspect of [0.5, 1, 1.6, 2.4]) for (const t of [0.5, 2.5, 4.5]) {
    const s = at(t, ship.id, aspect), f = FRAMING[ship.id]
    const fwd = [s.target[0] - s.eye[0], s.target[1] - s.eye[1], s.target[2] - s.eye[2]]
    const len = Math.hypot(fwd[0], fwd[1], fwd[2])
    // angle off the camera's line of sight to the docking ring and to the spacecraft's far end
    for (const p of [[0, 0, 0], [-s.gap - f.reach, 0, 0]]) {
      const d = [p[0] - s.eye[0], p[1] - s.eye[1], p[2] - s.eye[2]]
      const cos = (d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]) / (len * Math.hypot(d[0], d[1], d[2]))
      const half = Math.atan(Math.tan(s.fov / 2) * Math.max(1, aspect))
      assert.ok(Math.acos(cos) < half, `${ship.id} at ${t} s, aspect ${aspect}: ${(Math.acos(cos) * 57.3).toFixed(0)} deg off, half view ${(half * 57.3).toFixed(0)} deg`)
    }
  }
})
