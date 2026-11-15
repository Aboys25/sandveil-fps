# sandveil-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/aboys25/sandveil-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/aboys25/sandveil-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

SANDVEIL is a round-based tactical FPS in the Counter-Strike style, built on three.js: 4v4 on the original "Depot 7" freight-yard map, with a plant/defuse bomb objective, per-round money and a buy menu, five weapons, frag and smoke grenades, and bots that follow routes, hold positions, and react to sight and sound. Single-player against bots, fully offline — no build step, no network requests, three.js 0.187.0 vendored in `game/`.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in desktop Chrome
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=kg74h5f2&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>

## How it plays

Vanguard (attackers, ember) vs Sentinels (defenders, steel blue). First team to 5 rounds wins, max 9, with a halftime side swap after round 4. Attackers plant the pulse charge at Site A or B; defenders defuse it. Rounds also end on elimination or when the clock runs out (defenders win a timed-out round if the charge is not planted).

- **Economy:** $800 start, +$300 per kill, +$1,400 per round win, +$1,000 per loss (+$500 per consecutive loss, capped). Buy during the 12-second buy phase with `B` or the digit keys.
- **Arsenal:** VK-7 rifle, Kestrel-9 SMG, Breacher-12 shotgun, Longbow DMR (scoped), P9 pistol, frag and smoke grenades, armour, and a defuse kit (halves defuse time).
- **Gunplay:** headshot bonus, recoil and spread that punish firing on the move, acceleration-based movement, crouching, jumping, and a quiet walk that bots cannot hear.
- **Bots:** waypoint routes, hold positions, vision cones with line-of-sight and smoke checks, hearing, burst fire with skill-based aim error, strafing, bomb carrying, planting, defusing, and site rotation.
- **Map:** Depot 7 — two sites, a mid corridor with a contested doorway, containers, crates, fuel tanks, and sandbag cover, lit for dusk with a fixed warm palette.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Look / fire |
| Right mouse | Aim (DMR scope) |
| R | Reload |
| Ctrl | Crouch |
| Shift | Quiet walk |
| Space | Jump |
| 1 / 2 | Primary / pistol |
| Q | Swap weapon |
| 3 / 4 | Frag / smoke grenade |
| B | Buy menu (buy phase) |
| E | Plant / defuse (hold) |

## Layout

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library.
- `game/index.html` — the game shell: one import map (`three` → vendored three.js), the HUD, and the overlays.
- `game/src/` — the game, one job per module: `main.js` (boot, fixed-step loop, hitscan), `match.js` (rounds, economy, bomb), `bots.js` (AI), `player.js` (movement, health), `weapons.js` (guns, viewmodels), `projectiles.js` (grenades, tracers, particles), `world.js` (map meshes, lighting), `mapdata.js` (layout, waypoints), `physics.js` (collision, line of sight, paths), `hud.js` (DOM HUD, minimap), `input.js`, `audio.js` (procedural WebAudio effects), `palette.js`, `rng.js` (seeded RNG).
- `game/vendor/three/` — three.js 0.187.0, byte-for-byte from the competition kit.
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.
- `screenshots/` — 3–4 real renders, unedited, captured from the deterministic `?shot=` setups in `shots.json`.
- `serve.ts` — a small static server for local play. `shots.json` — the screenshot setups.

## Deterministic screenshots

`node serve.ts`, then open `http://localhost:8080/?shot=start|buy|play|plant&seed=1`. Each setup stages a fixed scene, renders it twice, freezes, and sets `window.__shotReady` for the capture tool. The four setups are `1-combat.jpg` (play), `2-menu.jpg` (start), `3-buy.jpg` (buy), `4-plant.jpg` (plant).

## Test results

- `node --check` passes on all 14 game modules.
- `MAKEFUN_OUTPUT_DIR=out node main.ts` builds `out/dossier.json` (see `build-log.txt` for the run record).
- Headless-browser smoke test: see `build-log.txt` — the game boots, stages all four `?shot=` setups without console errors, and renders with software WebGL.

## Verification gaps

- No GPU on the build machine: screenshots were captured with software rendering (SwiftShader) at 1280×720. They are real renders of this code, unedited, but a hardware-GPU capture in desktop Chrome would look sharper.
- Play balance (bot difficulty, economy pacing) was tuned by reading the code, the staged frames, and headless soak observation, not by playing full matches by hand.
