/**
 * #290 selfie-conditioned portrait engine: prompt shape, mode routing in
 * the headshot facade, and that generation goes through the shared
 * image-gen facade as img→img with the selfie as the source.
 *
 * Run: vitest run lib/services/__tests__/headshot-portrait-engine.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const generateImage = vi.fn();
vi.mock("../image-gen-engine", () => ({ generateImage }));

import { buildPortraitPrompt, PORTRAIT_STRENGTH, selfiePortraitEngine } from "../headshot-portrait-engine";
import { listHeadshotEngines } from "../headshot-engine";

describe("buildPortraitPrompt", () => {
  it("names the backdrop and keeps the same person", () => {
    const p = buildPortraitPrompt("Corporate navy");
    expect(p).toContain("same person");
    expect(p).toContain("corporate navy studio backdrop");
  });
});

describe("headshot engine registry", () => {
  it("registers the portrait engine under its own mode, cutout engines stay default", () => {
    const engines = listHeadshotEngines();
    const portrait = engines.filter((e) => e.mode === "portrait").map((e) => e.id);
    const cutout = engines.filter((e) => (e.mode ?? "cutout") === "cutout").map((e) => e.id);
    expect(portrait).toEqual(["selfie-img2img"]);
    expect(cutout).toEqual(expect.arrayContaining(["segformer-webgpu", "segformer-wasm"]));
    expect(cutout).not.toContain("selfie-img2img");
  });
});

describe("selfiePortraitEngine.generate", () => {
  beforeEach(() => {
    generateImage.mockReset();
    // A 1280×960 webcam still — scaled to ≤768 on its long edge.
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1280, height: 960, close: vi.fn() })));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AAAA");
  });

  it("sends the selfie as an img→img source at portrait strength", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    generateImage.mockResolvedValue({ blob, previewUrl: "blob:result", engine: "server-cf-sdxl-lightning", elapsedMs: 900 });
    const out = await selfiePortraitEngine.generate({ reference: new Blob(["selfie"]), backdropId: "studio-grey" });
    expect(generateImage).toHaveBeenCalledTimes(1);
    const [req] = generateImage.mock.calls[0];
    expect(req.sourceImageDataUrl).toBe("data:image/jpeg;base64,AAAA");
    expect(req.strength).toBe(PORTRAIT_STRENGTH);
    expect(req.prompt).toContain("studio grey studio backdrop");
    expect(out.engine).toBe("selfie-img2img");
    expect(out.previewUrl).toBe("blob:result");
  });

  it("surfaces the facade's error (e.g. out of token budget)", async () => {
    generateImage.mockRejectedValue(new Error("Token budget exceeded"));
    await expect(
      selfiePortraitEngine.generate({ reference: new Blob(["selfie"]), backdropId: "studio-grey" }),
    ).rejects.toThrow("Token budget exceeded");
  });
});
