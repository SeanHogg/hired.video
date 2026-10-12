/**
 * CTA export fallback (#2312): a downloaded / posted file has no click
 * overlay, so for the `"export"` render target the CTA card paints its
 * readable link and, when the card is big enough, a QR of the full
 * UTM-baked URL. The interactive target (editor stage, watch page) draws
 * the card unchanged. Fixtures are real CanvasStates emitted through the
 * same `canvasStateToTimeline` the save + export use.
 *
 * Run: vitest run lib/studio/widgets/__tests__/cta-export-fallback.test.ts
 */
import { describe, expect, it } from "vitest";
import { encode } from "uqr";
import { defaultWidget, emptyCanvasState, type CanvasState, type CtaWidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { bakeCampaignUtmIntoTimeline, type CampaignUtm } from "@shared/campaign-utm";
import { CTA_EFFECT_KIND } from "@shared/cta-hotzones";
import type { Timeline } from "@shared/timeline";
import { NO_LOOKUPS, type DrawEnv, type DrawOp } from "../draw-ops";
import type { Box } from "../frame";
import type { RenderTarget } from "../plugin";
import { stampExportTarget, timelineNeedsQr, withExportTarget } from "../export-target";
import { cachedQrMatrix } from "../qr-encoder";
import { RENDER_TARGET_PARAM, WIDGET_PLUGINS, renderContextFromParams } from "../registry";
import { QR_MIN_MODULE_PX, qrOps, readableUrl } from "../plugins/cta-export-fallback";

const PROFILE_URL = "https://www.hired.video/people/maria-alvarez?ref=reel";
/** The UTM fields of a live campaign row (#1138). */
const FALL_LAUNCH: CampaignUtm = { utmSource: "linkedin", utmMedium: "video", utmCampaign: "fall-launch-2026" };
/** A 1920×1080 export: the default CTA box (0.7 × 0.4 of the frame). */
const LARGE: Box = { x: 288, y: 324, w: 1344, h: 432 };
/** A corner badge-sized CTA: too small for a scannable QR. */
const SMALL: Box = { x: 40, y: 40, w: 300, h: 120 };

const cta = WIDGET_PLUGINS.cta;

function ctaParams(over: Partial<CtaWidgetParams> = {}) {
  return cta.parse({
    headline: "Hiring a senior product designer?",
    subheadline: "8 years shipping B2B SaaS · Remote, EST",
    ctaText: "View my profile",
    ctaUrl: PROFILE_URL,
    bgColor: "#0f172a",
    textColor: "#f8fafc",
    accentColor: "#7c3aed",
    accentTextColor: "#ffffff",
    cardFontPx: 40,
    ctaFontPx: 24,
    ...over,
  });
}

interface EnvRecord {
  env: DrawEnv;
  qrPayloads: string[];
}

function env(target: RenderTarget): EnvRecord {
  const qrPayloads: string[] = [];
  return {
    qrPayloads,
    env: {
      render: { fontFamily: "Inter, sans-serif", target },
      canvas: { width: 1920, height: 1080 },
      clipTimeSec: 0,
      clipDurationSec: 5,
      // Deterministic metrics: 0.55em per character.
      measure: (font) => {
        const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
        return (s) => s.length * px * 0.55;
      },
      t: (key) => key,
      lookups: {
        ...NO_LOOKUPS,
        qrMatrix: (text) => {
          qrPayloads.push(text);
          return encode(text, { ecc: "M", border: 0 }).data;
        },
      },
    },
  };
}

const texts = (ops: DrawOp[]) => ops.flatMap((o) => (o.op === "text" ? [o.text] : []));
function rectFilled(ops: DrawOp[], fill: string): Box {
  const op = ops.find((o) => o.op === "rect" && o.fill === fill);
  if (!op || op.op !== "rect") throw new Error(`no rect filled ${fill}`);
  return op.box;
}
const qrPaths = (ops: DrawOp[]) => ops.filter((o): o is Extract<DrawOp, { op: "path" }> => o.op === "path" && o.fill === "#000000");

describe("CTA export fallback — draw ops by target", () => {
  it("a large card exports the readable link AND a QR of the full URL", () => {
    const { env: e, qrPayloads } = env("export");
    const ops = cta.draw(ctaParams(), LARGE, e);
    expect(texts(ops)).toContain("hired.video/people/maria-alvarez?ref=reel");
    const [path] = qrPaths(ops);
    expect(path?.d.length).toBeGreaterThan(0);
    expect(qrPayloads).toEqual([PROFILE_URL]);
    // The QR sits inside the card, right of the text stack.
    const quiet = rectFilled(ops, "#ffffff");
    const button = rectFilled(ops, "#7c3aed");
    expect(quiet.x + quiet.w).toBeLessThanOrEqual(LARGE.x + LARGE.w);
    expect(button.x + button.w).toBeLessThan(quiet.x);
  });

  it("a small card exports the link text only (no QR)", () => {
    const ops = cta.draw(ctaParams({ cardFontPx: 14, ctaFontPx: 11, subheadline: undefined }), SMALL, env("export").env);
    expect(texts(ops).some((t) => t.startsWith("hired.video/"))).toBe(true);
    expect(qrPaths(ops)).toEqual([]);
  });

  it("the interactive target draws the card unchanged (no extra ops)", () => {
    const { env: interactive, qrPayloads } = env("interactive");
    const ops = cta.draw(ctaParams(), LARGE, interactive);
    expect(ops).toEqual(cta.draw(ctaParams({ exportFallback: false }), LARGE, env("export").env));
    expect(texts(ops).some((t) => t.includes("hired.video"))).toBe(false);
    expect(qrPaths(ops)).toEqual([]);
    expect(qrPayloads).toEqual([]);
  });

  it("the owner's toggle off exports no extra ops", () => {
    const off = ctaParams({ exportFallback: false });
    expect(cta.draw(off, LARGE, env("export").env)).toEqual(cta.draw(off, LARGE, env("interactive").env));
    expect(cta.assets(off).qrCodes).toEqual([]);
  });

  it("a CTA without a link exports nothing extra", () => {
    const unlinked = ctaParams({ ctaUrl: "   " });
    expect(cta.draw(unlinked, LARGE, env("export").env)).toEqual(cta.draw(unlinked, LARGE, env("interactive").env));
  });

  it("an unencodable URL degrades to text only", () => {
    const { env: e } = env("export");
    const noQr: DrawEnv = { ...e, lookups: { ...e.lookups, qrMatrix: () => null } };
    const ops = cta.draw(ctaParams(), LARGE, noQr);
    expect(texts(ops)).toContain("hired.video/people/maria-alvarez?ref=reel");
    expect(qrPaths(ops)).toEqual([]);
  });
});

describe("exportFallback param — emit / parse", () => {
  it("round-trips the opt-out", () => {
    const off = ctaParams({ exportFallback: false });
    const emitted = cta.emit(off);
    expect(emitted.exportFallback).toBe(false);
    expect(cta.parse(emitted)).toEqual(off);
  });

  it("emits nothing for the default (on), so existing saves keep their hash", () => {
    const on = ctaParams();
    expect("exportFallback" in cta.emit(on)).toBe(false);
    expect(cta.parse(cta.emit(ctaParams({ exportFallback: true }))).data).not.toHaveProperty("exportFallback");
  });

  it("ignores a malformed saved value (treated as on)", () => {
    const parsed = cta.parse({ ...cta.emit(ctaParams()), exportFallback: "no" });
    expect(parsed.kind === "cta" && parsed.data.exportFallback).toBeUndefined();
  });
});

function ctaReel(url: string): CanvasState {
  const state = emptyCanvasState({ width: 1920, height: 1080, fps: 30 });
  const w = defaultWidget("cta");
  if (w.params.kind === "cta") w.params.data.ctaUrl = url;
  w.position = { x: 0.15, y: 0.3, width: 0.7, height: 0.4, z: 3, rotation: 0 };
  state.scenes[0].widgets = [defaultWidget("heading"), w];
  return state;
}

function ctaEffectParams(timeline: Timeline): Record<string, unknown> {
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      const effect = clip.effects?.find((e) => e.kind === CTA_EFFECT_KIND);
      if (effect) return effect.params;
    }
  }
  throw new Error("no CTA effect");
}

