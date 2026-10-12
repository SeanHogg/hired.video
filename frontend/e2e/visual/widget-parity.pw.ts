/**
 * Widget pixel parity (#2312): the playback stage the watch page mounts
 * (DOM, `CanvasStage`) and the export compositor (`renderTimelineFrame`)
 * must draw the same Timeline frame. The harness page
 * (widget-parity-harness.tsx) renders every case both ways; this spec
 * screenshots each pair and diffs them in the page (no image dependency).
 *
 * Tolerance: SVG text and canvas `fillText` anti-alias glyph edges a little
 * differently, so a pixel only counts as different past CHANNEL_TOLERANCE
 * AND when a 4-neighbour differs too (isolated AA edge pixels are ignored),
 * and a case passes while at most MAX_MISMATCH of its pixels differ. A
 * geometry, colour or line-break drift moves connected runs of pixels.
 *
 * The harness boxes must not shrink: a CSS-squeezed <canvas> is scaled, which
 * once showed up here as ~3% "text drift" (widget-parity-harness.tsx).
 *
 * Run: npm run test:visual
 */
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const HARNESS = "/e2e/visual/widget-parity.html";
/** Max per-channel delta (0..255) still counted as the same pixel. */
const CHANNEL_TOLERANCE = 64;
/** Share of a case's pixels allowed to differ. */
const MAX_MISMATCH = Number(process.env.VISUAL_MAX_MISMATCH ?? 0.02);

interface Diff {
  /** Share of pixels that differ AND touch another differing pixel. */
  ratio: number;
  /** Share past the channel tolerance before the isolated-pixel filter. */
  rawRatio: number;
  width: number;
  height: number;
  sameSize: boolean;
  /** PNG (base64): the DOM render greyed out, differing pixels in red. */
  diffPng: string;
}

/** Decode both PNGs in the page and count the pixels that differ. */
function diffPngs(page: Page, a: Buffer, b: Buffer): Promise<Diff> {
  return page.evaluate(
    async ({ a64, b64, tolerance }) => {
      const decode = async (base64: string) => {
        const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2D context unavailable");
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [x, y] = await Promise.all([decode(a64), decode(b64)]);
      const sameSize = x.width === y.width && x.height === y.height;
      if (!sameSize) return { ratio: 1, rawRatio: 1, width: x.width, height: x.height, sameSize, diffPng: "" };
      const { width: w, height: h } = x;
      const out = new ImageData(w, h);
      // Pass 1: every pixel past the channel tolerance.
      const over = new Uint8Array(w * h);
      for (let p = 0; p < w * h; p += 1) {
        const i = p * 4;
        const delta = Math.max(
          Math.abs(x.data[i] - y.data[i]),
          Math.abs(x.data[i + 1] - y.data[i + 1]),
          Math.abs(x.data[i + 2] - y.data[i + 2]),
        );
        over[p] = delta > tolerance ? 1 : 0;
      }
      // Pass 2: count a pixel only when a 4-neighbour also differs. Glyph
      // anti-aliasing (SVG text vs fillText) flips isolated edge pixels;
      // real drift (a shifted line, a wider stroke) moves connected runs.
      const at = (px: number, py: number) => (px >= 0 && py >= 0 && px < w && py < h ? over[py * w + px] : 0);
      let raw = 0;
      let differing = 0;
      for (let i = 0; i < x.data.length; i += 4) {
        const p = i / 4;
        const px = p % w;
        const py = (p - px) / w;
        const grey = Math.round((x.data[i] + x.data[i + 1] + x.data[i + 2]) / 3 / 3 + 170);
        raw += over[p];
        const bad = over[p] === 1 && (at(px - 1, py) || at(px + 1, py) || at(px, py - 1) || at(px, py + 1)) === 1;
        if (bad) differing += 1;
        out.data[i] = bad ? 255 : grey;
        out.data[i + 1] = bad ? 0 : grey;
        out.data[i + 2] = bad ? 0 : grey;
        out.data[i + 3] = 255;
      }
      const canvas = new OffscreenCanvas(x.width, x.height);
      canvas.getContext("2d")?.putImageData(out, 0, 0);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      return { ratio: differing / (w * h), rawRatio: raw / (w * h), width: w, height: h, sameSize, diffPng: btoa(bin) };
    },
    { a64: a.toString("base64"), b64: b.toString("base64"), tolerance: CHANNEL_TOLERANCE },
  );
}

test("DOM playback stage and export compositor draw the same frame", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  // `domcontentloaded`, not `load`: readiness is the harness's own flag,
  // set once every export canvas has painted and fonts settled.
  await page.goto(HARNESS, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as unknown as { __parityReady?: boolean }).__parityReady === true, null, {
    timeout: 120_000,
  });

  const cases = await page
    .locator('[data-renderer="dom"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-case") ?? ""));
  expect(cases.length, "harness cases").toBeGreaterThanOrEqual(5);

  for (const id of cases) {
    await test.step(id, async () => {
      const shot = (renderer: "dom" | "canvas") =>
        page.locator(`[data-case="${id}"][data-renderer="${renderer}"]`).screenshot({ animations: "disabled", caret: "hide" });
      const [dom, canvas] = [await shot("dom"), await shot("canvas")];
      const diff = await diffPngs(page, dom, canvas);
      console.log(`[parity] ${id}: ${(diff.ratio * 100).toFixed(2)}% (raw ${(diff.rawRatio * 100).toFixed(2)}%)`);
      if (!diff.sameSize || diff.ratio > MAX_MISMATCH || process.env.VISUAL_SAVE_ALL) {
        // Saved into test-results (and attached) so a failure can be read.
        const files: Array<[string, Buffer]> = [
          [`${id}-dom.png`, dom],
          [`${id}-canvas.png`, canvas],
          [`${id}-diff.png`, Buffer.from(diff.diffPng, "base64")],
        ];
        for (const [name, body] of files) {
          const path = testInfo.outputPath(name);
          writeFileSync(path, body);
          await testInfo.attach(name, { path, contentType: "image/png" });
        }
      }
      expect.soft(diff.sameSize, `${id}: both renders are ${diff.width}×${diff.height}`).toBe(true);
      expect
        .soft(diff.ratio, `${id}: ${(diff.ratio * 100).toFixed(2)}% of pixels differ (max ${MAX_MISMATCH * 100}%)`)
        .toBeLessThanOrEqual(MAX_MISMATCH);
    });
  }

  expect(pageErrors, "uncaught page errors").toEqual([]);
});
