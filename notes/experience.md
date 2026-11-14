# Lane notes: experience

Device / person: aizux7's device. Two sessions share this lane on it: the station (branch `lane/experience-station`, worktree `.claude/worktrees/station`) and the title screen (main checkout).
Branch: `lane/experience`

Only the experience lane edits this file. Everyone reads it.

## Done

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

## Now

- (nothing claimed)

## Next

1. Play the current build start to finish with a stopwatch and write the time below. This is the baseline for the 10 to 20 minute target.
2. Show the mission brief before the fleet screen as well. It now exists at the Mission Ops table (`briefTab` in `src/ui/ops.ts`), which the player reaches after choosing a ship.
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
