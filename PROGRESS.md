# Spacer progress

This describes the starting state of this repository. Record new progress in your lane file in `notes/`; this file is not updated after that.

## What the build does

The game opens on a title screen over Earth, then a spacecraft carousel (Odyssey, Atlas, Vector), a crew manifest with four suit finishes, and an ascent and docking sequence with a skip button and a reduced-motion path. The orbital deck has a real elapsed **Docked** clock and an exterior view at 30× orbital playback, about 184 seconds per orbit. Five proximity terminals drive the mission: Payload, Power Grid, Calibration, Rover Comms, and Hab Systems. They host the instrument choice, power allocation, two-point calibration, relay repair, and the optional battery, cargo, water, and medical tasks.

The rover screen plans a Drive → Scan → Return pass on a zoomable simulated Mars sector. Forecast and execution share one calculation. It runs a delayed **T+** clock with queued, executing, downlink, and received states, and stops in safe mode at the 20% reserve. The site screen offers Ares Shelf, Eos Hollow, Meridian Plain, or deferring the landing. The report is built from the mission log and offers habitat commissioning after an approved landing with medical clearance.

Co-op uses a Colyseus room named `spacer_power`. Two tabs see each other's astronauts move and share the power grid. Each tab keeps its own tasks, rover, clock, and landing decision.

## Verified (14 November 2026)

- `npm test`: mission rules, all three rule-based acceptance scenarios, task validation, pose validation, and a live two-client co-op server test.
- Edge automation playing the real UI:
  - **Scenario 1:** clears Ares Shelf (31 ±7% at T+36, 36% battery, final telemetry T+52).
  - **Scenario 2:** the dust front closes Ares Shelf at T+56. The run then lands at Meridian and commissions the habitat.
  - **Scenario 3:** the rover stops at the reserve floor with weak evidence, and the water task makes Meridian affordable at 30 cr.
  - **Scenario 4:** two-tab co-op covering presence, movement, power sync, transmit authorization, and cleanup.
- Also checked: desktop at 1440×900, a 390×844 touch layout, resizing, the production build, and the offline co-op error with Retry.

## Not done

- Nothing reads NASA data yet; see `CHALLENGE.md` section 4 and `notes/data.md`.
- No measured human play time yet. CHALLENGE.md targets 10 to 20 minutes.
- Credits, AI disclosure, and license still have TODO items in `CREDITS.md`.
