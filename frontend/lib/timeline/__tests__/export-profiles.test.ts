import { describe, expect, it } from "vitest";
import {
  PLATFORM_PRESETS,
  findPlatformPreset,
  groupPlatformPresets,
} from "../export-profiles";
import { CODEC_PRESETS } from "../../studio/codec-presets";

/**
 * #1965 — platform export profile catalog integrity + resolver behavior.
 */

const CONTAINERS = new Set(["mp4", "mov", "webm"]);
const CODECS = new Set(["h264", "h265", "prores", "dnxhd", "vp9"]);
const AUDIO = new Set(["aac", "pcm", "opus"]);
const GROUPS = new Set(["youtube", "tiktok", "instagram", "linkedin", "x", "vimeo", "broadcast"]);

describe("PLATFORM_PRESETS integrity", () => {
  it("has unique ids", () => {
    const ids = PLATFORM_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every preset has a valid codec / container / audio codec / group", () => {
    for (const p of PLATFORM_PRESETS) {
      expect(CONTAINERS.has(p.container), `${p.id} container`).toBe(true);
      expect(CODECS.has(p.codec), `${p.id} codec`).toBe(true);
      expect(AUDIO.has(p.audioCodec), `${p.id} audio`).toBe(true);
      expect(GROUPS.has(p.group), `${p.id} group`).toBe(true);
    }
  });

  it("every preset has sane positive resolution / fps / bitrates", () => {
    for (const p of PLATFORM_PRESETS) {
      expect(p.width, `${p.id} width`).toBeGreaterThan(0);
      expect(p.height, `${p.id} height`).toBeGreaterThan(0);
      expect(p.fps, `${p.id} fps`).toBeGreaterThan(0);
      expect(p.videoBitrate, `${p.id} videoBitrate`).toBeGreaterThan(0);
      expect(p.audioBitrate, `${p.id} audioBitrate`).toBeGreaterThan(0);
      expect(typeof p.proOnly).toBe("boolean");
      expect(p.label.trim().length).toBeGreaterThan(0);
      expect(p.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it("each preset's container/audio pairing is consistent with the codec catalog", () => {
    // Cross-check against the codec SSoT: the chosen codec's canonical
    // container + audio codec should match the preset (no impossible combos
    // like prores-in-mp4 or h264-with-pcm).
    const byCodec = new Map(CODEC_PRESETS.map((c) => [c.id, c]));
    for (const p of PLATFORM_PRESETS) {
      const codec = byCodec.get(p.codec);
      expect(codec, `${p.id} references codec not in CODEC_PRESETS`).toBeDefined();
      expect(p.container, `${p.id} container disagrees with codec catalog`).toBe(codec!.container);
      expect(p.audioCodec, `${p.id} audioCodec disagrees with codec catalog`).toBe(codec!.audioCodec);
    }
  });

  it("4K and ProRes/broadcast masters are correctly Pro-gated", () => {
    const fourK = PLATFORM_PRESETS.find((p) => p.width >= 3840);
    expect(fourK?.proOnly).toBe(true);
    const prores = PLATFORM_PRESETS.find((p) => p.codec === "prores");
    expect(prores?.proOnly).toBe(true);
  });
});

describe("findPlatformPreset (resolver)", () => {
  it("resolves a known id to the right profile", () => {
    const p = findPlatformPreset("youtube-1080p60");
    expect(p?.id).toBe("youtube-1080p60");
    expect(p?.width).toBe(1920);
    expect(p?.height).toBe(1080);
    expect(p?.fps).toBe(60);
  });

  it("returns null for unknown / nullish ids (safe fallback)", () => {
    expect(findPlatformPreset("not-a-preset")).toBeNull();
    expect(findPlatformPreset(null)).toBeNull();
    expect(findPlatformPreset(undefined)).toBeNull();
    expect(findPlatformPreset("")).toBeNull();
  });

  it("resolves the vertical TikTok profile to 9:16 geometry", () => {
    const p = findPlatformPreset("tiktok-vertical");
    expect(p?.width).toBe(1080);
    expect(p?.height).toBe(1920);
    expect(p!.height).toBeGreaterThan(p!.width);
  });
});

describe("groupPlatformPresets", () => {
  it("groups presets by channel, skipping empties, with stable label order", () => {
    const groups = groupPlatformPresets();
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.presets.length).toBeGreaterThan(0);
      expect(GROUPS.has(g.id)).toBe(true);
      expect(g.label.trim().length).toBeGreaterThan(0);
      for (const p of g.presets) expect(p.group).toBe(g.id);
    }
    // every preset appears exactly once across all groups
    const flat = groups.flatMap((g) => g.presets.map((p) => p.id));
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat.length).toBe(PLATFORM_PRESETS.length);
  });

  it("preserves the canonical group order (youtube first)", () => {
    const ids = groupPlatformPresets().map((g) => g.id);
    expect(ids[0]).toBe("youtube");
  });
});
