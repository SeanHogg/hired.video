/**
 * The engagement-asset export painter: localized kind label (never the
 * hardcoded English), titles refreshed on every preload (renames repaint,
 * deleted assets drop), and a ring alpha that works for any CSS colour.
 *
 * Run: vitest run lib/timeline/__tests__/engagement-asset-painter.test.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Timeline } from "@shared/timeline";

const h = vi.hoisted(() => ({
  forms: [] as Array<{ id: string; title: string; positionSeconds: number; fields: unknown[]; requireToContinue: boolean }>,
  failForms: false,
}));

vi.mock("@/lib/services/studio-features-service", () => ({
  listVideoForms: async () => {
    if (h.failForms) throw new Error("offline");
    return h.forms;
  },
  getChapters: async () => [],
  listThumbnails: async () => [],
  getProjectComments: async () => [],
}));

import i18n from "@/lib/i18n/i18n";
import "@/lib/timeline/effects";
import { getEffectDefinition, type EffectContext } from "@/lib/timeline/effects/registry";
import { ENGAGEMENT_ASSET_EFFECT, engagementAssetRefs, preloadEngagementTitles } from "@/lib/timeline/effects/engagement-asset";
import { getEngagementAssetMeta } from "@/lib/studio/editor-v2/engagement-assets";

const params = (over: Record<string, unknown> = {}) => ({
  x: 0, y: 0, width: 1, height: 1, assetKind: "video-form", assetId: "f1", textColor: "rgb(10, 20, 30)", ...over,
});

const timelineWith = (...effects: Array<Record<string, unknown>>): Timeline =>
  ({ tracks: [{ clips: [{ effects: effects.map((p) => ({ kind: ENGAGEMENT_ASSET_EFFECT, params: p })) }] }] }) as unknown as Timeline;

interface Painted {
  texts: string[];
  strokes: Array<{ style: unknown; alpha: unknown }>;
}

/** A recording 2D context (state props are plain fields; save/restore stack them). */
function paint(effectParams: Record<string, unknown>): Painted {
  const painted: Painted = { texts: [], strokes: [] };
  const state: Record<string, unknown> = { globalAlpha: 1 };
  const stack: Array<Record<string, unknown>> = [];
  const methods: Record<string, (...a: unknown[]) => unknown> = {
    save: () => stack.push({ ...state }),
    restore: () => Object.assign(state, stack.pop() ?? {}),
    fillText: (t) => painted.texts.push(String(t)),
    stroke: () => painted.strokes.push({ style: state.strokeStyle, alpha: state.globalAlpha }),
    measureText: () => ({ width: 1 }),
  };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (typeof prop === "string" && prop in methods) return methods[prop];
      if (prop in target) return target[prop as string];
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  }) as unknown as EffectContext["ctx"];
  const canvas = { width: 400, height: 300 } as unknown as HTMLCanvasElement;
  const def = getEffectDefinition(ENGAGEMENT_ASSET_EFFECT);
  if (!def) throw new Error("painter not registered");
  def.apply({ kind: ENGAGEMENT_ASSET_EFFECT, params: effectParams }, { ctx, canvas, timelineFrame: 0, clipFrame: 0, clipDurationFrames: 30, fps: 30 });
  return painted;
}

beforeEach(() => {
  h.forms = [];
  h.failForms = false;
});

describe("engagement-asset painter", () => {
  it("paints the localized kind label from labelKey", () => {
    const { labelKey } = getEngagementAssetMeta("video-form");
    expect(labelKey).toBe("studio.engagementAsset.label.videoForm");
    expect(paint(params({ assetId: "" })).texts).toEqual([i18n.t(labelKey)]);
  });

  it("draws the ring in the text colour at reduced alpha (works for rgb(), not just #rrggbb)", () => {
    const { strokes } = paint(params());
    expect(strokes).toEqual([{ style: "rgb(10, 20, 30)", alpha: 0.25 }]);
  });

  it("lists the bound assets of a timeline, ignoring unbound / unknown ones", () => {
    const refs = engagementAssetRefs(timelineWith(params(), params({ assetId: "" }), params({ assetKind: "nope", assetId: "x" })));
    expect([...refs]).toEqual([["video-form", new Set(["f1"])]]);
  });

  it("refreshes titles on every preload: a rename repaints, a deleted asset drops", async () => {
    const timeline = timelineWith(params());
    h.forms = [{ id: "f1", title: "Lead form", positionSeconds: 0, fields: [], requireToContinue: false }];
    await preloadEngagementTitles("p1", timeline);
    expect(paint(params()).texts[1]).toBe("Lead form");

    h.forms = [{ id: "f1", title: "Renamed", positionSeconds: 0, fields: [], requireToContinue: false }];
    await preloadEngagementTitles("p1", timeline);
    expect(paint(params()).texts[1]).toBe("Renamed");

    // A failed listing keeps the last good title.
    h.failForms = true;
    await preloadEngagementTitles("p1", timeline);
    expect(paint(params()).texts[1]).toBe("Renamed");

    h.failForms = false;
    h.forms = [];
    await preloadEngagementTitles("p1", timeline);
    expect(paint(params()).texts).toHaveLength(1);
  });

  it("does nothing without a project", async () => {
    h.forms = [{ id: "f2", title: "Never fetched", positionSeconds: 0, fields: [], requireToContinue: false }];
    await preloadEngagementTitles(null, timelineWith(params({ assetId: "f2" })));
    expect(paint(params({ assetId: "f2" })).texts).toHaveLength(1);
  });
});
