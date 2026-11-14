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

- Terrain, ice readings, timing, costs, and mission numbers in the game are simulated, and the game says so on screen.
- No NASA dataset is included in this repository yet. The original repo ([Space-Mission-Design-Game](https://github.com/Just-6-Beans/Space-Mission-Design-Game)) holds snapshots of Curiosity REMS weather (NASA/JPL-Caltech and Centro de Astrobiología) and Earth–Mars geometry from JPL Horizons, each recording its source and retrieval date. Update this section when they are wired in here.
- No NASA logos or branding are used. Do not add any.

## Third-party software

Phaser (MIT), Colyseus (MIT), Express (MIT, required at runtime by `@colyseus/ws-transport`), Vite (MIT), TypeScript (Apache-2.0), and the Barlow Condensed, IBM Plex Mono, and DM Sans fonts via Fontsource (SIL Open Font License 1.1). Check `npm ls` and each package's license file for exact terms.

## License

TODO: this repository has no LICENSE file. Pick one together with your team.