describe("export target on the Timeline", () => {
  it("the saved Timeline is interactive; the stamped render copy is export", () => {
    const saved = canvasStateToTimeline(ctaReel(PROFILE_URL));
    expect(RENDER_TARGET_PARAM in ctaEffectParams(saved)).toBe(false);
    expect(renderContextFromParams(ctaEffectParams(saved)).target).toBe("interactive");
    const stamped = stampExportTarget(saved);
    expect(renderContextFromParams(ctaEffectParams(stamped)).target).toBe("export");
    // The saved Timeline is never mutated.
    expect(RENDER_TARGET_PARAM in ctaEffectParams(saved)).toBe(false);
  });

  it("the QR encodes the UTM-baked URL", async () => {
    const baked = await withExportTarget(bakeCampaignUtmIntoTimeline(canvasStateToTimeline(ctaReel(PROFILE_URL)), FALL_LAUNCH));
    const params = ctaEffectParams(baked);
    const { env: e, qrPayloads } = env("export");
    const ops = cta.draw(cta.parse(params), LARGE, { ...e, render: renderContextFromParams(params) });
    expect(qrPaths(ops).length).toBe(1);
    const [payload] = qrPayloads;
    const url = new URL(payload);
    expect(url.searchParams.get("utm_source")).toBe("linkedin");
    expect(url.searchParams.get("utm_medium")).toBe("video");
    expect(url.searchParams.get("utm_campaign")).toBe("fall-launch-2026");
    expect(url.searchParams.get("ref")).toBe("reel");
    // The readable line drops the UTMs (the QR carries them).
    expect(texts(ops)).toContain("hired.video/people/maria-alvarez?ref=reel");
    // `withExportTarget` loaded the lazy encoder the export painter reads.
    expect(cachedQrMatrix(payload)).not.toBeNull();
  });

  it("needs the QR encoder only when a CTA exports a link", () => {
    expect(timelineNeedsQr(canvasStateToTimeline(ctaReel(PROFILE_URL)))).toBe(true);
    expect(timelineNeedsQr(canvasStateToTimeline(ctaReel("")))).toBe(false);
  });
});

