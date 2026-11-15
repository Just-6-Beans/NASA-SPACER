# Greenhouse and station redesign: where it stands

Local branch: `local/greenhouse-station`, in the clone at `Desktop\NASA-SPACER-Claude-latest`, on top of
`main` at 4365606. Updated on 15 November 2026: the greenhouse was rebuilt that day as two short
missions (see "The greenhouse, rebuilt" below). The rebuild is in the working tree and is not committed.
Built with an AI coding assistant (Claude Code); CREDITS.md says so.

Source for the greenhouse content now: the team's "Mars Expedition: Mission Scenarios and Pop-up Spec"
(`TasksList.pdf`), missions G1 and G2 and event E3. The older `Mars_Greenhouse_Game_Reference.pdf` was the
source of the first, detailed greenhouse, which the human on this device found too complicated and too slow.
Decisions the human on this device made: the greenhouse is ON THE STATION (not Mars), optional, exists
before the rover is sent, it has its own 0 to 100 score for a later leaderboard, the deck is an enlarged
ISS-like layout in the dark title-screen look, and the astronaut moves 1.5 times faster.

Decisions of 15 November for the rebuild, each one asked and answered:

- Replace the detailed greenhouse with only the spec's missions. Levels, the seed bank, the processor, the
  alerts, the particle storm, the remote view in Hab Systems, and potato, wheat and soybean are gone.
- G1: six sliders under the three checklist steps, a 10-second test, sliders usable while it runs.
- G2: the six fresh crops, pick 3, the player decides the crop of each of the 8 bays, a 10-second run, one
  "Harvest all" button. G2 does not depend on G1, so it opens after a failed G1 too.
- Only the pump failure stays as an event, by chance, with the choice "which side to save". The solar flare
  is removed. The dust storm belongs to the rover's random events and is for later.
- The greenhouse clock never moves the mission time or the Mars days. Wording fits the station (days, not sols).
- The G1 pop-up opens on the first walk into the greenhouse. G1, G2 and Harvest all are at Greenhouse
  Control; the bay screens, the Service Bay and the Seed Bank & Galley show status.
- Optional, 0 to 100: G1 40, G2 50, pump 10. No retry. Finished after both missions.

## Done and working

Already on `main`:

- **Deck layout** (`scripts/build-geo.mjs` writes `src/art/geo.json`; run `npm run geo`, then `npm run art`).
  Eight modules, three hatches, four tunnels, 17 terminals, world 2100 x 1800.
- **Station art** (`scripts/art-station.mjs`) and the scene that shows it (`src/game/`), speed 218 / 353 px/s.

The greenhouse, rebuilt (15 November, in the working tree):

- **Rules** (`src/core/greenhouse.ts`, `src/core/crops.ts`): one `Greenhouse` that moves through the phases
  `g1-setup`, `g1-test`, `g1-result`, `g2-brief`, `g2-plan`, `g2-run`, `g2-result`, `done`. Nothing moves
  until the player starts a mission. `test/greenhouse.test.ts`: 25 tests, part of `npm test`.
  - G1: six controls with a good zone each. Health starts at 100, loses 5 a second for every sensor out of
    its zone and wins back 2 a second when all are in. Power = 0.6 kW + 4 kW x light + 0.5 kW x water; over
    the 3.5 kW budget for 3 seconds in total trips the breaker. Two random drifts push a sensor out during
    the test.
  - G2: six crops with days to harvest, calories per harvest and litres a day. 3 greenhouse days pass each
    second. Won when 30,000 kcal are in by day 30 and the 1,400 L tank never ran dry. A ready bay waits for
    Harvest all; the last ready harvest comes in by itself at day 30. `forecast()` plays the plan ahead.
  - Pump failure: 50% of runs, between day 15 and 22. The run waits for the choice; the side that is not
    saved grows at half speed.
  - Score: G1 24 to 40 for a pass, G2 30 to 50 for a win, pump 10 unless a pump failed and the crew was not
    fed. A failed mission scores 0.
- **In the mission** (`src/core/mission.ts`, `src/core/tasks.ts`, unchanged): `Mission.greenhouse`, the
  optional `'greenhouse'` task (complete when both missions are finished and at least one was won), and
  `Mission.scoreboard` (base + greenhouse). Repairing the water purifier adds 120 L to the greenhouse tank.
