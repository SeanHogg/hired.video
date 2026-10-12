/**
 * prepareResumeImage (#2230): HEIC → JPEG and oversize-photo downscale in the
 * browser before the résumé vision-OCR upload. jsdom has no image decoder or
 * canvas encoder, so the happy path stubs `createImageBitmap` + the canvas.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_EDGE_PX,
  REENCODE_OVER_BYTES,
  fitWithin,
  isHeicFile,
  needsResumeImagePrep,
  prepareResumeImage,
} from "@/lib/resume/prepare-resume-image";

/** A File whose reported size matches a real phone photo without allocating it. */
function photo(name: string, type: string, size: number): File {
  const f = new File([new Uint8Array(8)], name, { type, lastModified: 1_700_000_000_000 });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function stubDecoder(width: number, height: number, encodedBytes: number) {
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width, height, close })));
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: vi.fn(),
    drawImage,
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb) {
    cb(new Blob([new Uint8Array(encodedBytes)], { type: "image/jpeg" }));
  });
  return { close, drawImage };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isHeicFile", () => {
  it.each([
    ["IMG_4021.HEIC", "image/heic"],
    ["IMG_4021.heif", ""],
    ["photo", "image/heif"],
    ["IMG_4021.HEIC", "application/octet-stream"],
  ])("detects %s (%s)", (name, type) => {
    expect(isHeicFile({ name, type })).toBe(true);
  });

  it.each([
    ["scan.jpg", "image/jpeg"],
    ["resume.pdf", "application/pdf"],
    ["heic-notes.png", "image/png"],
  ])("ignores %s (%s)", (name, type) => {
    expect(isHeicFile({ name, type })).toBe(false);
  });
});

describe("fitWithin", () => {
  it("caps the long edge of a 12 MP iPhone photo", () => {
    expect(fitWithin(4032, 3024, MAX_EDGE_PX)).toEqual({ width: 2400, height: 1800 });
    expect(fitWithin(3024, 4032, MAX_EDGE_PX)).toEqual({ width: 1800, height: 2400 });
  });

  it("never upscales (boundary: exactly at the cap)", () => {
    expect(fitWithin(2400, 1600, MAX_EDGE_PX)).toEqual({ width: 2400, height: 1600 });
    expect(fitWithin(800, 600, MAX_EDGE_PX)).toEqual({ width: 800, height: 600 });
  });
});

describe("needsResumeImagePrep", () => {
  it("re-encodes HEIC of any size and non-HEIC only over the byte threshold", () => {
    expect(needsResumeImagePrep(photo("IMG_1.HEIC", "image/heic", 900_000))).toBe(true);
    expect(needsResumeImagePrep(photo("scan.jpg", "image/jpeg", REENCODE_OVER_BYTES))).toBe(false);
    expect(needsResumeImagePrep(photo("scan.jpg", "image/jpeg", REENCODE_OVER_BYTES + 1))).toBe(true);
  });
});

describe("prepareResumeImage", () => {
  it("passes a small JPEG through untouched (no decode)", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    const file = photo("resume-photo.jpg", "image/jpeg", 850_000);
    expect(await prepareResumeImage(file)).toBe(file);
    expect(decode).not.toHaveBeenCalled();
  });

  it("re-encodes an iPhone HEIC to a downscaled JPEG", async () => {
    const { close, drawImage } = stubDecoder(4032, 3024, 610_000);
    const out = await prepareResumeImage(photo("IMG_4021.HEIC", "image/heic", 2_300_000));
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("IMG_4021.jpg");
    expect(out.size).toBe(610_000);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2400, 1800);
    expect(close).toHaveBeenCalled();
  });

  it("keeps an oversize PNG when re-encoding would not shrink it", async () => {
    stubDecoder(1200, 1600, REENCODE_OVER_BYTES + 10);
    const file = photo("scan.png", "image/png", REENCODE_OVER_BYTES + 5);
    expect(await prepareResumeImage(file)).toBe(file);
  });

  it("falls back to the original when the browser can't decode HEIC (desktop Chrome)", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => {
      throw new DOMException("The source image could not be decoded.", "InvalidStateError");
    }));
    const file = photo("IMG_4021.HEIC", "image/heic", 2_300_000);
    expect(await prepareResumeImage(file)).toBe(file);
  });
});
