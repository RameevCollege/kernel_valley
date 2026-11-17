# Kernel Valley: Урожай багов — Technical Documentation

## 1. Project Summary

**Kernel Valley: Урожай багов** (Kernel Valley: Bug Harvest) — a browser-based 2D top-down pixel-art RPG blending:
- **Stardew Valley** farming mechanics
- **Factorio** factory automation (conveyors → assemblers)
- **Cybersecurity simulation** (terminal repair quizzes, bug hunting)

**Platform:** Self-contained HTML5 — works offline via `file://`, no build step, no server, no dependencies.

**MVP location:** `docs/mvp/bormotoon/index.html`

---

## 2. Architecture Overview

### 2.1 Two-Layer Design

```
┌─────────────────────────────────────┐
│         Presentation Layer          │  game.js
│  Canvas 2D, Input, UI, Audio, Save │
└───────────────┬─────────────────────┘
                │ KernelCore API
┌───────────────▼─────────────────────┐
│           Simulation Core           │  game-core.js
│  Deterministic, no DOM, no I/O     │
└─────────────────────────────────────┘
```

**Why separate?**
- `game-core.js` is **Node-testable** (runs in `core.cjs` without browser)
- Deterministic logic enables reliable saves, replays, multiplayer later
- Presentation can be swapped (Canvas → WebGL, DOM, React) without touching rules

### 2.2 Module Pattern (IIFE)

All files use Immediately Invoked Function Expressions:
```js
(function () { "use strict"; /* code */ })();
```
- No ES modules (`import`/`export`) — works on `file://` protocol
- No global namespace pollution
- `KernelCore` and `KernelGame` exposed on `window` only where needed

---

## 3. Simulation Core (`game-core.js`)

### 3.1 Exported API

```js
const C = window.KernelCore;
// Constants
C.W, C.H, C.GROW          // 24, 18, 12
C.sites, C.questions      // map objects, quiz data

// State lifecycle
C.create(seed)            // → initial state object
C.restore(jsonString)     // → validated state or null

// Player actions
C.move(state, dx, dy)     // → bool (success)
C.interact(state, x, y)   // → { message } | { dialog, q }
C.answer(state, q, idx)   // → bool (correct)
C.build(state, x, y, type)// type: "belt"|"factory"|"erase"
C.attack(state)           // → bool (hit)
C.buy(state, type)        // type: "helper"|"home"|"heal"|"sell"

// Simulation step
C.tick(state, dt)         // advances time, AI, production
C.connected(state)        // → bool (bunker→factory line complete)
```

### 3.2 State Schema

```typescript
interface GameState {
  version: 1;
  seed: number;           // world RNG seed
  time: number;           // seconds since start

  player: {
    x: number, y: number; // tile coordinates
    hp: number;           // 1..8 (6 base, 8 with home)
    face: [number, number]; // last move direction
    inv: number;          // invincibility timer
  };

  // Economy
  credits: number;
  corn: number;           // raw corn in inventory
  patches: number;        // factory output (for repairs)
  harvests: number;       // total harvests collected
  produced: number;       // patches produced by factory
  kills: number;          // bugs defeated

  // Progression
  home: 0 | 1;            // 0 = shack, 1 = upgraded
  helper: boolean;        // drone hired
  drone: Uint8Array(64);  // 8×8 pixel art (0..3 palette indices)

  // World objects
  plots: Plot[9];         // farm plots
  builds: Build[];        // belts/factories on factory zone
  solved: number[];       // completed terminal indices (0,1,2)
  trees: {x,y}[];         // perimeter decoration

  // Entities
  bugs: Bug[3];           // {x,y,hp:0..3,clock}

  // Internal timers
  factoryClock: number;
  helperClock: number;
  attack: number;         // attack animation timer
  won: boolean;
  log: string;            // last message for HUD
}

interface Plot { x: number, y: number, age: number } // age: -1=empty, 0..12=growing, 12=ready
interface Build  { x: number, y: number, type: "belt"|"factory" }
interface Bug    { x: number, y: number, hp: number, clock: number }
```

### 3.3 Deterministic RNG (LCG)

```js
function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
```
- Same seed → identical world (perimeter trees)
- Used only at world creation; simulation thereafter is fully deterministic

