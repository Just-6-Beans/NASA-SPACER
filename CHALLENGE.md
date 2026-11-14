# CHALLENGE.md: what we are building, and what we are not

Every human and every AI agent on this team reads this file before starting work. If a task does not serve what is written here, do not build it.

Event: NASA Space Apps Challenge 2026, 14–15 November 2026.
Challenge: [Space Mission Design Game](https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/).
Our entry: **Spacer**, a Mars mission game. This repository (NASA-SPACER-Claude) is a fresh build of it; the original prototype is in [Space-Mission-Design-Game](https://github.com/Just-6-Beans/Space-Mission-Design-Game).

## 1. The challenge

NASA's own summary of the challenge:

> Create an interactive game where participants design, manage & simulate a complete space mission while making engineering decisions, managing limited resources & evaluating how each choice shapes mission success.

That sentence holds six requirements. Spacer must do all six:

| # | Requirement | What it means in Spacer |
|---|---|---|
| 1 | **Design** a mission | The player picks the spacecraft, the payload, the mission date and the landing site. |
| 2 | **Manage** it | The player runs power, budget, battery, supplies and time while the mission is under way. |
| 3 | **Simulate** it | The game plays the plan forward and shows what happens. The player does not just read a result. |
| 4 | **Engineering decisions** | Each choice is a trade-off with a cost. No option is best at everything. |
| 5 | **Limited resources** | Budget, mass, power, time and communications are capped, and the caps bite. |
| 6 | **Choices shape success** | The end report tells the player which of their choices caused the outcome. |

"Complete mission" means the player goes from planning to an outcome in one sitting: design, launch, operate, decide, debrief.

> **Official text: a human must paste it below.** The challenge page could not be loaded from the machine that wrote this file (the site's certificate failed to verify), so the summary above comes from NASA's public announcement of the challenge. Open the challenge link in a browser, paste the full Objectives and Potential Considerations here, and fix anything in this file that disagrees with them.
>
> ```
> (paste the official challenge text here)
> ```

## 2. The drift test

Before you start a task, and again before you merge it, answer these. A "no" to all of the first three means stop.

1. Does it give the player a design, management or simulation decision with a real trade-off?
2. Does it tie a game number to a NASA dataset, or make that link visible to the player?
3. Does it help the player see how their choices caused the result?
4. Does it keep a full playthrough inside the time budget in section 3?

Out of scope unless a human on the team says otherwise:

- Station mini-games that do not change a mission trade-off.
- More co-op or networking work. Co-op works; leave it alone unless it breaks.
- Cosmetics, new suits, new ships, art polish, before the full loop is playable with real data.
- Calling NASA APIs while the game runs. See section 4.
- Invented numbers presented as NASA data.
- Rewrites of working code, new frameworks, or a second game engine.

## 3. Play time

One full mission takes **10 to 20 minutes**. A little over is fine. Do not cut content to hit 20:00, and do not pad to reach 10:00.

A starting budget, to be tuned by playtesting:

| Phase | Minutes | The player is doing |
|---|---|---|
| Brief and design | 3–5 | Choosing date, spacecraft, payload, and seeing the constraints the data sets. |
| Prepare | 3–5 | Routing power, calibrating, loading supplies. |
| Operate | 3–6 | Running the rover or surface plan under signal delay, weather and radiation limits. |
| Decide and debrief | 2–4 | Choosing the site, then reading why the mission went the way it did. |

The original prototype played in about five minutes; this build has not been timed yet. The extra time should come from data-driven decisions (section 4), not from longer walking or waiting.

Time the player's own play, not the sum of timers. Anyone who playtests writes the measured time in their lane notes.

## 4. Data comes first

The main focus of the entry is the NASA datasets. Today every number in the game is simulated. The most valuable work is replacing simulated numbers with numbers derived from the sources below, and showing the player where they came from.

You do not have to use every dataset. If you need data that is not listed, look for an official NASA source first, and add it to this table when you use it.

### Rules for data

1. **Snapshot, do not stream.** Download data with a script in `scripts/`, commit the trimmed result to `data/nasa/`, and have the game read that file. The demo must work offline and must not break if an API is slow.
2. **Every snapshot records its source URL, provider and retrieval date** inside the file.
3. **Show provenance in the game.** When a real measurement drives a decision, the player sees the source, the place and the date, for example "Curiosity REMS, Gale Crater, sol 3012".
4. **Say what is real and what is modelled.** A game rule built on top of real data (for example, heater power as a function of temperature) is our model, and the game says so.
5. **Stay inside what each dataset can support.** The limits are in the table. Do not exceed them.

### Datasets

"In original repo" means a snapshot is committed in [Space-Mission-Design-Game](https://github.com/Just-6-Beans/Space-Mission-Design-Game) under `Spacer/data/nasa/`, refreshed there by `npm run data`. It has not been copied into this repository yet; the data lane copies it into `data/nasa/` with the fetch script.

| Dataset | Status | Good for | Limits you must respect |
|---|---|---|---|
| **Curiosity REMS weather** ([feed](https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json)) | **In original repo**: `data/nasa/curiosity-weather.json`. 4,745 sols, 7 Aug 2012 to 25 Aug 2026. | Air and ground temperature, pressure, sunrise and sunset, UV index, season (solar longitude). Drives heater power, solar hours, seasonal planning. | An outreach product, not calibrated science data. One place only: Gale Crater. About 28 sols have no temperature or pressure. Humidity and wind are empty in every record, and the opacity field always says "Sunny", so it says nothing about dust. Always show location and date. |
| **JPL Horizons** ([docs](https://ssd-api.jpl.nasa.gov/doc/horizons.html)) | **In original repo**: `data/nasa/earth-mars-geometry.json`. Daily, 2026 to 2030. | Earth–Mars distance and one-way light time, from 5.4 minutes (30 Mar 2029) to 21.2 minutes (29 Jun 2030). Drives signal delay and the cost of choosing a mission date. | Geometry only. It does not say whether a launch or a transfer is feasible. A launch-window mechanic needs our own trajectory model, labelled as a model. |
| **Curiosity RAD via RadLab** ([instrument record](https://visualization.osdr.nasa.gov/radlab/gui/knowledgebase/MSL-RAD-Surface)) | Not fetched yet. | Surface radiation dose for excursion and crew-exposure planning. About one reading every 17 minutes. | Filter by instrument ID `MSL-RAD-Surface`. A query for all Mars data also returns instruments from other agencies. |
| **MOLA roughness grid** ([file, about 16.6 MB, NetCDF](https://pgda.gsfc.nasa.gov/data/MOLA/MOLA_roughness_slpcor_8ppd.grd)) | Not fetched yet. Do not commit the raw file; commit a small extract for our candidate sites. | Comparing landing regions by terrain roughness. | 8 pixels per degree, about 7.4 km per cell north to south. It compares regions. It cannot place individual rover obstacles. The Mars Trek colour hillshade is a picture, not an elevation grid. |
| **SWIM subsurface water-ice map** ([PNG](https://www.nasa.gov/wp-content/uploads/2023/10/1-pia26045-swim-map-shows-subsurface-water-ice-on-mars.png)) | Not fetched yet. | A map the player reads to compare ice evidence between regions. | Qualitative only. No verified NASA-hosted numeric grid. Do not compute water yield, ice concentration or digging depth from it. |
| **TES thermal inertia map** ([image](https://marsoweb.nas.nasa.gov/globalData/images/thermal_large.jpg), [notes](https://marsoweb.nas.nasa.gov/globalData/TES_notes.html)) | Optional. | A supporting map for site comparison. | Interpolated, 8 pixels per degree. Do not read image colours as calibrated values. |
| **Perseverance raw images** ([collection](https://mars.nasa.gov/mars2020/multimedia/raw-images/)) | Not fetched yet. | Observation and hazard-spotting moments, image-transmission trade-offs. | One photograph gives no obstacle distances and no traversability map. |
| Perseverance weather feed | **Do not use as a core source.** | — | It returned seven records, 21–27 April 2024, with gaps. |

### Where the data should land in the game

These are the highest-value links between data and decisions. Start here.

- **Mission date sets signal delay.** The player picks an operations date. Horizons gives the real one-way light time for that date, and the rover command delay uses it.
- **Season sets the power budget.** The player picks a sol or season. REMS temperatures set heater demand, and sunrise and sunset set the solar window.
- **Radiation limits surface time.** RAD dose rates cap how long an excursion can run.
- **Site choice uses real maps.** MOLA roughness and the SWIM map replace the invented site descriptions, within their limits.

## 5. Three devices, three lanes

Three devices work at once, each with an AI agent. Each device takes one lane. A lane owns files; other lanes do not rewrite them. Humans decide which device takes which lane and write the name at the top of the lane's notes file.

| Lane | Owns | Job |
|---|---|---|
| **data** | `data/` (to be created), `scripts/fetch-nasa-data.mjs` (to be copied), `src/data/` (to be created), the data section of `CREDITS.md` | Fetch and trim NASA data. Expose it to the game as small typed functions. Write the provenance text the game shows. |
| **rules** | `src/core/` (`data.ts`, `power.ts`, `tasks.ts`, `rover.ts`, `mission.ts`), `test/` | Turn data into trade-offs: costs, limits, the simulation, scoring, and the cause-and-effect list for the debrief. Own the pacing numbers. |
| **experience** | `src/main.ts`, `src/ui/`, `src/game/`, `src/audio.ts`, all CSS, `index.html`, `public/`, `scripts/gen-art.mjs`, `scripts/art-hq.mjs`, `src/art/geo.json` | Screens, onboarding, the debrief screen, the in-game data-source labels, and the measured play time. |

Dependencies run one way: **data → rules → experience**. The data lane exports functions, the rules lane calls them, the experience lane displays what the rules return.

Frozen unless broken: co-op (`server/`, `src/coop.ts`, `src/core/protocol.ts`).

Humans own the submission itself: the project page, the demo, and the AI-use disclosure in `CREDITS.md`. Check the current Space Apps rules for what must be disclosed.

### Working rules

1. **Start of every session:** `git pull --rebase origin main`, then read this file and all three files in `notes/`.
2. **Work on your lane's branch:** `lane/data`, `lane/rules` or `lane/experience`.
3. **Small commits, merged often.** Aim to land on `main` at least once an hour. Long-lived branches are how three agents end up with conflicts.
4. **Before you land:** rebase on `main`, run `npm run check`, and land only if it passes. Then `git push origin HEAD:main`.
5. **`main` is always playable.** Never force-push it. If you break it, fixing it comes before anything else.
6. **Stay in your lane's files.** If your change needs a small edit in another lane's file (wiring one field, one import), make it, keep it short, and name it in the commit message. If it needs more, write the request in your own notes file under "Asks" and carry on with something else.
7. **Write only your own notes file.** `notes/<lane>.md` holds what you finished, what you are doing now, what you need from another lane, and measured play times. Everyone reads all three; each lane edits one. This keeps the notes free of merge conflicts.
8. **A new dependency, a changed export that another lane calls, or a change to this file** needs a human's yes.
9. **Ask the drift test** (section 2) before starting anything that is not already in your notes file.

## 6. Done means

- A new player finishes a mission in 10 to 20 minutes without help.
- At least two NASA datasets change the decisions the player makes, and the game names them on screen.
- The debrief names the choices that caused the outcome.
- A second playthrough with different choices gives a different result.
- `npm run check` passes and the production build runs offline.
- `CREDITS.md` has no TODO left.
