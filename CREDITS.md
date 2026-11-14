# Credits and disclosures

This file is a checklist. Complete the TODO items before sharing or submitting Spacer.

## Authors

- Game code: written with Claude Code (Anthropic) from the team's SPACER brief. TODO: add the team members who directed, reviewed, and changed it.
- Art: original SVG artwork produced by code in `scripts/gen-art.mjs` and `scripts/art-hq.mjs` (also written with Claude Code), output to `public/assets/`. The launch field is drawn at run time with WebGL2 from our own models and shaders in `src/ui/launchScene.ts` and `src/ui/scene/` (also written with Claude Code). The rockets and spacecraft are our own drawings of real vehicles, with no agency or company markings. No image-generation model and no third-party images were used.
- The hand-flown ascent is an original two-dimensional physics model (`src/core/ascent.ts`) in the genre of spaceflight sandbox games. No code, art, level or name from an existing game was used.
- Audio: synthesized at runtime with the Web Audio API in `src/audio.ts`. No audio files.

## AI use

- Code, artwork generator, and documentation in this repository were produced with Claude Code. TODO: confirm the wording your event requires.
- NASA Space Apps asks teams to disclose AI use and to label AI imagery. Check the current rules for your event.

## Data and NASA material

Two NASA datasets drive the rover pass, and NASA's own descriptions back the three launch systems. Snapshots are committed in `data/nasa/`, each recording its source URL, provider and retrieval date (14 November 2026). The game reads the snapshots and never calls an API.

- **Earth to Mars light time: JPL Horizons** (NASA/JPL Solar System Dynamics), https://ssd.jpl.nasa.gov/api/horizons.api. Mars observed from Earth's centre, daily, 2026 to 2030. The game uses the one-way light time on the player's operations date as the signal delay. Horizons gives geometry only; the game makes no launch-window claim from it.
- **Night temperature: Curiosity REMS weather feed** (NASA/JPL-Caltech and Centro de Astrobiología, CSIC-INTA), https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json. This is an outreach product, not calibrated science data, and it covers one place, Gale Crater. The game uses the minimum air temperature of one sol per operations date and shows the sol number and date beside it.
- **Launch systems: NASA pages and reports.** `data/nasa/launch-vehicles.json` keeps, for each fact, the exact sentence it rests on. Sources: *The Space Shuttle* (NASA reference page), https://www.nasa.gov/reference/the-space-shuttle/; *40 Years Ago: Columbia Takes Flight!* (NASA History); *What Was the Space Shuttle? (Grades 5-8)* (NASA STEM); the STS-88 and STS-135 mission pages; *International Space Station Facts and Figures*; the Kennedy Space Center Shuttle and station FAQ (archived); the *Commercial Crew Program Press Kit*, https://www.nasa.gov/commercial-crew-program-press-kit/; NASA's 2020 certification article and Crew-2 release for Crew Dragon; two NASA Commercial Crew blog posts and an image article on the Atlas V; NASA's releases on the Starliner Crew Flight Test and its uncrewed return; and three publications of the NASA Office of Inspector General (report IG-20-005 of 2019, and news items of June and September 2026). Two disagreements between NASA sources are recorded with their quotes, one of them from the fact sheet *Space Shuttle Era Facts* (2011). Every URL is in the snapshot.
  - The game takes two numbers from these: thrust over weight at lift-off (Space Shuttle 6.8 million lb over 4.5 million lb; Falcon 9 "more than 1.7 million" lb over 1,207,920 lb) and the launch price (1 cr for each $10 million of NASA's cost figure).
  - These are descriptions and headline figures, not a performance dataset, and the cost figures are not like for like. NASA gives no lift-off weight for the Atlas V with Starliner, so its ratio is our estimate and the game says so.
- **What is our model, not NASA data:** the ascent (a small physics model on a scaled-down Earth), cargo ratings, the price and effect of every station cargo item (their masses follow the team's cargo table), the 136 cr mission budget; using a past sol from the same Mars season (two Mars years earlier) as a stand-in for a 2029 operations date; the heater draw (1 battery point per °C below −65 °C); the relay hand-off; drive and scan times; battery points; the dust front; the ice reading; all costs. The game labels these on screen.
- Terrain, the survey sector, the landing sites and the station are invented.
- No NASA logos or branding are used. Do not add any.

## Third-party software

Phaser (MIT), Colyseus (MIT), Express (MIT, required at runtime by `@colyseus/ws-transport`), Vite (MIT), TypeScript (Apache-2.0), and the Barlow Condensed, IBM Plex Mono, and DM Sans fonts via Fontsource (SIL Open Font License 1.1). Check `npm ls` and each package's license file for exact terms.

## License

TODO: this repository has no LICENSE file. Pick one together with your team.
