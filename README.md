# 🌌 NORTHERN LIGHTS RUN

**A 3D endless runner for Northern Lights Herbal Wellness — Lenasia (18+).**

Subway Surfers / Talking Tom Gold Run style, built with **three.js** (ES modules via CDN importmap).
No build tools for the game itself — plain static HTML/CSS/JS.

🌐 Live: https://saistarayub-hash.github.io/NORTHEN-LIGHTS
📸 [@northernlightsherb](https://instagram.com/northernlightsherb) · 👑 [@stoner_pri](https://instagram.com/stoner_pri)
📍 142 Protea Ave, Lenasia

---

## Run it locally

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

> An ES-module server is required (the game uses an importmap for three.js).
> `python3 -m http.server` is perfect. Internet is needed for three.js (CDN) + Google Fonts.

## Controls

| Action | Touch | Keyboard |
|---|---|---|
| Switch lane | swipe ◀ ▶ | ← → / A D |
| Jump | swipe up | ↑ / W / Space |
| Roll | swipe down | ↓ / S |
| Hoverboard | double-tap | F |
| Pause | HUD button | P / Esc |

Auto-pauses when the tab loses focus.

## Systems

- **Runner**: DOC — jointed, procedurally animated 3D character (run / jump tuck / roll spin /
  stumble-tumble / hoverboard surf stance / jetpack dangle), squash-and-stretch, ~12° lane lean.
- **Speed**: ramps 16 → 46 u/s (accel 0.36); FOV widens 62° → 70° with speed.
- **Obstacles**: low fences (jump), hanging leaf signs (roll under the panel), crates,
  **parked trains with RIDEABLE ROOFS** (ramp → roof launch with speed-adaptive power,
  roof coin lines, drop at the end) and **ONCOMING trains** (air horn + headlight beam).
- **Pickups**: spinning leaf coins (+25, streak multiplier ≤×5, pitch-rising SFX),
  gold leaf (+150), **Sodaze cans** (+50 pts, +3 buds).
- **Power-ups**: Magnet (vacuum + arcs), Shield (one save), ×2 points,
  **Jetpack** (5.5 s flight, sky coin line, safe landing + brief invuln),
  **Super Sneakers** (1.35× jump height, 12 s).
- **Hoverboards**: 30 s crash protection — the board breaks instead of you.
  Inventory starts at **2**, **+1 per 500 m**, cap **3** (persisted in `nl_boards`).
  4 boards × 2 deck colors — the colors from the lobby Board Shop drive the in-game model.
- **Keys**: persistent (`nl_keys`). Crash with a key → **2.6 s Second-Chance countdown** →
  road cleared ahead, invuln, slow-mo resume.
- **Scoring**: distance × multiplier ladder (**×1 → ×10**, +1 per 500 m milestone with fanfare
  + aurora boost), pickup streaks (×5 max), near-miss +40, milestone confetti.
- **Emotes**: speech bubbles with per-category cooldowns — "DOC'S ON THE MOVE!", "PHEW!",
  "JACKPOT!", "ON FIRE!", "SODAZE BREAK!", "BOARD SAVED!", "OUCH!!".
- **Juice**: screen shake, GPU particle bursts (zero-allocation pool), floating score popups,
  red crash edge flash, slow-mo tumble, 3-2-1-GO countdown ("GO 👑 NAME" on crown runs),
  speed lines, **live FPS meter**.
- **Lobby** (opens **only** via [`index.html#cockpit`](index.html#cockpit)): Board Shop,
  Crew row (DOC + 3 locked runners — unlocked via the cockpit), ALL-TIME / THIS WEEK
  leaderboards (top 8), owner crown chips (tap = crown run, score auto-banks),
  guest runs, device stats, two-tap leaderboard reset.
- **World**: aurora night sky (gradient dome + animated shader ribbons + stars + moon),
  purple fog, neon lane-edge strips, streetlamps with glowing orbs, building silhouettes
  with lit windows, neon signs, branded arch gates:
  **"NORTHERN LIGHTS — HERBAL WELLNESS · LENASIA"**.

## Performance

- 60 fps target on mid-range Android.
- **Auto quality tiers** (one-way, ~4 s slow-frame watchdog):
  pixel-ratio cap 2 → 1, particle budget 100% → 60% → 35%, fog distance 84 → 66 → 52,
  decor thinning, aurora ribbon count 3 → 2 → 1.
- Object pooling for obstacles / pickups / particles; merged static geometry;
  fake blob shadows (no shadow maps); no per-frame allocations in hot loops.

## Files

```
index.html               game shell (importmap, HUD, screens, lobby)
css/style.css            theme + all UI styles
js/boot.js               entry: renderer, quality tiers, loop, FPS meter
js/sim.js                state machine: physics, collisions, scoring, power-ups
js/spawner.js            pattern library + tiered spawner (pure, no imports)
js/world.js              sky/aurora/road/decor pools/pickups/particles/FX
js/player.js             DOC rig + hoverboard + jetpack + chase camera
js/input.js              keyboard + swipe + double-tap
js/ui.js                 HUD, screens, lobby, emotes, popups, second chance
js/audio.js              WebAudio synth SFX + 116 BPM generative music (as-is)
js/textures.js           canvas-generated textures (leaf, road, gates, labels…)
js/store.js              localStorage persistence (keys unchanged)
js/boards.js             board catalog + crew roster
cockpit.html             STAFF-ONLY admin (private — do not link publicly)
tools/build_single.js    → northern-lights-run.html (single-file build)
test_headless.js         Node smoke test (three stubbed, DOM stubbed)
northern-lights-run.html generated single-file build (three.js still via CDN)
```

## Testing & building

```bash
node test_headless.js          # headless smoke test (no browser needed)
node tools/build_single.js     # regenerate northern-lights-run.html
```

## LocalStorage keys (stable — cockpit + game share them)

`nlhs_v1` (scores `{n,s,b,d,t,o}`) · `nl_owners_v1` · `nl_stats_v1` · `nl_keys` ·
`nl_boards` · `nl_board` · `nl_name` · `nl_muted` · `nl_unlocked` · `nl_char`

---

**18+ only.** Northern Lights is a cannabis dispensary — play responsibly, drive sober,
and if you smoke, don't run. 🌿
