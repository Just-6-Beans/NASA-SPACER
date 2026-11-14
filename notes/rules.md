# Lane notes: rules

Device / person: (write it here)
Branch: `lane/rules`

Only the rules lane edits this file. Everyone reads it.

## Done

- (nothing yet)

## Now

- (nothing claimed yet)

## Next

1. Add a mission date choice. Rover command delay comes from the real one-way light time for that date (data lane: `lightTimeOn`). Until that function exists, read `data/nasa/earth-mars-geometry.json` behind one function so it is easy to swap. Today the delay is `Ship.relayMin` in `src/core/data.ts`, used by `signalLeg()` in `src/core/power.ts`.
2. Add a season or sol choice. Real temperatures set heater power draw, and sunrise and sunset set the solar window. Mark the heater formula as our model.
3. Make the mission return a list of causes for the debrief: which choices helped and which hurt, with the numbers.
4. Check that no single design wins on every axis. Add a test that proves at least two different designs can succeed and at least two can fail.
5. Retune costs and timers so a full mission takes 10 to 20 minutes. Keep the acceptance-scenario tests in `test/mission.test.ts` passing, or update them and the README together.

## Asks for other lanes

- (none)

## Play times measured

- (none)
