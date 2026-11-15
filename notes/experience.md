# Lane notes: experience

Device / person: aizux7's device. Two sessions share this lane on it: the station (branch `lane/experience-station`, worktree `.claude/worktrees/station`) and the title screen (main checkout).
Branch: `lane/experience`

Only the experience lane edits this file. Everyone reads it.

## Done

### Rover part: the rover's rocket, two new tasks, and the launch-field look (15 Nov, LOCAL ONLY, not committed or pushed)

Asked for by a human on this device (aizux7), who said to keep it local until told otherwise. Branch `lane/experience-rover-tasks` in the clone at `GameTest\NASA-SPACER-Claude-latest`, on top of `main` at b600167. It crosses all three lanes; the last bullet lists what.

- **The rover part now has three tasks:** rover navigation (the drive that was there), Stuck Rover Rescue and Sample Selection. Before them, the rover gets a rocket.
- **The rover's rocket** (`src/ui/rocketPick.ts`, rules in `src/core/delivery.ts`). After choosing the rover, the pilot chooses what carries it, on the same 3D pad as the crew launch (three new models in `src/ui/scene/vehicles.ts`: Atlas V 541, Falcon 9 with a nose cone and no landing legs, Saturn V).
  - Atlas V 541: 24 cr, 98 %. Falcon 9 with the booster thrown away: 11 cr, 80 %, Perseverance only. Saturn V: shown, not for sale ("Too old and too expensive. It retired in 1973!").
  - The dice are real: a failed launch costs 3 Mars days while a backup flies. Never a dead end. `Mission.rng` can be replaced, and the tests do.
  - The mission budget went from 136 to 160 cr (the human's choice): exactly the Atlas V price, so every old design still works, and more cargo can leave only the Falcon 9 affordable. A design has to leave 53 cr (cheapest instrument plus cheapest rocket).
- **Stuck Rover Rescue** (`src/ui/roverTasks.ts`, rules in `src/core/rescue.ts`). Once a mission a drive ends early with wheel trouble. Pop-up "ALERT. WHEEL TROUBLE.", then telemetry (six wheel currents, tilt, motor temperature, one reading always missing), a diagnosis and four fixes with a time cost and a wheel risk.
  - The chance follows real terrain: MOLA slope under the path against the slopes the real rover has parked on, and distance from the nearest real stop. The plan shows "Stuck risk · Low / Medium / High" before the drive. From the second drive on the chance is 90 %, so a mission rarely goes by without it.
  - Held for at most 5 Mars days. Past 20 % wheel wear the rover keeps 70 % of its top speed for the rest of the mission. Curiosity starts at 8 %.
- **Sample Selection** (same files, rules in `src/core/samples.ts`). A ◆ sample site on each map (a real rover stop about 500 m out). Pop-up "NEW MISSION. CHOOSE WISELY.", then five rocks to scan and three tubes to fill. The value (0 to 100) fills the Rock samples check for the whole region. **The Drill test is gone**: coring happens only here and costs what the drill did.
  - The five rocks are real samples from NASA's catalog (Roubion, Montdenier, Skyland, Hazeltop, Sapphire Canyon), shown with NASA's own photo of each drill site (`public/nasa/samples/`, saved by the data script). The photos show the drill hole and its surroundings, not the core tube; the colour and texture clues describe what they show. An uncalibrated instrument reads their composition only faintly, so calibration now matters here.
- **Look.** The rover screen (`src/survey.css`, `roverView.ts`, `roverPanels.ts`) uses the launch field's glass panels, mono labels and display figures, with far less text: explanations moved behind "?" cards and closed details. Emoji are gone from it. `src/tasks.css` styles the new screens with the `lf-` classes.
- **Debrief.** `Mission.causes()` has lines for the rocket, the rescue (including a wrong diagnosis) and the tubes (including what was left behind). The report has three new boxes, Mission Ops has six new source rows, and the task drawer lists the new tasks.
- **A bug found on main and fixed:** a found photo mark jumped to the top-left corner of the map whenever the rover was parked beside it. The map used the class `hot`, which the parts guide's CSS also styles with a transform. The map class is now `near`.
- **Checked** in headless Edge on the dev server, no console errors: rover choice, all three rockets on the pad and the "?" card, a launch and its result card, the map and a route, a forced stuck drive, the alert, a wrong fix then the right one, the result, the drive to the sample site, scanning, sealing, the reveal, the report; the same with Curiosity (Falcon 9 refused, wheels worn past the limit); and 390 x 844 (which showed the rover screen overflowing sideways: fixed). `npm run check` passes (126 tests) and `npm run build` succeeds.
- **Not checked:** a person playing it, a real phone, Firefox, Safari, co-op with the new screens (each tab has its own rover, and no co-op file was touched), a failed-launch card and a "held for 5 days" rescue in the browser (the tests cover both rules). **Play time was not measured**; the rocket adds about 20 seconds and each task one to two minutes.
- **Crosses lanes, needs a human's yes before landing** (`npm run lane-check` will refuse it from an experience branch unless the commit names these files):
  - data lane: `data/nasa/rover-tasks.json`, `scripts/fetch-rover-tasks.mjs`, `src/data/roverTasks.ts`, the data section of `CREDITS.md`.
  - rules lane: new `src/core/delivery.ts`, `rescue.ts`, `samples.ts`; changes in `data.ts` (budget 160, ship budgets), `loadout.ts` (`DESIGN_RESERVE`, `instrumentLine`), `survey.ts` (`TEST_ORDER` has three tests, `spotBars` takes the tubes' value instead of `calibrated`), `mission.ts`; `test/rovertasks.test.ts` (16 tests) and edits in `test/mission.test.ts` and `test/loadout.test.ts`.
  - shared: `package.json` (the test list and `data:rovertasks`), `README.md`.
  - Exports that changed: `MISSION_BUDGET` 160; `Ship.budget` 115 / 138 / 124; `spotBars(r, p, done, sample)`; `TEST_ORDER` without `'drill'`; `Mission.runTest('drill')` is refused; new `Mission.delivery`, `chooseRocket`, `rocketBlock`, `roverBlock`, `routeRisk`, `rescue`, `stuck`, `diagnose`, `tryFix`, `fixBlock`, `wheelWear`, `wheelsWorn`, `sampleSite`, `atSampleSite`, `sampleCost`, `sampleBlock`, `collectSamples`, `samples`, `rocks`, `rng`. A rover cannot drive, test or recharge until `chooseRocket` has been called.

- 14 Nov, asked for by a human on this device (title polish and co-op are otherwise out of scope in CHALLENGE.md section 2): **3D title screen with a solo / co-op choice.**
  - Backdrop: a lit, rotating Mars globe with two orbit rings and a parallax star field, drawn by a raw WebGL2 shader in `src/ui/titleScene.ts`. No new dependency. It is a procedural artist's impression, and the title footer says so. Without WebGL2, or with reduced motion, the title shows a static planet or a single still frame.
  - Menu: the logo and the two mode cards sit in real CSS 3D (`src/title.css`) and tilt with the pointer.
  - **Solo mission** starts as before. **Co-op mission** flips the cards to a "crew link" lobby that joins the existing Colyseus room (`spacer_power`) from the title, shows both seats, and keeps the link through launch and docking. Server offline: the lobby says so and offers Retry or Fly solo instead.
  - Frozen co-op files (`server/`, `src/coop.ts`, `src/core/protocol.ts`) were not changed. The wiring is in `src/main.ts` (`crewLink`, `startMission`, `leaveCoop`); the in-station Co-op panel still works.
  - Checked in headless Edge on an Intel UHD laptop: two tabs join the same room from the title and see each other after docking; about 2 s to the first backdrop frame on a cold start, then full frame rate. `npm run check` passes.
  - Not checked: a real phone, Firefox, Safari. Play time was not re-measured; the new choice adds one click.

### Merged to main (14 Nov, at a human's request)

- The title screen, the rules lane's operations-date commit and the station's NASA-data wiring went to main together. Mission Ops now compares the three operations dates, shows the passCauses rows, and its Data sources tab reads provider, place, date and limits from `src/data/opsDates.ts`. The Rover Comms screen splits the delay into JPL Horizons light time and relay hand-off. The title footer no longer calls the timing simulated.
- The bare `.tag` rule in `src/rover.css` became `.tag.real, .tag.model`, because it was restyling the title tagline.

### Station redesign (14 Nov)

- **Layout.** The deck is three nodes joined by open hatches: A Utility (Power Grid, Hab Systems), B Command (cupola, Mission Ops, rover bay, airlock), C Science & Comms (Rover Comms, Calibration). The world is still 1160 x 670, so the co-op protocol is untouched.
  - All positions live in `src/art/geo.json`: solids, terminals, props and their draw depth, windows, power buses, and the spots the game draws live values on. `src/game/deck.ts` is the typed view. Move a console there and the art, the collision box and the terminal move together. Then run `npm run art`.
  - `scripts/art-hq.mjs` draws the deck, seven props, two rover instruments, the station exterior and the relay dish. The deck has its own random sequence and the Mars sequence is pinned, so station art changes cannot move a crater. Mars, site, suit and rover SVGs are byte-identical to the first build.
- **The deck shows mission state** (`src/game/stationFx.ts`): power buses in the floor follow the allocation and turn amber below the transmit threshold; the Power Grid, Rover Comms and rover bay screens show live values; the chosen instrument appears on the rover; the docked ship is outside the node A window; a relay fault flashes the beacon, swings the dish and reads NO LINK.
- **Mission Ops** (`src/ui/ops.ts`), a new terminal with three tabs:
  - Mission brief: goal, the player's decisions, limits for the chosen ship, and what counts as success. This is item 2 of the Next list below, placed in the station rather than before the fleet screen.
  - Mission status: budget, mass, power, battery and time against their limits, then one row per choice saying what it is causing. It calls `simulatePass` through the mission's own snapshot, so it agrees with the planner and the executed pass.
  - Data sources: one row per kind of number, each marked Simulated. This is the panel half of item 4 below.
- **Wayfinding**: a marker on the objective's terminal, floor chevrons along a walkable route to it (`src/game/nav.ts`, toggle with the Guide button), and a deck map in the HUD that also shows the crewmate.
- **Camera**: the view slides past the deck edges by the height of the HUD bars, so the header no longer hides the windows.
- `test/station.test.ts` (in the rules lane's folder, named in the commit): the deck matches the co-op world size, the spawn and a crewmate's offset spawn are open floor, every terminal has a console and is reachable from the airlock, and each bus ends at the system it feeds.
- Checked in headless Edge against the production build, with no console errors: a full mission through the new deck (acceptance scenario 1 gave 31 ±7% at T+36, 36% battery, final telemetry T+52, landing approved, habitat commissioned, replay), all three ships, both instruments, relay fault and repair, night side, the 390 x 844 touch layout, and two-pilot co-op (presence, moved-aside spawn, power sync). Frame time matched the first build within noise. No human play time was measured.

### Launch field: mission design and a hand-flown ascent (14 Nov, merged with main's rover exploration)

Asked for by a human on this device, and merged onto main at their request (branch `ROCKET-LAUNCH`, merged in `merge/rocket-launch`). It replaces the old fleet, crew and launch screens only; main's rover exploration is unchanged apart from reading the cargo effects below. It crosses lanes; the last bullet lists what.

- **What it is.** The game now opens on a launch field on Earth, drawn in WebGL2 like the title's Mars (`src/ui/launchScene.ts`, models and shaders in `src/ui/scene/`, no new dependency). The player designs the mission there and then flies the climb.
  - Design: one of three real launch systems (Space Shuttle, Falcon 9 + Crew Dragon, Atlas V N22 + Starliner) and six station cargo items in amounts (water, oxygen, food, spare parts, radiation shielding, an experiment rack), inside one 136 cr budget that also pays for the rover instrument chosen aboard. A "Launch check" panel shows the budget, the cargo against the rocket's rating, and a forecast of the climb. The question mark opens a compact card of what NASA says, with numbered sources.
  - Flight: the pilot tilts the stack with A / D (or touch buttons) and follows a guidance marker to orbit, about 85 seconds. Too heavy, or steered badly, and the launch fails; a debrief names the cause, and the pilot flies again or changes the design. After two failures the guidance can fly it.
  - Co-op: the host chooses the launch system; each pilot loads and flies their own. Once the host has launched with a crewmate in the room, the launch system is settled.
- **NASA data.** `data/nasa/launch-vehicles.json` (built by `scripts/fetch-launch-vehicles.mjs`, `npm run data:rockets`): 54 quoted sentences from NASA pages and reports, each checked against its source by the script. The game takes thrust over weight at lift-off (Shuttle, Falcon 9) and the launch prices from them. Mission Ops lists these under Data sources, with limits. Everything else about the launch is labelled as our model.
- **Down the line.** Each cargo item changes the station or the rover game: water adds to the base score, oxygen lowers life support's power minimum, food adds Mars days, spare parts fix the relay fault (and balance the rover battery), shielding raises the radiation score, the rack makes drilling cheaper (and studies samples uncalibrated). Mission Ops, the Payload ledger, the Power Grid checks and the report show it. The report has a "What decided the launch" box and a budget box.
- **Removed.** The old fleet, crew and launch screens and their CSS, the three invented ships (Odyssey, Atlas, Vector) and their art. Docked-spacecraft art for the three real systems is in `scripts/gen-art.mjs`.
- **Checked** in headless Edge on the production build, no console errors: the design screen (budget, weight verdicts, blocking), a guided ascent to docking with each launch system, a failed overweight launch and a failed hand-off launch with their debriefs, the guidance offer after two failures, a keyboard-driven ascent at real speed, two-browser co-op (18 checks), the 390 x 844 touch layout, the station panels and the report. `npm run check` passes (62 tests).
- **Not checked:** a human flying it (the keyboard flight was scripted), a real phone, Firefox, Safari, a machine without WebGL2 (the code falls back to a plain backdrop and the instruments). **Play time was not measured**; the launch adds a design step and about a minute and a half of flight per attempt.
- **Crosses lanes, needs a human's yes before landing:** data lane (`data/nasa/launch-vehicles.json`, `src/data/launchVehicles.ts`, `scripts/fetch-launch-vehicles.mjs`), rules lane (`src/core/data.ts`, `mission.ts`, new `ascent.ts` and `loadout.ts`, tests), and the frozen co-op files (`server/index.ts`, `src/coop.ts`, `src/core/protocol.ts`: the host's launch decision, and the transmit check now takes the pilot's life-support minimum, which oxygen tanks lower). `ShipId` changed (`shuttle`, `falcon9`, `atlasv`), which other lanes' code may name. `npm run lane-check` will refuse this from an experience branch as it stands.

## Now

- (nothing claimed)

## Next

1. Play the current build start to finish with a stopwatch and write the time below. This is the baseline for the 10 to 20 minute target.
2. Show the mission brief before the launch field as well. It now exists at the Mission Ops table (`briefTab` in `src/ui/ops.ts`), which the player reaches after docking.
3. Build the debrief screen: outcome, then the choices that caused it (from the rules lane), then "try again with a different design".
4. Add a data-source label wherever a real measurement appears. The "Data sources" panel exists (Mission Ops); it has no real measurement to list yet.
5. Replace "simulated" wording where a value now comes from NASA data, and keep it where the value is still our model.

## Asks for other lanes

- **rules**: export the transmit thresholds (life 3, comms 4) from `src/core/power.ts`. `NEED` in `src/ui/stationHud.ts` mirrors them for the HUD meters, the floor buses and Mission status.
- **rules**: a public way to forecast a pass for an instrument that is selected but not yet activated. `forecastFor()` in `src/ui/forecast.ts` gets one today by asking a copy of the mission for its snapshot.
- **rules**: the debrief cause list can reuse the Mission status rows in `src/ui/ops.ts` as its layout.
- **data**: the Data sources tab will read provider, place, date and limits from `SOURCES` in `src/data/opsDates.ts` once the rules lane's commit is on main. A new dataset needs a row in `sourceRows()` in `src/ui/ops.ts`; tell me and I will add it.

## Play times measured

- (none)
