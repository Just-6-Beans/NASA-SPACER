# Credits and disclosures

This file is a checklist. Complete the TODO items before sharing or submitting Spacer.

## Authors

- Game code: written with Claude Code (Anthropic) from the team's SPACER brief. TODO: add the team members who directed, reviewed, and changed it.
- Art: original SVG artwork produced by code in `scripts/gen-art.mjs` and `scripts/art-hq.mjs` (also written with Claude Code), output to `public/assets/`. No image-generation model and no third-party images were used.
- Audio: synthesized at runtime with the Web Audio API in `src/audio.ts`. No audio files.

## AI use

- Code, artwork generator, and documentation in this repository were produced with Claude Code. TODO: confirm the wording your event requires.
- NASA Space Apps asks teams to disclose AI use and to label AI imagery. Check the current rules for your event.

## Data and NASA material

Two NASA datasets drive the rover pass. Snapshots are committed in `data/nasa/`, each recording its source URL, provider and retrieval date (14 November 2026). The game reads the snapshots and never calls an API.

- **Earth to Mars light time: JPL Horizons** (NASA/JPL Solar System Dynamics), https://ssd.jpl.nasa.gov/api/horizons.api. Mars observed from Earth's centre, daily, 2026 to 2030. The game uses the one-way light time on the player's operations date as the signal delay. Horizons gives geometry only; the game makes no launch-window claim from it.
- **Night temperature: Curiosity REMS weather feed** (NASA/JPL-Caltech and Centro de Astrobiología, CSIC-INTA), https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json. This is an outreach product, not calibrated science data, and it covers one place, Gale Crater. The game uses the minimum air temperature of one sol per operations date and shows the sol number and date beside it.
- **What is our model, not NASA data:** using a past sol from the same Mars season (two Mars years earlier) as a stand-in for a 2029 operations date; the heater draw (1 battery point per °C below −65 °C); the relay hand-off; drive and scan times; battery points; the dust front; the ice reading; all costs. The game labels these on screen.
- Terrain, the survey sector, the landing sites and the station are invented.
- No NASA logos or branding are used. Do not add any.

## Third-party software

Phaser (MIT), Colyseus (MIT), Express (MIT, required at runtime by `@colyseus/ws-transport`), Vite (MIT), TypeScript (Apache-2.0), and the Barlow Condensed, IBM Plex Mono, and DM Sans fonts via Fontsource (SIL Open Font License 1.1). Check `npm ls` and each package's license file for exact terms.

## License

TODO: this repository has no LICENSE file. Pick one together with your team.
