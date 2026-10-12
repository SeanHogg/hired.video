/**
 * source-upload policy tests (#304).
 *
 * Pins the `proxyIsWarranted` decision shared by the bin-upload and
 * relink surfaces, so the two can't drift back into hand-rolled
 * threshold checks. Covers happy / boundary / exception shapes:
 *   - tall video master → proxy
 *   - short / at-threshold master → no proxy
 *   - non-video (audio/image) → never proxy
 *   - relink forceRefresh → proxy regardless of height (invalidate stale)
 *
 * Run: vitest run lib/timeline/__tests__/source-upload.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  proxyIsWarranted,
  AUTO_PROXY_HEIGHT_THRESHOLD,
} from "@/lib/timeline/source-upload";

describe("proxyIsWarranted", () => {
  it("proxies a tall video master", () => {
    expect(
      proxyIsWarranted({ kind: "video", height: AUTO_PROXY_HEIGHT_THRESHOLD + 1 }),
    ).toBe(true);
    expect(proxyIsWarranted({ kind: "video", height: 2160 })).toBe(true);
  });

  it("does not proxy a master at or below the threshold", () => {
    expect(
      proxyIsWarranted({ kind: "video", height: AUTO_PROXY_HEIGHT_THRESHOLD }),
    ).toBe(false);
    expect(proxyIsWarranted({ kind: "video", height: 720 })).toBe(false);
  });

  it("treats unknown (null) height as below threshold", () => {
    expect(proxyIsWarranted({ kind: "video", height: null })).toBe(false);
  });

  it("never proxies non-video sources, even tall ones", () => {
    expect(proxyIsWarranted({ kind: "audio", height: null })).toBe(false);
    expect(proxyIsWarranted({ kind: "image", height: 4000 })).toBe(false);
  });

  it("forceRefresh regenerates a video proxy regardless of height", () => {
    // Relink to a SMALL master that already had a proxy: must refresh so
    // the stale proxy can't keep rendering the previous file's pixels.
    expect(
      proxyIsWarranted({ kind: "video", height: 480, forceRefresh: true }),
    ).toBe(true);
  });

  it("forceRefresh still never resurrects a proxy for non-video", () => {
    expect(
      proxyIsWarranted({ kind: "audio", height: null, forceRefresh: true }),
    ).toBe(false);
    expect(
      proxyIsWarranted({ kind: "image", height: 4000, forceRefresh: true }),
    ).toBe(false);
  });
});
