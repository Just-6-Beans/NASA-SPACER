// The mission brief in about a hundred words: the goal, the four decisions, and the three things
// that decide the outcome. Shown before the spacecraft is chosen and again at the Mission Ops
// table. The long version of the rules sits behind a disclosure, for players who want it.
import { DUST_DEADLINE, PREP_HOURS, RESERVE_FLOOR, STRONG_LOW_END } from '../core/data'
import { ICONS } from './icons'

export function briefCore(): string {
  return `<div class="brief-goal"><h3>Your mission</h3>
      <p>Find out whether there is enough water ice at <b>Ares Shelf</b> on Mars to build a habitat, then decide where the crew lands. You command a rover from orbit, and every signal takes minutes to cross.</p></div>
    <h3 class="brief-h">Four decisions, each with a cost</h3>
    <ol class="brief-steps">
      <li><b>Design</b><span>A spacecraft and one rover instrument.</span></li>
      <li><b>Prepare</b><span>Station power, and ${PREP_HOURS} crew-hours for more tasks than fit.</span></li>
      <li><b>Operate</b><span>One rover pass: a date, a route and a scan. It is sent once.</span></li>
      <li><b>Decide</b><span>A landing site, or wait in orbit.</span></li>
    </ol>
    <h3 class="brief-h">Three things decide the outcome</h3>
    <div class="brief-three">
      <div>${ICONS.clock}<b>Clock</b><span>The rover's last signal must arrive before the dust front at T+${DUST_DEADLINE}.</span></div>
      <div>${ICONS.rover}<b>Battery</b><span>The rover must get home above its ${RESERVE_FLOOR}% reserve.</span></div>
      <div>${ICONS.snow}<b>Evidence</b><span>The ice reading comes as a range. Its low end must reach ${STRONG_LOW_END}%.</span></div>
    </div>`
}

/** The complete success rules, for the disclosure under the short brief. */
export function briefRules(): string {
  return `<p>The mission is complete with an <b>approved landing</b> and the <b>habitat commissioned</b>. The habitat needs a crew medical check, which takes one of your crew-hours.</p>
    <p><b>Ares Shelf</b> is open only until the dust front at T+${DUST_DEADLINE}, and only if the rover is back at base. It then needs an ice reading whose low end is at least ${STRONG_LOW_END}%, or imported water you can still afford.</p>
    <p><b>Eos Hollow</b> has no deadline, but the rover must come home with battery to spare for a slope survey, and the site needs a power kit. <b>Meridian Plain</b> is always open and always needs imported water and a power kit.</p>
    <p>Deferring the landing keeps the crew safe in orbit. It is a valid call, but the mission is not complete.</p>`
}

export const BRIEF_DATA_LINE = '<span class="tag real">NASA data</span>The signal delay (JPL Horizons) and the Mars night cold (Curiosity REMS, Gale Crater) are real measurements. <span class="tag model">Our model</span>Everything else is simulated, and the game says so.'
