/**
 * Game export — bundles a `GameState` into a self-contained HTML5
 * playable ZIP. Output profile id = `game-html5-bundle` per
 * `@shared/media-kinds`.
 *
 * Bundle contents:
 *   - `index.html` — minimal page with a fullscreen <canvas> + a
 *     `<script>` tag that loads `runtime.js` then boots the game
 *     against the embedded state.
 *   - `state.json` — the `GameState` serialized verbatim.
 *   - `runtime.js` — the SAME `runtime-core.js` module the editor's
 *     `<GameStage>` runs (read here via Vite's `?raw` query and wrapped
 *     in an IIFE so it works without a module loader). Single source of
 *     truth → editor playtest + exported bundle execute identical code.
 *
 * The IIFE wrap is the ONE divergence between the two consumers:
 *   - in-app: imports `runGame` from `./runtime` (ES modules)
 *   - bundle: assigns `window.__hiredVideoGame = { runGame }` so the
 *     loader script in `index.html` can call it from a non-module
 *     `<script>` tag (works under file:// without a server).
 *
 * Per the DRY rule: ZERO duplication of behavior dispatch. Any change to
 * behaviors / drawing / runtime shell lands in one place
 * (`runtime-core.js`) and both surfaces pick it up.
 */

import JSZip from "jszip";
import type { GameState } from "@shared/game-state";
import { escapeHtml } from "@shared/html-escape";
// Vite's `?raw` returns the file source as a string. Both files are plain JS
// (no TS-only syntax) precisely so this raw text is browser-runnable.
import runtimeCoreSource from "./runtime-core.js?raw";
// Block-interpreter source (gap #1007 — Snap!/Scratch visual-block runtime).
// runtime-core.js imports from block-interp.js for the editor playtest path;
// for the exported bundle the import line is stripped and the two files are
// concatenated into the same IIFE so the exports share closure scope.
import blockInterpSource from "./block-interp.js?raw";

/** Build a ZIP Blob containing a self-contained playable game. The
 *  caller hands the Blob to the existing download / R2-upload paths
 *  (saved exports flow). */
export async function bundleGame(
  state: GameState,
  opts: { title?: string } = {},
): Promise<Blob> {
  const zip = new JSZip();
  const title = opts.title ?? "Game";

  zip.file("state.json", JSON.stringify(state, null, 2));
  zip.file("runtime.js", buildStandaloneRuntimeJs());
  zip.file("index.html", indexHtml(title, state.width, state.height));

  return zip.generateAsync({ type: "blob" });
}

/** Wrap the ES-module `runtime-core.js` source in an IIFE that exposes
 *  `runGame` on `window.__hiredVideoGame`, so the exported bundle works
 *  from a non-module `<script>` tag (which `index.html` uses so the ZIP
 *  works under file:// without a server).
 *
 *  EXPORTED so unit tests can lock the wrap shape — the regex
 *  transform is the only place runtime-core's source is reshaped, so a
 *  regression here silently breaks the exported bundle. */
export function buildStandaloneRuntimeJs(): string {
  // Strip the leading `export ` keywords — the IIFE body lifts each
  // exported declaration into IIFE scope. Source has no re-exports or
  // wildcard exports, so the simple regex is sufficient.
  const strippedInterp = blockInterpSource.replace(/^export\s+/gm, "");
  // runtime-core also strips the `import { ... } from "./block-interp.js";`
  // line — the interp's exports already live in this closure thanks to
  // the concat above. Multi-line import statements are matched too.
  const stripped = runtimeCoreSource
    .replace(/^import\s+[\s\S]*?from\s+["']\.\/block-interp\.js["'];?\s*$/m, "")
    .replace(/^export\s+/gm, "");
  return (
    "(function(){\n" +
    '"use strict";\n' +
    // Block interpreter FIRST so runtime-core's calls resolve at parse time.
    strippedInterp +
    "\n" +
    stripped +
    "\nwindow.__hiredVideoGame = { runGame: runGame };\n" +
    "})();\n"
  );
}

function indexHtml(title: string, w: number, h: number): string {
  // Inlines the loader directly so the bundle works from file://
  // without needing a server. `fetch("./state.json")` works in modern
  // browsers under file:// for relative paths.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    html, body { margin:0; padding:0; background:#0f172a; height:100%; font-family:system-ui,sans-serif; color:#fff; }
    .wrap { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; padding:1rem; box-sizing:border-box; }
    canvas { background:#000; max-width:100%; max-height:100%; aspect-ratio:${w} / ${h}; box-shadow:0 8px 32px rgba(0,0,0,0.4); border-radius:8px; outline:none; }
    .err { background:rgba(244,63,94,0.15); border:1px solid rgba(244,63,94,0.4); padding:1rem 1.25rem; border-radius:8px; max-width:36rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <canvas id="stage" width="${w}" height="${h}" tabindex="0"></canvas>
  </div>
  <script src="runtime.js"></script>
  <script>
    (async function() {
      try {
        const res = await fetch('./state.json');
        if (!res.ok) throw new Error('state.json missing — extract the full ZIP before opening index.html');
        const state = await res.json();
        const canvas = document.getElementById('stage');
        window.__hiredVideoGame.runGame(canvas, state, { mode: 'play' });
        canvas.focus();
      } catch (e) {
        const w = document.querySelector('.wrap');
        w.innerHTML = '<div class="err"><strong>Failed to load:</strong> ' + (e && e.message ? e.message : e) + '</div>';
      }
    })();
  </script>
</body>
</html>`;
}

