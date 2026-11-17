# Kernel Valley: Урожай багов — AGENTS.md

## Project Overview

**Kernel Valley** is a browser-based 2D pixel-art RPG (top-down) blending Stardew Valley farming, Factorio factory automation, and cybersecurity simulation. Built as a self-contained offline HTML5 game — no build step, no server, no dependencies.

**MVP location:** `docs/mvp/bormotoon/` — open `index.html` directly in any modern browser.

---

## Architecture

### Core Simulation (`game-core.js`)
Pure deterministic logic — no DOM, no I/O, no timers. Exports `KernelCore` API:
- `create(seed)` — initial world state
- `tick(state, dt)` — advances simulation by `dt` seconds
- `move(state, dx, dy)` — player movement
- `interact(state, x, y)` — interaction at tile
- `answer(state, q, index)` — terminal quiz answer
- `build(state, x, y, type)` — place/remove belt/factory
- `attack(state)` — melee attack
- `buy(state, type)` — shop purchases (helper, home, heal, sell)
- `restore(json)` — validated save deserialization
- Constants: `W=24`, `H=18`, `GROW=12`, `sites[]`, `questions[]`

State shape (validated in `restore`):
```js
{
  version: 1, seed, time,
  player: { x, y, hp, face: [dx,dy], inv },
  credits, corn, patches, harvests, produced, kills,
  home: 0|1, helper: bool, drone: Uint8Array(64),
  plots: [{x,y,age} x9], builds: [{x,y,type}],
  solved: [qIndex], trees: [{x,y}],
  bugs: [{x,y,hp,clock} x3],
  factoryClock, helperClock, attack, won, log
}
```

### Presentation (`game.js`)
Canvas rendering, input, UI, modal dialogs, pathfinding, sound synthesis, save/load.
- `KernelGame.prepare()` — init canvas, load/restore state, bind events
- `KernelGame.start()` — show game, start render loop
- `requestAnimationFrame` loop at ~60fps; simulation ticks at 100ms steps
- Auto-save every 5s + on pause/blur/unload to `localStorage['kernel-valley-v1']`

### Loader (`loader.js` + `boot.js`)
Mandatory loading screen with embedded Tron mini-game (`vendor/tron-loader.html`).
- Real progress updates via `postMessage` to iframe
- No artificial delays — transitions when assets ready
- `boot.js` loads scripts sequentially, calls `prepare()` then `ready(start)`

### Packaging (`pack.py`)
Single-file offline build:
```bash
python3 pack.py
# → out/kernel-valley.html (self-contained)
# → out/kernel-valley-mvp.zip (source + START.html)
```
Inlines CSS, base64-encodes logo, embeds Tron loader HTML, concatenates JS.

---

## Game Mechanics

### Map (24×18 tiles)
- **Farm (left):** 9 plots at (4-6, 8-10), 12s growth → 2 corn + 3 credits
- **Bunker (15,9):** auto-collects corn
- **Factory zone (16-21, 8-10):** 5 belts → factory at (21,9)
- **Terminals (3):** Comms (19,4), Archive (19,14), Pump (5,14) — each needs 1 patch + quiz
- **Buildings:** Home (4,4), Shop (8,4), Workshop (12,4)
- **Perimeter trees:** procedural by seed

### Resources
| Resource | Source | Use |
|---|---|---|
| Credits | Harvest (3), bug kill (5), terminal (8), sell corn (5) | Build (belt 2, factory 8), hire helper (12), upgrade home (10) |
| Corn | Harvest (2) | Factory input (2 corn → 1 patch / 3s) |
| Patches | Factory | Repair terminals (1 each) |

### Entities
- **Player (ИБ-андроид):** 6 HP (8 with home upgrade), invincibility frames
- **Bugs (3):** 3 HP each, patrol → chase player (dist≤4) or ripe corn, steal corn, attack adjacent
- **Helper (drone):** hired at shop, auto farms 1 plot/3s, renders custom 8×8 pixel art
- **Custom drone art:** 8×8 canvas, 4 colors → saved to `state.drone[64]`

### Win Condition
All 3 terminals repaired + 3 bugs killed + helper hired + home upgraded + ≥3 patches produced.

---

## Development Workflow

### Running
```bash
# Direct (file:// works)
open docs/mvp/bormotoon/index.html

# Or local server (recommended for loader iframe)
cd docs/mvp/bormotoon && python3 -m http.server 8000
# → http://localhost:8000
```

### Testing
```bash
# Core logic (Node)
cd docs/mvp/bormotoon && node tests/core.cjs

# Full browser smoke test (requires Node 22+ with WebSocket, google-chrome)
cd docs/mvp/bormotoon && node tests/browser.mjs
# Optional: node tests/browser.mjs --reduced-motion
# Test packed file: node tests/browser.mjs out/kernel-valley.html
```

### Packaging
```bash
cd docs/mvp/bormotoon && python3 pack.py
```

### Adding Content
1. **New terminal quiz:** Add to `questions[]` in `game-core.js`, add site in `sites[]`
2. **New building type:** Extend `build()`, `connected()`, rendering in `game.js`
3. **New bug type:** Extend `bugs[]` structure, AI in `tick()`, rendering
4. **New resource:** Add to state, update `save()` validation in `restore()`

---

## Code Conventions

- **IIFE modules** — no ES modules, works on `file://`
- **Strict mode** — `"use strict"` everywhere
- **Deterministic RNG** — LCG seeded by world seed
- **Validation-first** — `restore()` rejects any malformed save
- **No external deps** — Canvas 2D, Web Audio, localStorage only
- **Accessibility** — ARIA labels, keyboard navigation, reduced motion support
- **Russian UI** — all user-facing text in Russian

---

## Key Files Reference

| File | Purpose |
|---|---|
| `index.html` | Structure, canvas, HUD, modals, touch controls |
| `game-core.js` | Pure simulation, state, validation, Node-testable |
| `game.js` | Rendering, input, UI, pathfinding, audio, save loop |
| `loader.js` | Loading screen component with progress API |
| `boot.js` | Asset loading sequence, error handling |
| `style.css` / `loader.css` | Cyberpunk pixel UI, responsive, dark theme |
| `pack.py` | Single-file bundler |
| `tests/core.cjs` | Unit tests for simulation logic |
| `tests/browser.mjs` | E2E Chrome DevTools Protocol test |
| `vendor/tron-loader.html` | Tron mini-game (MIT licensed) |
| `assets/logo.webp` | College logo |

---

## Agent Guidelines

- **Do not add build tools** (vite, webpack, etc.) — the zero-dependency `file://` capability is a hard requirement
- **Preserve deterministic simulation** — any logic change must pass `core.cjs` tests
- **Keep `restore()` validation strict** — corrupted saves must be rejected, not crash
- **Test in headless Chrome** via `browser.mjs` before committing UI changes
- **Mobile-first responsive** — touch controls must work at 390×844
- **No external requests** — browser test asserts zero non-file:// network calls