describe("readableUrl", () => {
  it.each([
    ["https://www.hired.video/people/maria-alvarez/", "hired.video/people/maria-alvarez"],
    ["https://hired.video/?utm_source=linkedin&utm_medium=video", "hired.video"],
    ["https://jobs.example.com/apply?id=42&utm_campaign=fall", "jobs.example.com/apply?id=42"],
    ["mailto:maria@example.com", "mailto:maria@example.com"],
    ["not a url", "not a url"],
  ])("%s → %s", (input, expected) => {
    expect(readableUrl(input)).toBe(expected);
  });
});

describe("qrOps", () => {
  const matrix = encode(PROFILE_URL, { ecc: "M", border: 0 }).data;

  it("lays modules on a whole-pixel grid centred in the box", () => {
    const [quiet, path] = qrOps(matrix, { x: 10, y: 20, w: 300, h: 300 });
    expect(quiet.op).toBe("rect");
    expect(path.op).toBe("path");
    if (quiet.op !== "rect") return;
    expect(Number.isInteger(quiet.box.w / (matrix.length + 4))).toBe(true);
    expect(quiet.box.x).toBeGreaterThanOrEqual(10);
    expect(quiet.box.x + quiet.box.w).toBeLessThanOrEqual(310);
  });

  it("returns nothing below the scannable module size", () => {
    const tooSmall = (matrix.length + 4) * QR_MIN_MODULE_PX - 1;
    expect(qrOps(matrix, { x: 0, y: 0, w: tooSmall, h: tooSmall })).toEqual([]);
  });
});

