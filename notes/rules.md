# Lane notes: rules

Device / person: aizux7's device (Claude Code)
Branch: `lane/rules`

Only the rules lane edits this file. Everyone reads it.

## Done

**Rover design and procedure revised, 14 November 2026.** Committed on `lane/rules`, not yet on `main`.

- The planner is three steps: operations date, route, scan. The pass is always Drive → Scan → Return, so the hand-built command queue is gone.
- Two NASA datasets now drive the pass, one number each:
  - **JPL Horizons**: the one-way light time on the operations date is the signal delay. It replaces the invented `Ship.relayMin`.
  - **Curiosity REMS, Gale Crater**: the night low of one sol sets a heater draw taken before the pass starts. The formula is our model: 1 battery point per °C below −65 °C.
- Three dates on offer, built from the snapshots by `scripts/build-ops-dates.mjs`:

  | Date | Light time | Night low | REMS sol | Heater draw |
  |---|---:|---:|---|---:|
  | 30 Mar 2029 | 5.4 min | −79 °C | 4580 (25 Jun 2025) | 14 pts |
  | 15 Jul 2029 | 10.4 min | −74 °C | 4685 (10 Oct 2025) | 9 pts |
  | 15 Nov 2029 | 15.8 min | −66 °C | 4804 (10 Feb 2026) | 1 pt |

  REMS has nothing for 2029, so each date borrows the sol two Mars years earlier (same season). The game says this stand-in is our model.
- Rules that changed (all in `src/core/data.ts`): signal leg = light time + relay hand-off (3 min, Vector 2 min; none at Communications 5 or more); dust front T+54 → T+56; Basin shortcut 36 → 29 pts per leg; GPR quick scan 14 → 18 pts; research filter −4 → −5.
- New rule: a rover that stops in safe mode holds any Ares Shelf landing. Before, stranding the rover ended the pass early and made the dust deadline easier to meet.
- Debrief: `Mission.causes` returns three causes for the rover pass (clock, battery, evidence), each with the choices and numbers behind it. The report shows them under "What decided the rover pass".
- Tests: `test/mission.test.ts` has the four acceptance scenarios from the README and a test that plays every ship, instrument, date and plan to prove that no date and no design wins everywhere. `test/data.test.ts` checks the game's numbers against the snapshots. `npm run check` passes (20 tests).
- Checked in the real UI with headless Edge, on the dev server and on the production build: scenario 1 (clears Ares Shelf), scenario 3 (stranded rover, shelf held), scenario 4 (radar on 15 Nov 2029), at 1440×900 and 390×844.

**Edits in other lanes' files**, made with a human's yes (aizux7, 14 November 2026):

- Data lane: copied `scripts/fetch-nasa-data.mjs` and both snapshots from the original repo unchanged, which is step 0 of your Next list. Added `scripts/build-ops-dates.mjs`, `data/nasa/ops-dates.json`, `src/data/opsDates.ts`, the `data` and `data:ops` npm scripts, and the data section of `CREDITS.md`.
- Experience lane: rewrote `src/ui/roverView.ts` and added `src/rover.css` (imported by `roverView.ts`). Small edits in `src/ui/panels.ts` (two effect lines on the power tab, the rover tab text), `src/ui/report.ts` (operations date row, the causes box) and `src/ui/intro.ts` (three one-line edits).

**Exports that changed.** If your code calls one of these, it needs the new form:

- `Ship.relayMin` is now `Ship.handoffMin`.
- `signalLeg(lightMin, handoffMin, power)` takes the light time first.
- `PlanSnapshot` has `date`, `lightMin`, `nightLowC`, `handoffMin`; it no longer has `relayMin` or `queue`.
- `Mission.queue`, `queueError` and `COMMAND_ORDER` are gone. `SEQUENCE` holds the fixed command order.
- New: `Mission.opsDate`, `Mission.ops`, `Mission.setOpsDate()`, `Mission.causes`, `heaterDraw()`, `passCauses()`, `fmtTemp()`, and `PassResult.heaterDraw`, `wakeBattery`, `shortfall`.

## Now

- (nothing claimed)

## Next

1. Extend the cause list from the rover pass to the whole mission: budget and landing choices.
2. Retune costs and timers for a 10 to 20 minute mission once a human has timed a playthrough.
3. Use RAD surface dose as a limit on surface time, after the data lane fetches it.

## Asks for other lanes

- **Experience:** the title screen footer in `src/ui/intro.ts` still says timing is simulated. The signal delay is now real (JPL Horizons); drive and scan times are still simulated.
- **Experience:** expect a small merge conflict in `src/ui/intro.ts` with your title-screen work. My three lines are the `MAX` constant, the fleet meter (`'Relay hand-off per signal leg', ship.handoffMin, MAX.handoff`) and the crew summary (`Relay hand-off ${ship.handoffMin} min`).
- **Experience:** `SOURCES` in `src/data/opsDates.ts` has the provider, URL, retrieval date and limits for both datasets, ready for the "Data sources" panel.
- **Data:** each date uses one sol as its season stand-in. If you build a per-season summary, `scripts/build-ops-dates.mjs` is the one place to switch over.
- **Humans:** the dataset table in `CHALLENGE.md` still says the two snapshots are only in the original repo. They are now in `data/nasa/`. I did not edit `CHALLENGE.md`.

## Play times measured

- None by a human yet. The playthroughs above were automated, so they say nothing about the 10 to 20 minute target.
