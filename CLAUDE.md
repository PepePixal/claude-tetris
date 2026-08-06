# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Vanilla JavaScript Tetris — no build, no deps, no tests. Single-page game rendered with HTML5 Canvas 2D. The whole app is three files: `index.html` (DOM + canvas), `style.css` (dark retro-arcade theme), `game.js` (all logic, ~300 lines).

## Commands

There is **no build, no lint, no test runner**. Run the game by opening `index.html` directly, or serve the folder over HTTP for ES6 module-compatibility hygiene:

```bash
# Direct (double-click or):
start index.html             # Windows
open index.html              # macOS

# Local server (recommended — avoids any future CORS/file:// quirks):
python3 -m http.server 8000
npx serve .
php -S localhost:8000
```

Then open `http://localhost:8000`.

To verify changes after edits, just reload the browser tab. No automated regression suite exists.

## Architecture

`game.js` is fully script-global (no modules, no classes). State lives in module-level `let` bindings on `game.js:43` and is mutated by free functions. The flow:

- **Board model** — `ROWS × COLS` matrix of `0` (empty) or color-index `1–7`. See `createBoard` and `COLORS`/`PIECES` constants at `game.js:3–27`.
- **Piece coords** — `current.x`/`current.y` are grid coords (top-left of bounding box), not pixel coords. `shape` is a 2D matrix of color indices.
- **Collision** — `collide(shape, ox, oy)` checks every non-zero cell against board bounds and locked blocks.
- **Rotation** — `rotateCW` is a transpose + row-reverse. `tryRotate` applies basic wall kicks `[0, -1, 1, -2, 2]` column offsets (`game.js:77–87`).
- **Game loop** — `loop(ts)` is `requestAnimationFrame`-driven, accumulates `dt` into `dropAccum`, and ticks one row when `dropAccum >= dropInterval`. Drop interval shrinks with level: `Math.max(100, 1000 - (level - 1) * 90)` ms.
- **Locking** — `lockPiece` → `merge` (writes into `board`) → `clearLines` (bottom-up `splice` + `unshift`) → `spawn` (promotes `next` to `current`, generates new `next`). If `spawn` collides immediately, `endGame()` fires.
- **Ghost piece** — `ghostY()` projects `current` downward without mutating it; drawn with `globalAlpha = 0.2` in `draw()`.
- **Input** — single `keydown` listener on `document` (`game.js:277–300`). Arrow keys move, `↑`/`X` rotate, `↓` soft-drops, `Space` hard-drops, `P` pauses. `Space` calls `e.preventDefault()` to suppress page scroll.
- **Render** — `drawBlock` is the shared primitive: filled rect with a 4px translucent top highlight. `draw()` redraws the grid, board, ghost, then current piece every frame; `drawNext()` renders the preview canvas.

## Tuning knobs

Constants at the top of `game.js` (`COLS`, `ROWS`, `BLOCK`, `COLORS`, `PIECES`, `LINE_SCORES`, `dropInterval`) control gameplay. If you change `COLS`/`ROWS`/`BLOCK`, also update the `width`/`height` attributes of `<canvas id="board">` in `index.html` so it matches `COLS × BLOCK` × `ROWS × BLOCK`.

## Conventions

- No package manager, no transpiler, no framework. Keep it that way unless asked.
- Strict mode (`'use strict'`) at top of `game.js`. Match this style in any new file.
- Spanish UI copy in `index.html`/`style.css` (e.g. `Reiniciar`, `Puntuación`). Keep user-facing strings in Spanish.
- Identifiers and code comments stay in English.
- No tests, no CI. Manual smoke test in browser is the verification path.
- No `Co-Authored-By` or AI attribution in commits.