### 3.4 Save Validation (`restore`)

Every field validated before use:
- Version check (`version === 1`)
- Numeric ranges (hp 1..8, credits ≥0, coordinates in bounds)
- Array lengths (9 plots, 3 bugs, 64 drone pixels)
- Cross-references (builds on valid tiles, no duplicate positions)
- Walkability check (player not inside tree/building)

Returns `null` on any failure — presentation layer creates fresh world.

---

## 4. Presentation Layer (`game.js`)

### 4.1 Rendering Pipeline

```
requestAnimationFrame (60fps)
    │
    ├─► Accumulate dt
    │
    ├─► Simulation step (100ms fixed step)
    │     C.tick(state, dt)
    │
    ├─► Pathfollowing (if path queued)
    │     C.move() per step
    │
    ├─► Auto-save (every 5s)
    │
    ├─► UI update (every 150ms)
    │     HUD, quest log, location text
    │
    └─► Draw (every frame)
          terrain (cached offscreen canvas)
          plots (growing corn)
          buildings / terminals
          conveyor belts (animated)
          helper drone (custom art)
          bugs (HP bars)
          player (with attack flash)
          path preview (dots)
```

### 4.2 Offscreen Terrain Cache

```js
function makeTerrain() {
  terrain = document.createElement("canvas");
  terrain.width = 768;  // 24×32
  terrain.height = 576; // 18×32
  // draw static: grass, paths, fence, pipes, trees, zone labels
  ctx = terrain.getContext("2d");
}
```
- Drawn once on load/save-load
- `draw()` copies via `ctx.drawImage(terrain, 0, 0)` — fast

### 4.3 Input Handling

| Input | Action |
|-------|--------|
| WASD / Arrow keys / ЦФЫВ | Move (grid, 1 tile) |
| E / У | Interact with adjacent object |
| Space | Melee attack |
| Click tile | Pathfind + interact/build |
| Touch buttons | Mobile movement |
| Esc | Cancel build mode / Pause |

**Pathfinding:** BFS on walkable tiles (4-dir), goal = adjacent to interactable or exact tile.

### 4.4 Modal Dialog System

Single `<dialog id="modal">` reused for all UIs:
- **Quiz** (terminal repair) — 3 answers, feedback, patch cost
- **Shop** — hire helper (12¢), sell corn (2→5¢)
- **Home** — heal (free), upgrade (10¢)
- **Art** — 8×8 pixel editor (4 colors), saves to `state.drone`

All modals **pause simulation** (world stops while open).

### 4.5 Audio

Web Audio API, synthesized square waves:
- `beep(freq)` — UI clicks (330Hz), movement, attacks (160Hz), success (700/880Hz)
- Master toggle in HUD (persists in session only)
- Respects `prefers-reduced-motion` (silent if enabled)

### 4.6 Persistence

```js
const KEY = "kernel-valley-v1";
function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}
```
- Auto-save: every 5s simulation time
- Manual: "Сохранить" button
- On pause, tab blur, page hide/unload
- Load: `C.restore(localStorage.getItem(KEY))` with full validation

---

## 5. Loader System (`loader.js`, `boot.js`)

### 5.1 Mandatory Loading Screen

Required by spec — shows before game:
- Real progress (scripts loaded)
- Embedded **Tron mini-game** (`vendor/tron-loader.html`) in iframe
- Communicates via `postMessage`:
  - Parent → iframe: `{type:"game-loading-progress", value:0..1}`
  - Iframe → parent: `{type:"tron-loader-ready"}`
- No artificial delay — "Перейти в игру" enables when `boot.js` calls `loader.ready()`

### 5.2 Boot Sequence (`boot.js`)

```js
const files = ["game-core.js", "game.js"];
load(0) → script.onload → load(1) → KernelGame.prepare() → loader.ready(start)
```
- 15s timeout fallback
- Error UI if file missing

---

## 6. Gameplay Systems Detail

### 6.1 Farming

- 9 plots at fixed positions (4-6, 8-10)
- Click empty plot → `age=0` (planted)
- Grows: `age += dt` per tick, max 12s
- Click ready plot (`age≥12`) → harvest: +2 corn, +3 credits, `age=-1`
- **Bugs steal:** if bug on tile with `age≥12` → `age=-1`, log message