describe("linked-content card — CTA link + export fallback", () => {
  const linked = WIDGET_PLUGINS["linked-content"];
  const JOB_PAGE = "https://hired.video/jobs/senior-product-designer-remote";

  function boundCard(over: Record<string, unknown> = {}) {
    const w = defaultWidget("linked-content");
    if (w.params.kind !== "linked-content") throw new Error("kind");
    return linked.parse({ ...linked.emit(w.params), entityKind: "job", entityId: "senior-product-designer-remote", ctaUrl: JOB_PAGE, ...over });
  }
  /** The ops the export paints for the card (the embed's fallback). */
  const exportedOps = (ops: DrawOp[]) => ops.flatMap((o) => (o.op === "embed" ? o.fallback : [o]));

  it("emits the entity's public page as its ctaUrl; parse keeps only a different (baked) link", () => {
    const card = boundCard();
    expect(linked.emit(card).ctaUrl).toBe(JOB_PAGE);
    expect(card.kind === "linked-content" && card.data.ctaUrl).toBeUndefined();
    const baked = boundCard({ ctaUrl: `${JOB_PAGE}?utm_source=linkedin` });
    expect(baked.kind === "linked-content" && baked.data.ctaUrl).toBe(`${JOB_PAGE}?utm_source=linkedin`);
    expect(linked.parse(linked.emit(boundCard({ exportFallback: false })))).toEqual(boundCard({ exportFallback: false }));
  });

  it("an export paints the readable link and a QR; the interactive card adds neither", () => {
    const { env: exp, qrPayloads } = env("export");
    const exported = exportedOps(linked.draw(boundCard(), LARGE, exp));
    expect(texts(exported)).toContain("hired.video/jobs/senior-product-designer-remote");
    expect(qrPaths(exported)).toHaveLength(1);
    expect(qrPayloads).toEqual([JOB_PAGE]);

    const interactive = exportedOps(linked.draw(boundCard(), LARGE, env("interactive").env));
    expect(texts(interactive).some((t) => t.startsWith("hired.video/"))).toBe(false);
    expect(qrPaths(interactive)).toEqual([]);
  });

  it("the toggle off or an unbound card exports the plain card", () => {
    const off = boundCard({ exportFallback: false });
    expect(linked.draw(off, LARGE, env("export").env)).toEqual(linked.draw(off, LARGE, env("interactive").env));
    expect(linked.assets(off).qrCodes).toEqual([]);
    const unbound = defaultWidget("linked-content").params;
    expect(linked.draw(unbound, LARGE, env("export").env)).toEqual(linked.draw(unbound, LARGE, env("interactive").env));
  });

  it("the QR encodes the campaign-baked page", async () => {
    const state = emptyCanvasState({ width: 1920, height: 1080, fps: 30 });
    const w = defaultWidget("linked-content");
    if (w.params.kind === "linked-content") {
      w.params.data.entityKind = "job";
      w.params.data.entityId = "senior-product-designer-remote";
    }
    state.scenes[0].widgets = [w];
    const baked = await withExportTarget(bakeCampaignUtmIntoTimeline(canvasStateToTimeline(state), FALL_LAUNCH));
    const params = baked.tracks.flatMap((t) => t.clips).flatMap((c) => c.effects ?? []).find((e) => e.kind === "canvas-v2:linked-content")?.params;
    if (!params) throw new Error("no linked-content effect");
    const { env: e, qrPayloads } = env("export");
    linked.draw(linked.parse(params), LARGE, { ...e, render: renderContextFromParams(params) });
    expect(new URL(qrPayloads[0]).searchParams.get("utm_campaign")).toBe("fall-launch-2026");
  });
});
