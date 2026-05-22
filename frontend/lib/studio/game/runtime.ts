/**
 * Game runtime — TS re-export shim over the plain-JS `runtime-core.js`.
 *
 * The interpreter + canvas shell live in `runtime-core.js` (the actual
 * implementation). This file exists only so existing TS imports
 * (`import { runGame } from ".../game/runtime"`) keep working AND so
 * downstream callers see proper TS types — declared in `runtime-core.d.ts`.
 *
 * Per the DRY rule: there is ONE source of behavior dispatch. The
 * exported HTML5 bundle (`game-export.ts`) reads the SAME `runtime-core.js`
 * via Vite's `?raw` query, so editor playtest and downloaded ZIP execute
 * identical code paths.
 */

export {
  runGame,
  tintForBehavior,
  updateSprite,
  drawFrame,
  findStartLevel,
} from "./runtime-core.js";
export type { RunGameOptions, RunGameHandle, RuntimeSprite } from "./runtime-core.js";