### 6.2 Factory Automation

**Layout (y=9 row):**
```
Bunker(15,9) → Belt(16,9) → Belt(17,9) → Belt(18,9) → Belt(19,9) → Belt(20,9) → Factory(21,9)
```

**Logic (`tick`):**
```js
if (connected(state) && state.corn >= 2) {
  factoryClock += dt;
  if (factoryClock >= 3) {
    factoryClock = 0;
    state.corn -= 2;
    state.patches++;
    state.produced++;
  }
} else factoryClock = 0;
```
- `connected()` verifies 5 belts (16-20) + factory at 21
- Belts animate items visually when corn > 0

### 6.3 Terminals (Cybersecurity Quizzes)

| Terminal | Position | Question Index |
|----------|----------|----------------|
| Comms    | (19,4)   | 0              |
| Archive  | (19,14)  | 1              |
| Pump     | (5,14)   | 2              |

**Interaction:**
1. Player adjacent + 1 patch → opens quiz modal
2. 3 multiple-choice answers (social engineering scenarios)
3. Wrong: explains why, patch **not** consumed
4. Correct: `patches--`, `credits+=8`, `solved.push(q)`

### 6.4 Bug AI

```js
// Per bug, every 0.85s:
target = (dist to player ≤ 4) ? player : nearest_ripe_corn || fallback;
if (adjacent to player && player.inv===0) {
  player.hp--; player.inv=1.2; // attack
} else {
  move toward target (BFS step, avoids other bugs)
}
if (on ripe corn) { corn.age = -1; log theft; }
```
- 3 bugs, 3 HP each
- Patrol ↔ chase behavior
- Steal only mature corn

### 6.5 Helper Drone

- Hired at shop for 12 credits
- Every 3s: finds plot with `age≥12` (harvest) OR `age<0` (plant)
- Calls same `crop()` function as player
- Renders custom 8×8 art from `state.drone` (4 colors)

### 6.6 Home Upgrade

- Cost: 10 credits at home dialog
- Effect: `player.hp = 8` (from 6), persistent
- Free heal button always available

---

## 7. Win Condition

Checked every tick in `tick()`:
```js
if (!won && solved.length===3 && kills>=3 && helper && home && produced>=3) {
  won = true;
  log = "Деревня снова в сети! ...";
}
```
- All 3 terminals repaired
- 3 bugs killed
- Helper hired
- Home upgraded
- ≥3 patches produced

Shows victory modal, then free play continues.

---

## 8. Packaging (`pack.py`)

```bash
python3 pack.py
```
Produces:
- `out/kernel-valley.html` — single file, no external refs
  - CSS inlined (`<style>`)
  - Logo base64 (`data:image/webp;base64,...`)
  - Tron loader HTML embedded as JS string
  - All JS concatenated, `</script` escaped
- `out/kernel-valley-mvp.zip` — source bundle + `START.html` (copy of packed)

**Use cases:** Email attachment, USB stick, static hosting, itch.io.

---

## 9. Testing

### 9.1 Unit Tests (`tests/core.cjs`)
```bash
node tests/core.cjs
```
Tests: RNG determinism, collisions, farming cycle, factory connectivity, economy, combat cooldown, bug theft, death/respawn, full win path, save validation (malformed JSON, invalid fields, out-of-bounds).

### 9.2 E2E Browser Test (`tests/browser.mjs`)
```bash
node tests/browser.mjs           # test source
node tests/browser.mjs out/kernel-valley.html  # test packed
node tests/browser.mjs --reduced-motion        # a11y check
```
**Requirements:** Node 22+ (global WebSocket), `google-chrome` in PATH.

**Checks:**
- Loading screen visible → ready without timer → Tron iframe destroyed
- Onboarding → keyboard movement → click pathfinding plants crop
- Construction via UI → pause freezes sim → mobile viewport (390×844) no overflow
- Touch controls visible → reload preserves save → workshop drawing saved
- Shop hiring → quiz wrong answer explains → quiz repair saved → home upgrade
- **Zero non-file:// network requests**
- **No JS exceptions**

