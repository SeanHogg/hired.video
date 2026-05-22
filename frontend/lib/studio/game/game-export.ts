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
 *   - `runtime.js` — a self-executing IIFE port of
 *     `lib/studio/game/runtime.ts` that runs without any module-loader
 *     dependency. Single-source the behavior interpreter so editor
 *     playtest + exported bundle behave identically. (Future passes
 *     can swap this for a pre-bundled Phaser core.)
 *
 * Phase 1 ships a tiny standalone runtime literally inlined as a JS
 * string so the bundle has zero external deps and runs on any web
 * host (itch.io / GitHub Pages / S3 / local file://). When the Phaser
 * integration lands (#935 continuation), this module swaps the inlined
 * runtime for the Phaser-bundled equivalent, contract unchanged.
 */

import JSZip from "jszip";
import type { GameState } from "@shared/game-state";

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
  zip.file("runtime.js", STANDALONE_RUNTIME_JS);
  zip.file("index.html", indexHtml(title, state.width, state.height));

  return zip.generateAsync({ type: "blob" });
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ────────────────────────────────────────────────────────────────────────────
// Standalone runtime — a self-executing IIFE that exports `runGame` on
// `window.__hiredVideoGame`. This is the PORTABLE twin of
// `lib/studio/game/runtime.ts`; behaviors stay identical so editor
// playtest + bundled play look the same. When the Phaser integration
// lands (#935 continuation), this string gets replaced with the
// Phaser-bundled equivalent and the bundle contract is unchanged.
//
// Kept as an inlined string (vs. a build step that compiles + ships
// a separate JS file) so the export module has zero build-system
// integration — `bundleGame()` runs entirely client-side via JSZip.
// ────────────────────────────────────────────────────────────────────────────

const STANDALONE_RUNTIME_JS = String.raw`(function(){
"use strict";
function findStartLevel(state){
  if(!state.levels.length)return null;
  return state.levels.find(function(l){return l.id===state.startLevelId;})||state.levels[0];
}
function tintForBehavior(b){
  switch(b){
    case "platformer-player": return {fill:"#fbbf24",text:"#78350f"};
    case "scroll-left":       return {fill:"#ef4444",text:"#fff"};
    case "static":            return {fill:"#475569",text:"#e2e8f0"};
    case "quiz-answer":       return {fill:"#6366f1",text:"#e0e7ff"};
    case "memory-card":       return {fill:"#10b981",text:"#fff"};
    default:                  return {fill:"#64748b",text:"#fff"};
  }
}
function updateSprite(s, dt, keys, worldWidth){
  var b = s.source.behavior;
  if(!b) return;
  if(b==="platformer-player"){
    var runSpeed = (s.source.params&&s.source.params.runSpeed)||200;
    var jumpPower = (s.source.params&&s.source.params.jumpPower)||500;
    var gravity = 1400;
    var groundY = s.source.y;
    if(keys.has("ArrowLeft")||keys.has("a")) s.x -= runSpeed*dt;
    if(keys.has("ArrowRight")||keys.has("d")) s.x += runSpeed*dt;
    var onGround = s.y >= groundY - 0.01;
    if((keys.has("ArrowUp")||keys.has(" ")||keys.has("w")) && onGround) s.vy = -jumpPower;
    s.vy += gravity*dt;
    s.y += s.vy*dt;
    if(s.y > groundY){ s.y = groundY; s.vy = 0; }
    return;
  }
  if(b==="scroll-left"){
    var speed = (s.source.params&&s.source.params.speed)||200;
    s.x -= speed*dt;
    if(s.x + s.source.width < 0) s.x = worldWidth;
    return;
  }
}
function drawFrame(ctx, level, sprites){
  ctx.fillStyle = level.backgroundColor;
  ctx.fillRect(0,0,ctx.canvas.width, ctx.canvas.height);
  for(var i=0;i<sprites.length;i++){
    var s = sprites[i];
    var tint = tintForBehavior(s.source.behavior);
    ctx.fillStyle = tint.fill;
    if(s.source.behavior==="memory-card" && !s.flipped) ctx.fillStyle="#1e293b";
    if(s.source.behavior==="quiz-answer" && s.picked) ctx.fillStyle = (s.source.params&&s.source.params.correct)?"#10b981":"#ef4444";
    ctx.fillRect(s.x, s.y, s.source.width, s.source.height);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(s.x, s.y, s.source.width, s.source.height);
    ctx.fillStyle = tint.text;
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(s.source.id, s.x+8, s.y+6);
    if(s.source.behavior){
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(s.source.behavior, s.x+8, s.y+22);
    }
  }
}
function runGame(canvas, state, opts){
  var level = findStartLevel(state);
  if(!level) return { cleanup: function(){} };
  canvas.width = state.width;
  canvas.height = state.height;
  var ctx = canvas.getContext("2d");
  if(!ctx) return { cleanup: function(){} };
  var sprites = level.sprites.map(function(src){
    return { source: src, x: src.x, y: src.y, vy: 0, flipped: false, picked: false };
  });
  var keys = new Set();
  function onKeyDown(e){ keys.add(e.key); }
  function onKeyUp(e){ keys.delete(e.key); }
  function onClick(e){
    var rect = canvas.getBoundingClientRect();
    var sx = (e.clientX - rect.left)*(canvas.width/rect.width);
    var sy = (e.clientY - rect.top)*(canvas.height/rect.height);
    for(var i=sprites.length-1; i>=0; i--){
      var s = sprites[i];
      if(sx>=s.x && sx<=s.x+s.source.width && sy>=s.y && sy<=s.y+s.source.height){
        if(s.source.behavior==="memory-card") s.flipped = !s.flipped;
        if(s.source.behavior==="quiz-answer") s.picked = true;
        break;
      }
    }
  }
  if(opts.mode === "play"){
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("click", onClick);
  }
  var rafId = 0;
  var lastTs = performance.now();
  function tick(ts){
    var dt = Math.min(0.05, (ts-lastTs)/1000);
    lastTs = ts;
    if(opts.mode === "play"){
      for(var i=0;i<sprites.length;i++) updateSprite(sprites[i], dt, keys, canvas.width);
    }
    drawFrame(ctx, level, sprites);
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
  return {
    cleanup: function(){
      cancelAnimationFrame(rafId);
      if(opts.mode === "play"){
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        canvas.removeEventListener("click", onClick);
      }
    }
  };
}
window.__hiredVideoGame = { runGame: runGame };
})();
`;
