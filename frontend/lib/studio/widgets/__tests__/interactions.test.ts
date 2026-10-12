/**
 * Plugin-declared interactions (#2312) — every clickable playback zone is
 * derived from the Timeline through the widget registry, never from a list
 * of effect kinds. Fixtures are real CanvasStates emitted through the same
 * `canvasStateToTimeline` the save + export use.
 *
 * Run: vitest run lib/studio/widgets/__tests__/interactions.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  defaultWidget,
  emptyCanvasState,
  emptyScene,
  makeEngagementAssetWidget,
  type CanvasState,
  type WidgetKind,
} from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { CTA_EFFECT_KIND, LINKED_CONTENT_EFFECT_KIND, extractCtaHotzones, timedEffectZones } from "@shared/cta-hotzones";
import { bakeCampaignUtmIntoHotzones, bakeCampaignUtmIntoTimeline, type CampaignUtm } from "@shared/campaign-utm";
import type { Timeline } from "@shared/timeline";
import { ENGAGEMENT_ASSET_EFFECT } from "../engagement-asset-params";
import {
  ctaHotzonesOf,
  extractInteractionZones,
  resolveCtaHotzones,
  zonesOfKind,
} from "../interactions";
import { UNIQUE_WIDGET_PLUGINS, WIDGET_PLUGINS } from "../registry";
import { hasInteractiveWidget } from "../use-interaction-zones";

const JOB_URL = "https://hired.video/jobs/senior-product-designer-remote";
const FORM_ID = "3f6c1d2e-8a41-4b6f-9a0e-2d5c7b9e1a44";
const CHAPTER_ID = "a2b9e4c1-5d7f-4e2a-8c3b-6f1d0e9a7b55";
/** The UTM fields of a live campaign row (#1138). */
const FALL_LAUNCH: CampaignUtm = { utmSource: "linkedin", utmMedium: "video", utmCampaign: "fall-launch-2026" };

function ctaWidget(url: string) {
  const w = defaultWidget("cta");
  if (w.params.kind === "cta") w.params.data.ctaUrl = url;
  return w;
}

/** A 1080×1920 "hire me" reel: scene 1 has a headline, a shape and a
 *  linked CTA (2–5 s); scene 2 a lead form + a chapter marker. */
function reel(): CanvasState {
  const state = emptyCanvasState({ width: 1080, height: 1920, fps: 30 });
  const cta = ctaWidget(`  ${JOB_URL}  `);
  cta.visibleFrom = 2;
  cta.visibleTo = 5;
  cta.position = { x: 0.15, y: 0.7, width: 0.7, height: 0.2, z: 3, rotation: 0 };
  state.scenes[0].widgets = [defaultWidget("heading"), defaultWidget("shape-rect"), cta];
  const second = emptyScene("Apply");
  const form = makeEngagementAssetWidget({ assetKind: "video-form", assetId: FORM_ID });
  form.position = { x: 0.1, y: 0.55, width: 0.8, height: 0.3, z: 2, rotation: 0 };
  second.widgets = [form, makeEngagementAssetWidget({ assetKind: "chapter-marker", assetId: CHAPTER_ID })];
  state.scenes.push(second);
  return state;
}

describe("plugin interactions declarations", () => {
  it("only the CTA, linked-content and engagement-asset plugins are interactive", () => {
    expect(UNIQUE_WIDGET_PLUGINS.filter((p) => p.interactive).map((p) => p.effectKind).sort()).toEqual(
      [CTA_EFFECT_KIND, LINKED_CONTENT_EFFECT_KIND, ENGAGEMENT_ASSET_EFFECT].sort(),
    );
  });

  it("a bound linked-content card links to the entity's public page; an unbound one is inert", () => {
    const linked = WIDGET_PLUGINS["linked-content"];
    const bound = defaultWidget("linked-content");
    if (bound.params.kind === "linked-content") {
      bound.params.data.entityKind = "job";
      bound.params.data.entityId = "senior-product-designer-remote";
    }
    expect(linked.interactions(linked.emit(bound.params))).toEqual([{ kind: "cta", url: JOB_URL }]);
    expect(linked.interactions(linked.emit(defaultWidget("linked-content").params))).toEqual([]);
    // The API's hot-zone extraction applies the same rule to the card.
    const state = emptyCanvasState();
    state.scenes[0].widgets = [bound];
    expect(extractCtaHotzones(canvasStateToTimeline(state)).map((z) => z.url)).toEqual([JOB_URL]);
  });

  it("each interactive plugin derives its interaction from its own emitted params", () => {
    const cta = WIDGET_PLUGINS.cta;
    expect(cta.interactions(cta.emit(ctaWidget(JOB_URL).params))).toEqual([{ kind: "cta", url: JOB_URL }]);
    const card = WIDGET_PLUGINS["engagement-asset"];
    const form = makeEngagementAssetWidget({ assetKind: "video-form", assetId: FORM_ID });
    expect(card.interactions(card.emit(form.params))).toEqual([
      { kind: "engagement", assetKind: "video-form", assetId: FORM_ID },
    ]);
  });

  it("every non-interactive kind yields nothing, even with params set", () => {
    for (const kind of Object.keys(WIDGET_PLUGINS) as WidgetKind[]) {
      const plugin = WIDGET_PLUGINS[kind];
      if (plugin.interactive) continue;
      const w = defaultWidget(kind);
      expect(plugin.interactions({ ...plugin.emit(w.params), ctaUrl: JOB_URL, assetId: FORM_ID }), kind).toEqual([]);
    }
  });
});

