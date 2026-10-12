/** Which images a canvas can draw without a CORS check (canvas-safe-image.ts). */
import { afterEach, describe, expect, it, vi } from "vitest";

const proxy = vi.hoisted(() => ({ imageBlob: vi.fn(async () => new Blob(["img"])) }));
vi.mock("@/lib/services/media-proxy-service", () => ({ mediaProxyService: proxy }));

import { CORS_PROBE_TIMEOUT_MS, canvasSafeImageUrl, isCanvasSafeByOrigin, loadsWithCors } from "../canvas-safe-image";

const ORIGIN = "https://hired.video";

describe("isCanvasSafeByOrigin", () => {
  it("trusts inline and same-origin images", () => {
    expect(isCanvasSafeByOrigin("data:image/png;base64,AAAA", ORIGIN)).toBe(true);
    expect(isCanvasSafeByOrigin("blob:https://hired.video/1234", ORIGIN)).toBe(true);
    expect(isCanvasSafeByOrigin("/uploads/u1/photo.png", ORIGIN)).toBe(true);
    expect(isCanvasSafeByOrigin("https://hired.video/img/a.png", ORIGIN)).toBe(true);
  });

  it("checks every other host (CORS, else the image proxy)", () => {
    expect(isCanvasSafeByOrigin("https://images.unsplash.com/photo-1", ORIGIN)).toBe(false);
    expect(isCanvasSafeByOrigin("https://cdn.hired.video/uploads/a.png", ORIGIN)).toBe(false);
  });
});

describe("the CORS probe is bounded", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** An Image whose load never settles (a hanging host). */
  class HangingImage {
    crossOrigin = "";
    src = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
  }

  it("gives up after the timeout instead of waiting forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Image", HangingImage);
    const probe = loadsWithCors("https://slow.example/a.png");
    vi.advanceTimersByTime(CORS_PROBE_TIMEOUT_MS);
    await expect(probe).resolves.toBe(false);
  });

  it("falls through to the image proxy when the probe times out", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Image", HangingImage);
    // jsdom has no object URLs; define one for this test.
    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:local"), configurable: true, writable: true });
    const result = canvasSafeImageUrl("https://slow.example/a.png");
    await vi.advanceTimersByTimeAsync(CORS_PROBE_TIMEOUT_MS);
    await expect(result).resolves.toMatchObject({ url: "blob:local" });
    expect(proxy.imageBlob).toHaveBeenCalledWith("https://slow.example/a.png");
  });
});
