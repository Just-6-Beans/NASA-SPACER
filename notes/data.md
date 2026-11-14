# Lane notes: data

Device / person: (write it here)
Branch: `lane/data`

Only the data lane edits this file. Everyone reads it.

## Done

- In the original repo (Space-Mission-Design-Game), `npm run data` writes `Spacer/data/nasa/curiosity-weather.json` (4,745 sols) and `Spacer/data/nasa/earth-mars-geometry.json` (daily, 2026 to 2030). Fields and units are described inside each file. Not yet copied into this repo.

## Now

- (nothing claimed yet)

## Next

0. Copy `Spacer/scripts/fetch-nasa-data.mjs` and `Spacer/data/nasa/` from the original repo into `scripts/` and `data/nasa/` here, and add an `npm run data` script.
1. Create `src/data/` with small typed functions the rules lane can call, for example `lightTimeOn(date)` and `weatherOn(sol)`. Handle the sols with missing temperature or pressure. Add tests.
2. Decide how the game loads the weather file (it is about 0.9 MB): a smaller per-season summary, or a lazy import.
3. Fetch Curiosity RAD surface dose from RadLab, filtered by `MSL-RAD-Surface`.
4. Extract MOLA roughness for the candidate landing regions. Do not commit the 16.6 MB grid.
5. Write the provenance line for each dataset, for the experience lane to display.

## Asks for other lanes

- (none)

## Play times measured

- (none)
