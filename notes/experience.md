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

### UI/UX audit and rework (14 Nov, Oxidopamine's device, asked for by the human there)

A third session on this lane, on a second device, in the main checkout on branch `lane/experience`. The human asked for an audit of why the game overwhelms a new player, then for every issue in it to be addressed. A separate session on that device is working on the launch screen in `.claude/worktrees/launch`.

What the audit found: everything was explained before the player had done anything (Mission status ran to 443 words and 81 numbers), the same facts repeated in up to nine places, nothing showed where the player was in the mission, the HUD carried developer tools, the four real decisions were buried among cost-free chores, and the rover pass was ten clicks of "Next event".

What changed, in the order a player meets it:

- **A spine.** One phase rail (Design, Prepare, Operate, Decide, Debrief) on every screen from the brief to the debrief (`src/ui/phase.ts`). On the station the objective is a backed card over the cupola window: "Step 2 of 7", the step's name, the terminal it points at, one sentence.
- **The brief comes first** (`src/ui/brief.ts`, `briefScreen` in `intro.ts`): goal, four decisions, three things that decide the outcome. It is shown before the spacecraft is chosen, so item 2 of the old Next list is done. Mission Ops shows the same brief, with the full rules behind a disclosure. The fleet screen says what each ship number is for.
- **Steps sweep the deck once**: Power Grid (left), Payload (centre), Rover Comms (right). `objectiveFor` and `stepOf` in `stationHud.ts`.
- **HUD**: Debug is the backquote key or `?debug`, not a button. Guide, Sound and Co-op sit in one Menu. The three-clock box is gone (the debug view keeps it). The deck map shows only when the deck is wider than the window (`deckFits` in `game.ts`). The bottom bar adds crew-hours and credits to the three power buses.
- **Rover Comms opens the planner directly.** The panel in between is gone; the terminal only shows a panel while the relay stands in the way.
- **Planner** (`roverView.ts`): a scrolling body over a pinned footer. The footer always holds one sentence (does this plan clear Ares Shelf, and if not, why) and the Transmit button. Each date shows what it would do to the current plan. Route and scan say what switching would cost. "Re-route power" opens the Power Grid over the planner. The two NASA numbers keep their source, place and date on screen; what our model does with them is one tap down. The map now carries the route and scan costs and the dust front.
- **Pass**: the clock runs by itself (pause, or skip to the next event). The panel sets what the rover is doing on Mars, as planned, against what Earth has heard, with the signal delay between them.
- **Mission status** is three lights (clock, battery, evidence), each opening to the choices behind it, then what is left and what needs attention. The date picker there is gone: one place to pick a date.
- **Debrief** (`report.ts`): what happened at three honest levels (complete, landed without the habitat, deferred), which choices caused it, what to try next, then "Fly again · change one thing", which keeps the last design. The suggestions come from flying each alternative through `simulatePass` (`suggestions` in `forecast.ts`). The last steps of the mission (the medical check if a crew-hour was kept, then the habitat) happen on the debrief, so the report is never a dead end.
- **Toasts** no longer double up, sit over the map on the rover screen, wait behind an open panel, and are cleared before the site decision.
- **Words**: battery is always %, an ice reading is "±n tighter/looser" with a "low end", the player's money is credits, the one-way time is the signal delay, and the NASA number inside it is the light time.

**Rule changes, in the rules lane's files** (`src/core/data.ts`, `mission.ts`, `rover.ts`, `test/mission.test.ts`), made because the human asked for every issue to be addressed, including the ones the audit marked as needing a yes:

- **Crew-hours.** `PREP_HOURS = 3`; a full relay repair, calibration, battery balancing, cargo, water and the medical check take one each (`PREP_COST`, `Mission.prepLeft`, `prepBlock`). Before, every task was free, so doing all of them was always right and none was a decision. The medical check was listed as optional although the habitat needs it; it is now named as what the habitat needs wherever it appears.
- **Relay fault as a choice.** `Mission.patchRelay()` is free and adds `PATCH_HANDOFF = 2` minutes to the relay hand-off; the full repair takes a crew-hour. A direct link never uses the relay, so the right fix depends on the power plan.
- **Eos Hollow can be chosen.** No dust deadline; it needs the rover home with `SURVEY_DRAW = 8`% above the reserve and the 12 cr power kit, plus imported water unless the shelf reading is strong.
- Acceptance scenarios 1 to 4 and the "no design wins everywhere" test pass unchanged. New tests cover the three rules. `PlanSnapshot` gains an optional `relayPatched`; `SITES` entries gain `needs`; some cause and warning strings say "%" where they said "pts".

Checked in headless Chrome at 1440×900 and 390×844, on the dev server and the production build: a full mission through every screen, fly-again, no console errors. Information on screen, before and after, counting what is visible without opening a disclosure: Mission status 443 words and 81 numbers, now 79 and 12; the debrief 470 and 93, now 336 and 48; the brief 320 words, now 157. The planner went from 61 numbers to 45, which is a smaller cut: its gain is that the verdict and Transmit are pinned in view at both sizes, where Transmit used to be below the fold. `npm run check` passes. No human play time was measured.

## Now

- (nothing claimed)

## Next

1. Play the current build start to finish with a stopwatch and write the time below. This is the baseline for the 10 to 20 minute target. The rework above changed the pacing, so no earlier guess holds.
2. Watch a first-time player and note where they stop. The audit and the rework were both done without one.
3. Add a data-source label wherever a new real measurement appears (RAD, MOLA), in the same form as the planner's: tag, value, source, place, date, with the model one tap down.

## Asks for other lanes

- **rules**: please review the three rule changes above; the numbers (3 hours, 2 minutes, 8%) are first guesses and yours to tune. They are in your files and your tests.
- **rules**: the rover pass still has no decision in it. Forecast and execution are one calculation, so nothing the player sees mid-pass is news, and any choice offered there could have been made in the planner. A real one needs something the forecast does not know. The suggestion with the best fit to the data: the night low of the actual sol differs from the season stand-in (REMS has the spread across neighbouring sols), the planner shows the heater draw as a range, and the rover wakes with a little more or less than planned. On a close date there is time to send one amended command (skip the scan, or cut it short) before it matters; on a far date there is not. That makes the JPL Horizons number felt. It changes the "one calculation" convention in AGENTS.md, so it needs a human's yes.
- **rules**: export the transmit thresholds (life 3, comms 4) from `src/core/power.ts`. `NEED` in `src/ui/stationHud.ts` mirrors them for the HUD meters, the floor buses and Mission status.
- **rules**: a public way to forecast a pass for an instrument that is selected but not yet activated. `forecastPlan()` in `src/ui/forecast.ts` gets one today by asking a copy of the mission for its snapshot.
- **rules**: the cause list covers the rover pass. The debrief adds a preparation card and a landing card of its own (`report.ts`); they belong in `Mission.causes` when you extend it to the whole mission (item 1 on your Next list).
- **data**: a new dataset needs a row in `sourceRows()` in `src/ui/ops.ts`; tell me and I will add it.
- **humans**: `vite` reloads the page whenever a file changes under `.claude/worktrees/`, because those worktrees sit inside the project root. Ignoring that folder in `vite.config.ts` would stop it.

## Play times measured

- (none)