describe("extractInteractionZones", () => {
  it("derives a zone per interactive widget with its painted box and absolute window", () => {
    const zones = extractInteractionZones(canvasStateToTimeline(reel()));
    const [cta] = zonesOfKind(zones, "cta");
    expect(cta).toEqual({ startSec: 2, endSec: 5, x: 0.15, y: 0.7, w: 0.7, h: 0.2, interaction: { kind: "cta", url: JOB_URL } });
    expect(
      zonesOfKind(zones, "engagement")
        .map((z) => [z.interaction.assetKind, z.interaction.assetId, z.startSec])
        .sort(),
    ).toEqual([
      ["chapter-marker", CHAPTER_ID, 5],
      ["video-form", FORM_ID, 5],
    ]);
    expect(zones).toHaveLength(3);
    expect(hasInteractiveWidget(reel())).toBe(true);
  });

  it("a canvas of only non-interactive kinds, an unlinked CTA or an unbound card yields nothing", () => {
    const state = emptyCanvasState();
    state.scenes[0].widgets = [
      ...(Object.keys(WIDGET_PLUGINS) as WidgetKind[]).map((k) => defaultWidget(k)),
      ctaWidget("   "),
    ];
    expect(hasInteractiveWidget(state)).toBe(false);
    expect(extractInteractionZones(canvasStateToTimeline(state))).toEqual([]);
  });

  it("a widget whose visible window collapses emits no clip and so no zone", () => {
    const state = emptyCanvasState();
    const cta = ctaWidget(JOB_URL);
    cta.visibleFrom = 3;
    cta.visibleTo = 3;
    state.scenes[0].widgets = [cta];
    expect(extractInteractionZones(canvasStateToTimeline(state))).toEqual([]);
  });

  it("tolerates missing, malformed and foreign timelines", () => {
    expect(extractInteractionZones(null)).toEqual([]);
    expect(extractInteractionZones(undefined)).toEqual([]);
    expect(extractInteractionZones({ tracks: "nope" } as never)).toEqual([]);
    const foreign = {
      fps: 30,
      tracks: [
        {
          id: "v2",
          kind: "video",
          clips: [
            // Unknown / non-string kinds and a zero-length clip are skipped.
            { id: "a", startFrame: 0, durationFrames: 30, effects: [{ kind: "nle:lut", params: { ctaUrl: JOB_URL } }] },
            { id: "b", startFrame: 0, durationFrames: 30, effects: [{ kind: 42, params: {} }] },
            { id: "c", startFrame: 0, durationFrames: 0, effects: [{ kind: CTA_EFFECT_KIND, params: { ctaUrl: JOB_URL } }] },
          ],
        },
      ],
    } as unknown as Timeline;
    expect(extractInteractionZones(foreign)).toEqual([]);
  });
});

describe("CTA zones keep the API's public payload shape and UTMs", () => {
  it("client-derived CTA zones equal the API's extractCtaHotzones on the same Timeline", () => {
    const timeline = canvasStateToTimeline(reel());
    expect(ctaHotzonesOf(extractInteractionZones(timeline))).toEqual(extractCtaHotzones(timeline));
  });

  it("the public payload's UTM-baked hot-zones win over the derived ones", () => {
    const timeline = canvasStateToTimeline(reel());
    const publicZones = bakeCampaignUtmIntoHotzones(extractCtaHotzones(timeline), FALL_LAUNCH);
    const baked = `${JOB_URL}?utm_source=linkedin&utm_medium=video&utm_campaign=fall-launch-2026`;
    expect(publicZones.map((z) => z.url)).toEqual([baked]);
    const derived = extractInteractionZones(timeline);
    expect(resolveCtaHotzones(derived, publicZones).map((z) => z.url)).toEqual([baked]);
    // No payload (editor preview, marketplace) → derived, un-tagged.
    expect(resolveCtaHotzones(derived, undefined).map((z) => z.url)).toEqual([JOB_URL]);
    // An empty payload list is authoritative too (legacy project, no CTAs).
    expect(resolveCtaHotzones(derived, [])).toEqual([]);
  });

  it("a UTM-baked Timeline (export bake) derives the baked URL", () => {
    const baked = bakeCampaignUtmIntoTimeline(canvasStateToTimeline(reel()), FALL_LAUNCH);
    expect(ctaHotzonesOf(extractInteractionZones(baked))[0].url).toContain("utm_campaign=fall-launch-2026");
  });
});

describe("timedEffectZones (shared walk)", () => {
  it("accepts one kind or a predicate and reports each effect's kind", () => {
    const timeline = canvasStateToTimeline(reel());
    expect(timedEffectZones(timeline, CTA_EFFECT_KIND).map((z) => z.effectKind)).toEqual([CTA_EFFECT_KIND]);
    const both = timedEffectZones(timeline, (k) => k === CTA_EFFECT_KIND || k === ENGAGEMENT_ASSET_EFFECT);
    expect(both).toHaveLength(3);
    expect(timedEffectZones(timeline, () => false)).toEqual([]);
  });
});
