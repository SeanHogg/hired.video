/**
 * #1787 — recorder background image: cover-crop to 16:9 so a phone photo is
 * never squashed, plus the pick validation.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_HEIGHT,
  BACKGROUND_WIDTH,
  MAX_BACKGROUND_IMAGE_BYTES,
  coverCrop,
  isBackgroundImageFile,
  loadBackgroundBitmap,
} from "@/lib/studio/webcam/background-image";

afterEach(() => vi.unstubAllGlobals());

describe("coverCrop", () => {
  it("trims top and bottom of a portrait iPhone photo", () => {
    expect(coverCrop(3024, 4032)).toEqual({ sx: 0, sy: 1166, sw: 3024, sh: 1701 });
  });

  it("trims the sides of an ultra-wide panorama", () => {
    expect(coverCrop(8000, 2000)).toEqual({ sx: 2222, sy: 0, sw: 3556, sh: 2000 });
  });

  it("leaves an exact 16:9 image whole (boundary)", () => {
    expect(coverCrop(1920, 1080)).toEqual({ sx: 0, sy: 0, sw: 1920, sh: 1080 });
  });

  it("handles a zero-size image without NaN", () => {
    expect(coverCrop(0, 0)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });
});

describe("isBackgroundImageFile", () => {
  it("accepts images by MIME or extension", () => {
    expect(isBackgroundImageFile({ name: "office.jpg", type: "image/jpeg" })).toBe(true);
    expect(isBackgroundImageFile({ name: "IMG_0042.HEIC", type: "" })).toBe(true);
    expect(isBackgroundImageFile({ name: "brand.webp", type: "application/octet-stream" })).toBe(true);
  });

  it("rejects non-images", () => {
    expect(isBackgroundImageFile({ name: "resume.pdf", type: "application/pdf" })).toBe(false);
    expect(isBackgroundImageFile({ name: "clip.mp4", type: "video/mp4" })).toBe(false);
  });
});

describe("loadBackgroundBitmap", () => {
  it("cover-crops and downsizes a decoded photo", async () => {
    const close = vi.fn();
    const createImageBitmapMock = vi
      .fn()
      .mockResolvedValueOnce({ width: 4032, height: 3024, close })
      .mockResolvedValueOnce({ width: BACKGROUND_WIDTH, height: BACKGROUND_HEIGHT, close: vi.fn() });
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);

    const file = new File([new Uint8Array(16)], "home-office.jpg", { type: "image/jpeg" });
    const result = await loadBackgroundBitmap(file);

    expect("bitmap" in result).toBe(true);
    // 4032×3024 (4:3) → centred 4032×2268 band, resized to 1920×1080.
    expect(createImageBitmapMock.mock.calls[1]!.slice(1, 5)).toEqual([0, 378, 4032, 2268]);
    expect(createImageBitmapMock.mock.calls[1]![5]).toMatchObject({ resizeWidth: 1920, resizeHeight: 1080 });
    expect(close).toHaveBeenCalled();
  });

  it("rejects a non-image and an oversize file before decoding", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    expect(await loadBackgroundBitmap(new File(["%PDF"], "cv.pdf", { type: "application/pdf" }))).toEqual({ error: "not_image" });
    const big = new File([new Uint8Array(8)], "huge.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: MAX_BACKGROUND_IMAGE_BYTES + 1 });
    expect(await loadBackgroundBitmap(big)).toEqual({ error: "too_large" });
    expect(decode).not.toHaveBeenCalled();
  });

  it("reports unreadable when the browser can't decode it", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new DOMException("bad", "InvalidStateError")));
    const file = new File([new Uint8Array(8)], "IMG_1.HEIC", { type: "image/heic" });
    expect(await loadBackgroundBitmap(file)).toEqual({ error: "unreadable" });
  });
});
