// The five phases of one mission, and the rail that shows the player which one they are in.
// Every screen from the brief to the debrief carries the same rail, so the mission has a spine.
import type { Mission } from '../core/mission'

export type Phase = 'design' | 'prepare' | 'operate' | 'decide' | 'debrief'

const PHASES: [Phase, string, string][] = [
  ['design', 'Design', 'Spacecraft and rover instrument'],
  ['prepare', 'Prepare', 'Power, crew-hours and the rover plan'],
  ['operate', 'Operate', 'The rover pass, across the signal delay'],
  ['decide', 'Decide', 'The landing site'],
  ['debrief', 'Debrief', 'Which choices caused the outcome'],
]

/** Where a mission stands. No mission yet (title, fleet, crew) is still Design. */
export const phaseOf = (m: Mission | null): Phase =>
  !m || !m.payloadActive ? 'design' : !m.pass ? 'prepare' : !m.passDone ? 'operate' : !m.landing ? 'decide' : 'debrief'

export function phaseRail(now: Phase): string {
  const at = PHASES.findIndex(p => p[0] === now)
  return `<ol class="phases" aria-label="Mission phases">${PHASES.map(([id, name, what], i) =>
    `<li class="${i < at ? 'done' : i === at ? 'now' : ''}" title="${what}"${i === at ? ' aria-current="step"' : ''}><i>${i < at ? '✓' : i + 1}</i><span>${name}</span></li>`).join('')}</ol>`
}

export const phaseName = (p: Phase) => PHASES.find(x => x[0] === p)![1]