- **Game loop** (`src/main.ts`): the module ticks ten times a second, also while the rover screen is open.
  The NEW MISSION pop-up opens on the first walk into the module. Results and the pump failure are toasts,
  the HUD has a greenhouse chip, and the task drawer lists the greenhouse.
- **Panels** (`src/ui/greenhouse.ts`, `src/greenhouse.css`), live while open:
  - Greenhouse Control: the missions (set-up and test, result, briefing, crop table and bay picker with the
    forecast, the run with Harvest all and the pump choice, the score), and "Real & model";
  - a bay: what grows there and how far it is;
  - Service Bay: the two pumps, the spare part, the water tank, and the pump choice when it is open;
  - Seed Bank & Galley: the food harvested and the crop table.
- **On the deck** (`src/game/greenhouseFx.ts`): plants on the racks by stage, grow lights, status lamps,
  ready markers, the kiosk and service screens, irrigation beads, the alarm beacon, and the array wings
  outside. Lettuce test trays stand in A1 and A2 during G1. Any crop may stand in any bay; a trellis crop
  on a leaf rack is drawn at 0.6 size.
- **Crop art** (`scripts/art-crops.mjs`): nine sheets, 8 stages x 4 symptom rows, written by `npm run art`.
  The game now loads six of them (potato, wheat and soybean are unused).
- **Report** (`src/ui/report.ts`): a greenhouse box with both results, the three score parts and the
  mission total.
- README.md describes the eight modules and the rebuilt greenhouse.
- Checked in headless Edge on 15 November: launch, dock, walk into the greenhouse (the pop-up opens and
  movement stops until it is closed), set up and pass G1, plan and win G2 with a pump failure, the task
  completes, every greenhouse screen opens with no console error. `npm run check` passes: 106 tests.

## Left to do

1. **Play it as a person.** Nobody has played a whole mission with the rebuilt greenhouse by hand; the
   checks were scripted. Measure the play time (CHALLENGE.md asks for 10 to 20 minutes) and write it in
   the lane notes.
2. **Balance.** Of every way to split 8 bays between 3 crops, 249 plans win in the forecast, a player who
   presses Harvest all a full second late still wins 223 of them, and 173 survive a pump failure at any
   moment. Plans with no chile pepper and no tomato never win. Tune `CROPS`, `GH.tankL` and
   `GH.crewKcalPerDay` once people have played.
3. **The docking animation** still shows the old three-node station: redraw `exteriorSvg` in
   `scripts/art-hq.mjs`, and remove the unused `deckSvg` and `props` there.
4. **Co-op**: each tab runs its own greenhouse; only presence and the power grid are shared. Check two
   tabs on the larger deck, and restart the co-op server so it has the new world size.
5. **Phone layout**: the panels have narrow-screen rules but were not checked on a phone.
6. **Save**: the game does not store the greenhouse, so a page reload starts a new greenhouse with the new
   mission. The rebuilt rules have no snapshot of their own.
7. **CREDITS.md**: add the source links for the two NASA cards the greenhouse quotes (one TODO line there).
8. **The dust storm** of the mission spec (E1) is for the rover's random events, later. The solar flare
   (E2) was removed on purpose.
9. **Unused crop art**: the potato, wheat and soybean sheets are still generated by `npm run art`.

## Things a human must decide or know

- **Frozen co-op file**: `src/core/protocol.ts` carries the larger `WORLD` size. Approved by the human on
  this device; it is already on `main`.
- **`origin/ui-ux-fixes`** (a teammate's UI rework) changes main.ts, panels.ts, stationHud.ts and
  report.ts too. Merging it with this branch will conflict.
- **Details of the rebuild the helper chose and the human has not confirmed yet**: the crop times (lettuce
  and radish 8 days, mizuna 10, kale 12, chile pepper 18, tomato 21; 3 days a second); the two drifts
  during the G1 test; G1 starts only when all three steps are in their green zones; the forecast before
  the G2 run; the last harvest coming in by itself at day 30; the run pausing for the pump choice and the
  pump failing only between day 15 and 22; a failed mission scoring 0; the Light column of the crop table
  being information only.
- The older working folder `Desktop\NASA-SPACER-Claude-copy` was put back on `main` with a clean tree. A
  stash there (`git stash list`) keeps a copy of this work; this clone is the one to continue in.
