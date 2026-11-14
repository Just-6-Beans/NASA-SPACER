# Instructions for AI agents in this repository

This is a NASA Space Apps 2026 hackathon entry, built by three devices working at once.

1. Read [CHALLENGE.md](CHALLENGE.md) before doing anything. It defines the challenge, the drift test, the 10 to 20 minute play time, the data rules, and the three lanes. It overrides your own ideas about what the game should be.
2. Ask the human which lane this device has (`data`, `rules` or `experience`) if `notes/` does not already say. Work only on that lane's branch and files.
3. At the start of a session run `git pull --rebase origin main` and read all three files in `notes/`.
4. The game lives at the repository root. Its run commands and controls are in [README.md](README.md).
5. Before landing work on `main`, run `npm run check`. Land only if it passes. Never force-push `main`.
6. Update your own lane's notes file when you finish or start something. Do not edit another lane's notes file.
7. Do not edit `CHALLENGE.md`, add a dependency, or change an export another lane uses without a human's yes.
8. The original prototype lives in [Space-Mission-Design-Game](https://github.com/Just-6-Beans/Space-Mission-Design-Game). Do not copy its code into this repository; its NASA data snapshots may be copied by the data lane.

## Code conventions

- Mission rules stay in plain TypeScript in `src/core/`, with no Phaser or DOM imports, so the tests and the co-op server can run them. Forecast and execution share one calculation (`simulatePass` in `src/core/rover.ts`).
- Phaser owns rendering, station collision, and the Mars map (`src/game/`). HTML and CSS own the menus, HUD, panels, rover controls, sites, and report (`src/ui/`, `src/style.css`, `src/holo.css`).
- Art is original SVG produced by `npm run art` (`scripts/gen-art.mjs`, `scripts/art-hq.mjs`). Station geometry and collision rectangles come from `src/art/geo.json`, which the art generator and the game both read; change them together.
- Clearly label simulated terrain, readings, and timing in the game.
- The Colyseus room (`server/index.ts`) shares deck presence and power, validates messages with `src/core/protocol.ts`, rate-limits clients, and answers transmit checks against the shared power state. It is a consistency check, not anti-cheat. Each tab runs its own station tasks and rover clock.
- The game never calls a NASA API at runtime. Data snapshots live in `data/nasa/` once the data lane imports them.
