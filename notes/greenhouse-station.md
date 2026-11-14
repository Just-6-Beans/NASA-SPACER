# Greenhouse and station redesign: where it stands

Branch: `greenhouse-station` (local name `local/greenhouse-station`). Written 14 November 2026 when the
session ran out of usage. Built with an AI coding assistant (Claude Code); say so in CREDITS.md.

Source for the greenhouse content: `Mars_Greenhouse_Game_Reference.pdf` (NASA and USGS research plus
game values). Decisions the human on this device made: the greenhouse is ON THE STATION (not Mars),
optional, exists before the rover is sent, crop growth is a plain real-time cooldown, it has its own
0 to 100 score for a later leaderboard, the deck is enlarged in an ISS-like layout with the dark
title-screen look, and the astronaut moves 1.5 times faster.

## Done and working

- **New deck layout** (`scripts/build-geo.mjs` writes `src/art/geo.json`; run `npm run geo`, then
  `npm run art`). Eight modules: Cupola, Docking Port, Node 3, Node 1, US Lab, Node 2, Greenhouse,
  Comms. Three hatches, four tunnels, 17 terminals. World is 2100 x 1800.
- **New station art** (`scripts/art-station.mjs`): one picture per module and link, props, sills,
  the Earth, stars, truss and arrays, the greenhouse racks. All in `public/assets/`.
- **Scene** (`src/game/game.ts`, `stationFx.ts`, `deck.ts`, `nav.ts`): loads the new art, new
  exterior, per-terminal reach, speed 218 / 353 px/s. Checked in a headless browser: the station
  loads, the astronaut spawns in the Docking Port, the guide path and the minimap work.
- **HUD**: objective texts and the minimap use the new module names (`src/ui/stationHud.ts`).
- `test/station.test.ts` rewritten for the new layout: 9 tests, all passing when last run.
- **Crop data** (`src/core/crops.ts`): nine crops from the PDF, labelled as game values.
- **Crop art** (`scripts/art-crops.mjs`, `public/assets/crop-*.svg`): 8 stages x 4 symptom rows each.

## Written but NOT verified

- **Greenhouse simulation** (`src/core/greenhouse.ts`, about 1,900 lines) and
  `test/greenhouse.test.ts`. A helper agent wrote both and was stopped when the usage limit hit.
  The file type-checks. Nobody has run the tests or reviewed the code yet. Run
  `npx tsx --test test/greenhouse.test.ts` first and read the failures.
- **Greenhouse deck layer** (`src/game/greenhouseFx.ts`): plants, grow lights, lamps, array wings.
  It compiles, but nothing feeds it yet, so the racks stay dark and empty.

## Left to do, in order

1. Run and fix the greenhouse tests; review `greenhouse.ts` against the comments at its top.
2. `src/core/mission.ts`: add a `greenhouse = new Greenhouse()` field, a `'greenhouse'` entry in
   `TaskId` (`src/core/tasks.ts`) and in `TASK_INFO`, and a score getter (base score plus
   greenhouse score) for the leaderboard.
3. `src/main.ts`: tick the greenhouse about four times a second (`gh.tick(dt, { orbitPhase,
   crewInside: station().inGreenhouse, quiet: screen !== 'station' })`), call
   `station().setGreenhouse(view)`, show new alerts as toasts, add a HUD chip, and list the
   greenhouse under the optional tasks.
4. Greenhouse panels (new `src/ui/greenhouse*.ts` and a CSS file). The eleven greenhouse terminals
   now open a "Not wired yet" placeholder (`src/ui/panels.ts`). Needed, from section 9 of the PDF:
   status bar, exterior strip, overview and recipe, bay panel (plant, inspect, harvest, isolate,
   pollinate), irrigation, power, alerts, progress and unlocks, seed bank and food processing.
5. `src/ui/report.ts`: a greenhouse score box and the mission total.
6. `scripts/gen-art.mjs`: call `cropSheets()` from `art-crops.mjs` so `npm run art` writes the
   crop sheets too (CI compares `public/assets` with the scripts).
7. Remove the dead `deckSvg` and `props` functions from `scripts/art-hq.mjs`; redraw
   `exteriorSvg` (the docking animation still shows the old three-node station).
8. README.md, CREDITS.md and notes: describe the new deck and the greenhouse, and what is real
   (NASA crop research) and what is our model (every number).
9. Play it: measure play time, check a phone layout, check two-tab co-op on the larger deck.

## Things a human must decide or know

- **lanes.json** has no owner for `scripts/build-geo.mjs`, `scripts/art-station.mjs`,
  `scripts/art-crops.mjs`, `scripts/fetch-rover-data.mjs` or this file, so `test/lanes.test.ts`
  fails. That file is changed by a human together with CHALLENGE.md.
- **Frozen co-op file changed**: `src/core/protocol.ts`, the `WORLD` size only, because the deck
  grew. Approved by the human on this device. The co-op server must be restarted to pick it up.
- **This branch sits on top of the rover rewrite** (two commits, one with about 55 MB of NASA
  media). The team has not yet agreed to replace the old rover plan.
- **Not in this branch**: the rover chat's newer rover edits are still uncommitted in the working
  folder (README.md, mission.ts, survey.ts, roverPanels.ts, roverView.ts, ops.ts, report.ts,
  survey.css, test/mission.test.ts, site-references.json, fetch-rover-data.mjs, two deleted videos).
- `origin/ui-ux-fixes` (a teammate's UI rework) changes main.ts, panels.ts, stationHud.ts and
  report.ts too. Merging it with this branch will conflict.