Outputs screenshots to `out/loading.png`, `out/desktop.png`, `out/mobile.png`.

---

## 10. Accessibility

- **ARIA:** `aria-label`, `aria-pressed`, `role="status"`, `aria-live="polite"`
- **Keyboard:** Full playable without mouse (WASD, E, Space, Esc)
- **Touch:** 4-direction D-pad + action/attack buttons at 390×844
- **Reduced motion:** `prefers-reduced-motion` disables belt animation, Tron pauses
- **Color contrast:** Dark theme, high-contrast palette (WCAG AA)
- **Screen reader:** Log updates via `aria-live`, dialog focus management

---

## 11. Extending the Game

### 11.1 New Terminal Quiz
```js
// game-core.js
questions.push({
  title: "Название",
  speaker: "Имя",
  text: "Ситуация...",
  answers: ["Вариант 1", "Вариант 2", "Вариант 3"],
  correct: 1,
  why: "Пояснение правильного ответа."
});
sites.push({ x, y, name: "Имя узла", type: "terminal", q: questions.length-1 });
```

### 11.2 New Building Type
1. Add to `build()` validation + cost
2. Add to `connected()` if part of factory line
3. Add rendering in `game.js` `draw()` → `building()` or new function
4. Add button in `index.html` + `setMode()` handler

### 11.3 New Bug Type
- Extend `bugs[]` entries with `type` field
- Modify `tick()` AI switch on type
- Add rendering variant in `draw()` bug loop

### 11.4 New Resource
- Add field to `create()` initial state
- Update `restore()` validation
- Add HUD element in `index.html` + `update()`
- Hook into economy (earn/spend in `tick`, `buy`, `interact`)

---

## 12. File Reference (docs/mvp/bormotoon/)

```
├── index.html          # Structure, canvas, HUD, modals, touch controls
├── game-core.js        # Pure simulation (KernelCore API)
├── game.js             # Rendering, input, UI, pathfinding, audio, save
├── loader.js           # Loading screen component + Tron iframe API
├── boot.js             # Sequential script loading, error handling
├── style.css           # Game UI styles
├── loader.css          # Loading screen styles
├── pack.py             # Single-file bundler
├── assets/
│   └── logo.webp       # College logo
├── vendor/
│   ├── tron-loader.html # Tron mini-game (MIT)
│   └── TRON-LICENSE     # License text
├── tests/
│   ├── core.cjs        # Node unit tests
│   └── browser.mjs     # CDP E2E test
└── out/                # Build output (gitignored)
    ├── kernel-valley.html
    ├── kernel-valley-mvp.zip
    └── *.png           # Test screenshots
```

---

## 13. Design Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| No build tools | `file://` must work; zero friction for students |
| IIFE modules | ES modules blocked on `file://`; no transpiler needed |
| Canvas 2D | Universal, fast enough, no WebGL complexity |
| Deterministic core | Reliable saves, testable, enables multiplayer later |
| Strict `restore()` | Corrupted saves must not crash; reject cleanly |
| Single `<dialog>` | Low memory, consistent focus/escape handling |
| BFS pathfinding | Grid is tiny (24×18); BFS is instant |
| Web Audio beeps | No audio files; works offline, tiny code |
| localStorage only | No IndexedDB complexity; state is small (<5KB) |
| Tron on loader | Engaging wait; demonstrates iframe `postMessage` |
| Russian UI | Target audience: Russian-speaking students |

---

## 14. Known Limitations (MVP Scope)

- Map size fixed 24×18; no procedural world beyond trees
- One factory, one belt direction (→), no splitters/underground
- 3 bug types only (identical stats), no bosses
- No NPC dialogue variety (shop/home/art only)
- No LLM integration (fallback generator only)
- No multiplayer, no cloud saves
- No sound volume slider (on/off only)

These are intentional — MVP validates core loop before expanding.

---

## 15. License & Attribution

- **Game code:** MIT (implied by educational context)
- **Tron loader:** MIT — original at `vendor/TRON-LICENSE`, source commit `358424a`
- **Logo:** College asset (`corp_design/`)
- **Pixel art:** Programmatic (no external sprites)