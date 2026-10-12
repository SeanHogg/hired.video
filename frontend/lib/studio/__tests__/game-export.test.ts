/**
 * Game-export unit tests — locks the IIFE wrap + ZIP layout that ships in
 * every downloaded game bundle. The wrap is the ONE place runtime-core's
 * source is reshaped; a regression here ships a broken `runtime.js`
 * inside every export and the user only discovers it after they upload
 * to itch.io / GitHub Pages.
 *
 * Coverage:
 *   - `buildStandaloneRuntimeJs()` wraps source in an IIFE, strips
 *     `export` keywords, exposes runGame on window.
 *   - Behavior dispatchers (tintForBehavior / updateSprite / drawFrame /
 *     runGame) all appear in the bundled JS — proves the SoT is the
 *     in-app runtime-core, not a parallel copy.
 *   - `bundleGame()` produces a ZIP with the documented entries.
 *
 * Run: vitest run lib/studio/__tests__/game-export.test.ts
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  buildStandaloneRuntimeJs,
  bundleGame,
} from "@/lib/studio/game/game-export";
import { emptyGameState } from "@shared/game-state";

describe("buildStandaloneRuntimeJs", () => {
  const js = buildStandaloneRuntimeJs();

  it("wraps the source in an IIFE", () => {
    expect(js.startsWith("(function(){")).toBe(true);
    expect(js.trimEnd().endsWith("})();")).toBe(true);
  });

  it("strips every `export` keyword so the inner function declarations land in IIFE scope", () => {
    // The regex transform targets ^export\s+ — leaving even one would
    // produce a SyntaxError when the browser parses the bundle (since
    // `export` is only legal inside an ES module).
    expect(/^export\s/m.test(js)).toBe(false);
  });

  it("exposes runGame on window.__hiredVideoGame so the index.html loader can find it", () => {
    // The loader in index.html calls
    // `window.__hiredVideoGame.runGame(canvas, state, { mode: 'play' })`.
    // The bundle MUST set this global.
    expect(js).toContain("window.__hiredVideoGame");
    expect(js).toContain("runGame: runGame");
  });

  it("inlines the behavior dispatcher functions from runtime-core (SoT proof)", () => {
    // If somebody re-introduces a hand-written copy of these functions
    // in a parallel implementation, the assertion that they appear in
    // the *bundled* output still passes — but the function bodies in
    // runtime-core.js would no longer match. The pair of tests
    // here + game-runtime-core.test.ts lock both halves.
    expect(js).toContain("function tintForBehavior");
    expect(js).toContain("function updateSprite");
    expect(js).toContain("function drawFrame");
    expect(js).toContain("function runGame");
    expect(js).toContain("function findStartLevel");
  });

  it("preserves behavior identifiers verbatim so palette / dispatch keys stay in sync with the editor", () => {
    // If a behavior key drifts between in-app and bundle, the export
    // renders wrong colors / mis-dispatches movement. Pin the strings.
    expect(js).toContain('"platformer-player"');
    expect(js).toContain('"scroll-left"');
    expect(js).toContain('"quiz-answer"');
    expect(js).toContain('"memory-card"');
  });

  it("is parseable as JavaScript (no leftover TS syntax leaks in via runtime-core)", () => {
    // `new Function(source)` parses (and would throw on syntax errors)
    // without actually executing the IIFE body — there is no canvas /
    // window in jsdom worth running this against.
    expect(() => new Function(js)).not.toThrow();
  });
});

describe("bundleGame", () => {
  it("emits a ZIP with state.json + runtime.js + index.html", async () => {
    const blob = await bundleGame(emptyGameState(), { title: "Test Game" });
    const zip = await JSZip.loadAsync(blob);

    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["index.html", "runtime.js", "state.json"]);
  });

  it("serializes the GameState verbatim into state.json so the loader can fetch + boot it", async () => {
    const state = emptyGameState({ width: 640, height: 360, fps: 30 });
    const blob = await bundleGame(state);
    const zip = await JSZip.loadAsync(blob);

    const stateJson = await zip.file("state.json")!.async("string");
    const parsed = JSON.parse(stateJson);
    expect(parsed.width).toBe(640);
    expect(parsed.height).toBe(360);
    expect(parsed.fps).toBe(30);
    expect(parsed.levels).toHaveLength(1);
  });

  it("ships the SAME IIFE-wrapped runtime that buildStandaloneRuntimeJs produces", async () => {
    // Single source of truth: bundleGame must not hand-write a
    // different runtime. If a future change forks the two, this fails
    // immediately.
    const blob = await bundleGame(emptyGameState());
    const zip = await JSZip.loadAsync(blob);

    const runtimeJs = await zip.file("runtime.js")!.async("string");
    expect(runtimeJs).toBe(buildStandaloneRuntimeJs());
  });

  it("escapes the title before injecting it into index.html so user names can't break the HTML", async () => {
    // Defensive — project names round-trip from user input; if the
    // export forgot to escape, a `<script>` in the title would execute
    // in the bundle.
    const blob = await bundleGame(emptyGameState(), {
      title: '<script>alert("xss")</script>',
    });
    const zip = await JSZip.loadAsync(blob);
    const html = await zip.file("index.html")!.async("string");

    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("uses the GameState's width/height for the canvas + aspect-ratio CSS", async () => {
    const blob = await bundleGame(emptyGameState({ width: 480, height: 800 }));
    const zip = await JSZip.loadAsync(blob);
    const html = await zip.file("index.html")!.async("string");

    expect(html).toContain('width="480"');
    expect(html).toContain('height="800"');
    expect(html).toContain("aspect-ratio:480 / 800");
  });
});
