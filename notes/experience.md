# Lane notes: experience

Device / person: aizux7's device. Two sessions share this lane on it: the station (branch `lane/experience-station`, worktree `.claude/worktrees/station`) and the title screen (main checkout).
Branch: `lane/experience`

Only the experience lane edits this file. Everyone reads it.

## Done

- **Station redesign (14 Nov).** The deck is now three nodes joined by open hatches: A Utility (Power Grid, Hab Systems), B Command (cupola, Mission Ops, rover bay, airlock), C Science & Comms (Rover Comms, Calibration). The world is still 1160 x 670, so the co-op protocol is untouched.
  - All positions live in `src/art/geo.json`: solids, terminals, props and their draw depth, windows, power buses, and the spots the game draws live values on. `src/game/deck.ts` is the typed view. Move a console there and the art, the collision box and the terminal move together. Then run `npm run art`.
  - `scripts/art-hq.mjs` draws the deck, seven props, two rover instruments, the station exterior and the relay dish. The deck has its own random sequence and the Mars sequence is pinned, so station art changes cannot move a crater. Mars, site, suit and rover SVGs are byte-identical to the first build.
- **The deck shows mission state** (`src/game/stationFx.ts`): power buses in the floor follow the allocation and turn amber below the transmit threshold; the Power Grid, Rover Comms and rover bay screens show live values; the chosen instrument appears on the rover; the docked ship is outside the node A window; a relay fault flashes the beacon, swings the dish and reads NO LINK.
- **Mission Ops** (`src/ui/ops.ts`), a new terminal with three tabs:
  - Mission brief: goal, the player's decisions, limits for the chosen ship, and what counts as success. This is item 2 of the old Next list, placed in the station rather than before the fleet screen.
  - Mission status: budget, mass, power, battery and time against their limits, then one row per choice saying what it is causing. It calls `simulatePass` through the mission's own snapshot, so it agrees with the planner and the executed pass.
  - Data sources: one row per kind of number, each marked Simulated. Item 4 of the old Next list.
- **Wayfinding**: a marker on the objective's terminal, floor chevrons along a walkable route to it (`src/game/nav.ts`, toggle with the Guide button), and a deck map in the HUD that also shows the crewmate.
- **Camera**: the view slides past the deck edges by the height of the HUD bars, so the header no longer hides the windows.
- `test/station.test.ts` (in the rules lane's folder, named in the commit): the deck matches the co-op world size, the spawn and a crewmate's offset spawn are open floor, every terminal has a console and is reachable from the airlock, and each bus ends at the system it feeds.

Checked in headless Edge against the production build, with no console errors: a full mission through the new deck (acceptance scenario 1 gave 31 ±7% at T+36, 36% battery, final telemetry T+52, landing approved, habitat commissioned, replay), all three ships, both instruments, relay fault and repair, night side, the 390 x 844 touch layout, and two-pilot co-op (presence, moved-aside spawn, power sync). Frame time matched the first build within noise.

## Now

- (nothing claimed)

## Next

1. Play the current build start to finish with a stopwatch and write the time below. Still not done: only automated runs so far.
2. Build the debrief screen: outcome, then the choices that caused it (from the rules lane), then "try again with a different design". The Mission status rows in `src/ui/ops.ts` are the layout to reuse.
3. Show the brief before the fleet screen as well, so it comes before the first choice.
4. Replace "simulated" wording where a value comes from NASA data, on the deck screens too (Rover Comms shows `ONE-WAY · SIMULATED`).

## Asks for other lanes

- **rules**: export the transmit thresholds (life 3, comms 4) from `src/core/power.ts`. `NEED` in `src/ui/stationHud.ts` mirrors them for the HUD meters, the floor buses and Mission status.
- **rules**: a public way to forecast a pass for an instrument that is selected but not yet activated. `forecast()` in `src/ui/ops.ts` gets one today by asking a copy of the mission for its snapshot.
- **rules**: a mission date choice would sit naturally at the Mission Ops table. Tell me the shape of the choice and I will add the tab.
- **data**: when a snapshot drives a number, fill `nasa: { provider, place, date }` on its row in `SOURCES` (`src/ui/ops.ts`). The Data sources tab then shows it as real and counts it.

## Play times measured

- (none: automated browser runs are not a play time)
