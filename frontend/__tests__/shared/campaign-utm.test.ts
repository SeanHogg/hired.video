/**
 * Campaign UTMs baked into CTA URLs (#1138) — the shared rules the export
 * render (`renderCanvasToBlob`) and the public player's hot-zones apply.
 * Campaign fixtures are the `GET /api/studio/campaigns` DTO shape
 * (video_campaigns row + junction-hydrated `projectIds`).
 *
 * Run: vitest run __tests__/shared/campaign-utm.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  appendCampaignUtm,
  bakeCampaignUtmIntoHotzones,
  bakeCampaignUtmIntoTimeline,
  hasCampaignUtm,
  pickProjectCampaign,
} from "@shared/campaign-utm";
import { campaignShareUrlFor } from "@/lib/campaigns/bake-utm";
import { extractCtaHotzones } from "@shared/cta-hotzones";
import { ctaHotzonesOf, extractInteractionZones } from "@/lib/studio/widgets/interactions";
import {
  emptyCanvasState,
  defaultWidget,
  makeEngagementAssetWidget,
} from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import type { VideoCampaign } from "@/lib/services/studio-service";

const PROJECT_ID = "7d3e2f10-4b5a-4c6d-8e9f-0a1b2c3d4e5f";
const OTHER_PROJECT = "11111111-2222-4333-8444-555555555555";

const fallLaunch: VideoCampaign = {
  id: "9b0f6c2a-1d3e-4f5a-8b7c-6d5e4f3a2b1c",
  userId: "user_2xKq9",
  name: "Fall launch — LinkedIn",
  description: "Pitch video pushed to hiring managers",
  utmSource: "linkedin",
  utmMedium: "video",
  utmCampaign: "fall-launch-2026",
  status: "active",
  projectIds: [PROJECT_ID, OTHER_PROJECT],
  createdAt: "2026-09-01T15:04:05.000Z",
  updatedAt: "2026-10-05T10:00:00.000Z",
};
const newsletter: VideoCampaign = {
  ...fallLaunch,
  id: "0c1d2e3f-4a5b-4c6d-9e8f-7a6b5c4d3e2f",
  name: "October newsletter",
  utmSource: "newsletter",
  utmMedium: "email",
  utmCampaign: "oct-2026",
  updatedAt: "2026-10-09T08:30:00.000Z",
};
const pausedNewer: VideoCampaign = { ...newsletter, id: "p1", status: "paused", updatedAt: "2026-10-10T00:00:00.000Z" };
const noUtm: VideoCampaign = { ...fallLaunch, id: "n1", utmSource: null, utmMedium: "", utmCampaign: undefined, updatedAt: "2026-10-10T01:00:00.000Z" };

describe("appendCampaignUtm", () => {
  it("adds every UTM the campaign sets", () => {
    expect(appendCampaignUtm("https://acme.com/jobs/123", fallLaunch)).toBe(
      "https://acme.com/jobs/123?utm_source=linkedin&utm_medium=video&utm_campaign=fall-launch-2026",
    );
  });

  it("keeps UTMs already on the URL and is idempotent", () => {
    const once = appendCampaignUtm("https://acme.com/apply?utm_campaign=hand-set#form", fallLaunch);
    expect(once).toBe("https://acme.com/apply?utm_campaign=hand-set&utm_source=linkedin&utm_medium=video#form");
    expect(appendCampaignUtm(once, fallLaunch)).toBe(once);
  });

  it("leaves empty, relative, mailto and UTM-less cases untouched", () => {
    expect(appendCampaignUtm("", fallLaunch)).toBe("");
    expect(appendCampaignUtm(null, fallLaunch)).toBe("");
    expect(appendCampaignUtm("/m/abc", fallLaunch)).toBe("/m/abc");
    expect(appendCampaignUtm("mailto:sam@acme.com", fallLaunch)).toBe("mailto:sam@acme.com");
    expect(appendCampaignUtm("https://acme.com", noUtm)).toBe("https://acme.com");
    expect(appendCampaignUtm("https://acme.com", null)).toBe("https://acme.com");
    expect(hasCampaignUtm({ utmSource: "   " })).toBe(false);
  });
});

describe("pickProjectCampaign", () => {
  it("picks the most recently updated active campaign with UTMs that includes the project", () => {
    expect(pickProjectCampaign(PROJECT_ID, [fallLaunch, newsletter, pausedNewer, noUtm])?.id).toBe(newsletter.id);
  });

  it("returns null when the project is in no qualifying campaign", () => {
    expect(pickProjectCampaign("not-in-any", [fallLaunch, newsletter])).toBeNull();
    expect(pickProjectCampaign(PROJECT_ID, [pausedNewer, noUtm, { ...fallLaunch, status: "archived" }])).toBeNull();
    expect(pickProjectCampaign(PROJECT_ID, [])).toBeNull();
  });
});

describe("bakeCampaignUtmIntoTimeline / Hotzones", () => {
  function ctaTimeline() {
    const state = emptyCanvasState();
    const cta = defaultWidget("cta");
    if (cta.params.kind === "cta") cta.params.data.ctaUrl = "https://hired.video/jobs/senior-designer";
    const blank = defaultWidget("cta");
    if (blank.params.kind === "cta") blank.params.data.ctaUrl = "";
    state.scenes[0].widgets = [cta, blank, makeEngagementAssetWidget({ assetKind: "video-form", assetId: "f1" })];
    return canvasStateToTimeline(state);
  }

  it("rewrites every CTA URL the renderer reads without mutating the saved timeline", () => {
    const timeline = ctaTimeline();
    const before = JSON.stringify(timeline);
    const baked = bakeCampaignUtmIntoTimeline(timeline, fallLaunch);
    expect(JSON.stringify(timeline)).toBe(before);
    expect(extractCtaHotzones(baked).map((z) => z.url)).toEqual([
      "https://hired.video/jobs/senior-designer?utm_source=linkedin&utm_medium=video&utm_campaign=fall-launch-2026",
    ]);
    // Non-CTA effects ride through by reference.
    const effectKinds = baked.tracks.flatMap((t) => t.clips.flatMap((c) => (c.effects ?? []).map((e) => e.kind)));
    expect(effectKinds).toContain("canvas-v2:engagement-asset");
  });

  it("returns the same timeline when the campaign has no UTMs", () => {
    const timeline = ctaTimeline();
    expect(bakeCampaignUtmIntoTimeline(timeline, noUtm)).toBe(timeline);
    expect(bakeCampaignUtmIntoTimeline(timeline, null)).toBe(timeline);
  });

  it("tags the public player's hot-zones", () => {
    const zones = extractCtaHotzones(ctaTimeline());
    // The API's walk and the client's plugin-driven interactions agree on
    // which CTAs are clickable (#2312) — the baked list replaces them 1:1.
    expect(ctaHotzonesOf(extractInteractionZones(ctaTimeline()))).toEqual(zones);
    expect(bakeCampaignUtmIntoHotzones(zones, newsletter)[0].url).toBe(
      "https://hired.video/jobs/senior-designer?utm_source=newsletter&utm_medium=email&utm_campaign=oct-2026",
    );
    expect(bakeCampaignUtmIntoHotzones(zones, null)).toBe(zones);
  });
});

describe("campaignShareUrlFor", () => {
  it("builds the canonical /m/:id watch URL with campaign UTMs", () => {
    expect(campaignShareUrlFor(PROJECT_ID, fallLaunch, { origin: "https://hired.video" })).toBe(
      `https://hired.video/m/${PROJECT_ID}?utm_source=linkedin&utm_medium=video&utm_campaign=fall-launch-2026`,
    );
  });
});
