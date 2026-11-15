// Shared by the test files: getting a mission past the station's main missions and its alerts,
// which the rover waits for.
import assert from 'node:assert/strict'
import type { Mission } from '../src/core/mission'
import type { Activity } from '../src/core/stationTasks'

/** A day that meets every need: 8 h of sleep, 8 h of work, 2 h of exercise, 6 h of meals and rest. */
export const GOOD_DAY: Activity[] = ['sleep', 'sleep', 'sleep', 'sleep', 'work', 'work', 'exercise', 'rest', 'work', 'work', 'rest', 'rest']

/** Deals with every alert of this run, so the rover is not held up by one. */
export function clearAlerts(m: Mission) {
  for (const id of m.alertPlan) {
    if (m.alertResults[id]) continue
    assert.equal(m.startAlert(id), null)
    assert.ok(m.endAlert(id, true, 80, 'test'))
  }
}

/**
 * The station's main missions besides the payload and the relay: the crew's day and the water
 * loop, then the alerts. `water`: the loop is run on a fresh filter bed and meets its target;
 * otherwise it is run on the old bed, which adds nothing to the base score.
 */
export function stationReady(m: Mission, water = false) {
  assert.equal(m.planDay(GOOD_DAY), null)
  if (water) m.complete('water', 'test')
  else assert.equal(m.runWaterLoop(false), null)
  clearAlerts(m)
}
