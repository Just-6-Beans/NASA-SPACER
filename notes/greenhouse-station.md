# Greenhouse and station redesign: where it stands

Local branch: `local/greenhouse-station`, in the clone at `Desktop\NASA-SPACER-Claude-latest`, on top of
`main` at 4365606. Updated late on 14 November 2026. Nothing from this branch is committed or pushed yet.
Built with an AI coding assistant (Claude Code); CREDITS.md says so.

Source for the greenhouse content: the team's `Mars_Greenhouse_Game_Reference.pdf` (NASA and USGS research
plus game values). Decisions the human on this device made: the greenhouse is ON THE STATION (not Mars),
optional, exists before the rover is sent, crop growth is a plain real-time cooldown, it has its own
0 to 100 score for a later leaderboard, the deck is an enlarged ISS-like layout in the dark title-screen
look, and the astronaut moves 1.5 times faster.

## Done and working

Already on `main`:

- **Deck layout** (`scripts/build-geo.mjs` writes `src/art/geo.json`; run `npm run geo`, then `npm run art`).
  Eight modules, three hatches, four tunnels, 17 terminals, world 2100 x 1800.
- **Station art** (`scripts/art-station.mjs`) and the scene that shows it (`src/game/`), speed 218 / 353 px/s.

New on this branch:

- **Greenhouse simulation** (`src/core/greenhouse.ts`, `src/core/crops.ts`): nine crops, eight growth
  stages, five growth factors, stress and health, water, nutrient solution, air and pressure, power on the
  station's 30x clock, nine kinds of failure in four stages, four levels, the score, save and reload.
  `test/greenhouse.test.ts`: 29 tests, all passing, and now part of `npm test`.
- **In the mission** (`src/core/mission.ts`, `src/core/tasks.ts`): `Mission.greenhouse`, the optional
  `'greenhouse'` task (complete at the first stored harvest), and `Mission.scoreboard` (base + greenhouse).
- **Game loop** (`src/main.ts`): the module ticks five times a second from docking, also while the rover
  screen is open (no new failure starts there). New alerts are toasts, the HUD has a greenhouse chip, and
  the task drawer lists the greenhouse.
- **Panels** (`src/ui/greenhouse.ts`, `src/greenhouse.css`), live while open:
  - a bay: plant, inspection view with roots, stage, health, stress, the five factors, light, harvest,
    pollinate, keep for seed, isolation valve, clear line, treat, clear;
  - Greenhouse Control: overview and recipe, alerts (diagnose, acknowledge, drills), score and levels,
    real and model;
  - Service Bay: irrigation and nutrients, power and load shedding, air and hull;
  - Seed Bank & Galley: seed packets and crop cards, stored food, processor, residue recycler;
  - Hab Systems: a remote greenhouse view and its alerts (the shielded place to work from).
- **On the deck** (`src/game/greenhouseFx.ts`): plants on the racks by stage and symptom, grow lights,
  status lamps, ready markers, locked bays, the kiosk and service screens, irrigation beads, the alarm
  beacon, and the array wings outside (edge-on when feathered).
- **Crop art** (`scripts/art-crops.mjs`): nine sheets, 8 stages x 4 symptom rows, written by `npm run art`.
- **Report** (`src/ui/report.ts`): a greenhouse box with the seven score parts and the mission total.
- README.md and CREDITS.md describe the eight modules and the greenhouse.
- Checked in headless Chrome on this branch: launch, dock, plant lettuce, watch it grow, harvest (the
  task completes), an irrigation failure from alert to diagnosis to repair, every panel tab opens with no
  console error. `npm run check` passes: 110 tests.

## Left to do

1. **Play it as a person.** Nobody has played a whole mission with the greenhouse. Measure the play time
   (CHALLENGE.md asks for 10 to 20 minutes) and write it in the lane notes.
2. **Balance for the leaderboard.** A scripted player who checks once a minute reaches level 4 in about
   6.5 minutes and scores 93, so the score tops out early. Tune the targets in `score()` and the failure
   gaps in `RATES` once people have played.
3. **The docking animation** still shows the old three-node station: redraw `exteriorSvg` in
   `scripts/art-hq.mjs`, and remove the unused `deckSvg` and `props` there.
4. **Co-op**: each tab runs its own greenhouse; only presence and the power grid are shared. Check two
   tabs on the larger deck, and restart the co-op server so it has the new world size.
5. **Phone layout**: the panels have narrow-screen rules but were not checked on a phone.
6. **Save**: the simulation can snapshot and restore itself (tested), but the game does not store it, so a
   page reload starts a new greenhouse with the new mission.
7. **CREDITS.md**: add the source links from the reference document (one TODO line there).
8. **The pause and speed controls** from the reference document were left out on purpose: growth is a
   cooldown, as the human on this device asked.

## Things a human must decide or know

- **Frozen co-op file**: `src/core/protocol.ts` carries the larger `WORLD` size. Approved by the human on
  this device; it is already on `main`.
- **`origin/ui-ux-fixes`** (a teammate's UI rework) changes main.ts, panels.ts, stationHud.ts and
  report.ts too. Merging it with this branch will conflict.
- **Model numbers the helper changed to make the timelines work** (all in `RATES` in greenhouse.ts): the
  root zone drains with a 42 s time constant; the solution drifts more slowly and only growing plants take
  from it; root contamination starts at 0.1 and spreads at 0.06; a seed resupply also brings one unit of
  nutrient stock and one dose of sanitiser.
- The older working folder `Desktop\NASA-SPACER-Claude-copy` was put back on `main` with a clean tree. A
  stash there (`git stash list`) keeps a copy of this work; this clone is the one to continue in.
