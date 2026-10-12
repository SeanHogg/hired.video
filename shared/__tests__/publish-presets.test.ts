/**
 * Per-network delivery presets + variant planner (#2045). Fixtures are the
 * shapes the studio actually renders: 1080x1920 vertical résumé reels,
 * 1920x1080 landscape pitches, 1080x1080 squares, and odd webcam frames.
 *
 * Run: node --import tsx --test shared/__tests__/publish-presets.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PUBLISH_PLATFORM_PRESETS,
  aspectOf,
  MASTER_VARIANT_KEY,
  VARIANT_KEY_MAX,
  isYouTubeShort,
  parseVariantKey,
  planPublishVariants,
  publishFitFor,
  variantKeyFor,
  variantSpecFor,
} from "../publish-presets.js";
import { VIDEO_PUBLISH_PLATFORMS } from "../social-platforms.js";

describe("PUBLISH_PLATFORM_PRESETS", () => {
  it("covers every video platform with aspect, duration window and codec", () => {
    for (const p of VIDEO_PUBLISH_PLATFORMS) {
      const preset = PUBLISH_PLATFORM_PRESETS[p];
      assert.ok(preset.aspects.length > 0, `${p} aspects`);
      assert.ok(preset.minDurationSec > 0 && preset.maxDurationSec > preset.minDurationSec, `${p} duration window`);
      assert.equal(preset.codec, "h264");
      assert.equal(preset.container, "mp4");
    }
  });
});

describe("aspectOf", () => {
  it("matches the studio's render frames", () => {
    assert.equal(aspectOf(1080, 1920), "9:16");
    assert.equal(aspectOf(1920, 1080), "16:9");
    assert.equal(aspectOf(1080, 1080), "1:1");
    assert.equal(aspectOf(1080, 1350), "4:5");
  });
  it("tolerates encoder rounding (1080x1918) but not a 4:3 webcam frame (boundary)", () => {
    assert.equal(aspectOf(1080, 1918), "9:16");
    assert.equal(aspectOf(640, 480), null);
  });
  it("rejects empty or invalid frames", () => {
    assert.equal(aspectOf(0, 1080), null);
    assert.equal(aspectOf(Number.NaN, 1080), null);
  });
});

describe("isYouTubeShort", () => {
  it("is vertical and at most 3 minutes", () => {
    assert.equal(isYouTubeShort({ aspect: "9:16", durationSec: 45 }), true);
    assert.equal(isYouTubeShort({ aspect: "9:16", durationSec: 180 }), true);
    assert.equal(isYouTubeShort({ aspect: "9:16", durationSec: 180.5 }), false);
    assert.equal(isYouTubeShort({ aspect: "16:9", durationSec: 45 }), false);
    assert.equal(isYouTubeShort({ aspect: "9:16", durationSec: 0 }), false);
  });
});

describe("publishFitFor", () => {
  it("keeps a vertical 60s reel as-is on TikTok", () => {
    assert.deepEqual(publishFitFor("tiktok", { aspect: "9:16", durationSec: 60 }), {
      aspect: "9:16",
      codec: "h264",
      reframe: false,
      trimToSec: null,
      tooShort: false,
    });
  });
  it("flags a 3-minute video as too long for X (trim to 140s)", () => {
    assert.equal(publishFitFor("x", { aspect: "16:9", durationSec: 180 }).trimToSec, 140);
    assert.equal(publishFitFor("x", { aspect: "16:9", durationSec: 140 }).trimToSec, null);
  });
  it("reframes a landscape pitch for Instagram Reels", () => {
    const fit = publishFitFor("instagram", { aspect: "16:9", durationSec: 60 });
    assert.equal(fit.aspect, "9:16");
    assert.equal(fit.reframe, true);
  });
  it("reframes an odd frame to the network's preferred aspect", () => {
    const fit = publishFitFor("youtube", { aspect: null, durationSec: 60 });
    assert.equal(fit.aspect, "16:9");
    assert.equal(fit.reframe, true);
  });
  it("flags a 2-second clip as too short for TikTok", () => {
    assert.equal(publishFitFor("tiktok", { aspect: "9:16", durationSec: 2 }).tooShort, true);
  });
});

describe("planPublishVariants", () => {
  it("one vertical cut feeds TikTok, Reels, YouTube and LinkedIn", () => {
    const variants = planPublishVariants(["tiktok", "instagram", "youtube", "linkedin"], { aspect: "9:16", durationSec: 75 });
    assert.equal(variants.length, 1);
    assert.deepEqual(variants[0].platforms, ["tiktok", "instagram", "youtube", "linkedin"]);
    assert.equal(variants[0].key, MASTER_VARIANT_KEY);
  });

  it("a long landscape pitch splits into as-is, vertical and 140s cuts", () => {
    const variants = planPublishVariants(["youtube", "linkedin", "instagram", "tiktok", "x"], {
      aspect: "16:9",
      durationSec: 240,
    });
    assert.deepEqual(
      variants.map((v) => [v.key, v.platforms]),
      [
        [MASTER_VARIANT_KEY, ["youtube", "linkedin", "tiktok"]],
        ["9x16-full", ["instagram"]],
        ["16x9-140", ["x"]],
      ],
    );
  });

  it("de-duplicates repeated platforms and handles an empty pick (boundary)", () => {
    assert.equal(planPublishVariants(["x", "x"], { aspect: "1:1", durationSec: 30 })[0].platforms.length, 1);
    assert.deepEqual(planPublishVariants([], { aspect: "1:1", durationSec: 30 }), []);
  });
});

describe("variantKeyFor", () => {
  const P = PUBLISH_PLATFORM_PRESETS;

  it("keys a landscape pitch's fitted cuts by frame and trim point", () => {
    const pitch = { aspect: "16:9" as const, durationSec: 240 };
    assert.equal(variantKeyFor(P.instagram, pitch), "9x16-full");
    assert.equal(variantKeyFor(P.x, pitch), "16x9-140");
  });

  it("gives networks with the same needs the same key, so one cut serves them", () => {
    // A 4:3 webcam take: TikTok and Instagram both want 9:16 at full length.
    const webcam = { aspect: null, durationSec: 75 };
    assert.equal(variantKeyFor(P.tiktok, webcam), "9x16-full");
    assert.equal(variantKeyFor(P.instagram, webcam), "9x16-full");
    assert.equal(variantKeyFor(P.youtube, webcam), "16x9-full");
  });

  it("is null when the master already fits — exactly at the duration limit (boundary)", () => {
    assert.equal(variantKeyFor(P.x, { aspect: "16:9", durationSec: 140 }), null);
    assert.equal(variantKeyFor(P.x, { aspect: "16:9", durationSec: 140.5 }), "16x9-140");
    assert.equal(variantKeyFor(P.tiktok, { aspect: "9:16", durationSec: 60 }), null);
  });

  it("never keys a too-short master — no cut can lengthen it (error case)", () => {
    assert.equal(variantKeyFor(P.tiktok, { aspect: "9:16", durationSec: 2 }), null);
  });

  it("round-trips through parseVariantKey within the column width", () => {
    for (const key of ["9x16-full", "16x9-140", "1x1-600", "4x5-900"]) {
      const spec = parseVariantKey(key);
      assert.ok(spec, key);
      assert.equal(spec.key, key);
      assert.ok(key.length <= VARIANT_KEY_MAX);
    }
    assert.deepEqual(parseVariantKey("16x9-140"), { key: "16x9-140", aspect: "16:9", trimToSec: 140 });
    assert.deepEqual(parseVariantKey("9x16-30s45"), { key: "9x16-30s45", aspect: "9:16", trimToSec: 30, startSec: 45 });
    assert.deepEqual(variantSpecFor("instagram", { aspect: "16:9", durationSec: 30 }), {
      key: "9x16-full",
      aspect: "9:16",
      trimToSec: null,
    });
  });

  it("rejects malformed keys", () => {
    for (const bad of ["", "master", "9:16-full", "9x16-0", "9x16-01", "3x2-full", "9x16-full; drop"]) {
      assert.equal(parseVariantKey(bad), null, bad);
    }
  });
});
