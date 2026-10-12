/**
 * #563 — in-browser media reaches saved studio state only as a durable URL.
 *   - uploads accept a hosted URL and refuse an empty / blob: / data: one;
 *   - a WebGPU (blob-only) AI image is uploaded, a server one passes through;
 *   - the save path strips any blob: URL that slipped into the canvas, but
 *     keeps data: URLs runtimes persist on purpose and hosted URLs.
 */
import { describe, expect, it, vi } from "vitest";
import {
  audioFileFromBlob,
  isTabScopedUrl,
  persistAudioBlob,
  persistGeneratedImage,
  persistMediaBlob,
  stripTabScopedUrls,
} from "@/lib/studio/media-persistence";
import { persistableRuntimeSlice } from "@/lib/studio/editor-v2/runtime-state-payload";
import {
  defaultWidget,
  emptyCanvasState,
  makeAudioLayer,
  type CanvasState,
} from "@/lib/studio/editor-v2/canvas-state";

const AUDIO_CDN = "https://cdn.hired.video/uploads/3b9f6d2e-8c41-4f7a-9e0d-5a1c2b3d4e5f/1760000000000-original-composition.wav";
const IMAGE_CDN = "https://cdn.hired.video/studio/ai/7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f.png";
const BLOB_URL = "blob:https://hired.video/5d1c7c1e-1b7a-4d0e-9c43-0e2b8f1a6d55";
const SPRITE_DATA_URL = "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E";

/** A RIFF/WAVE header like the composer's OfflineAudioContext render. */
function wavBlob(): Blob {
  const header = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
  return new Blob([header], { type: "audio/wav" });
}

function pngBlob(): Blob {
  return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });
}

describe("persistMediaBlob", () => {
  it("accepts a hosted URL", async () => {
    await expect(persistMediaBlob(async () => ({ url: AUDIO_CDN }))).resolves.toEqual({ ok: true, url: AUDIO_CDN });
  });

  it.each([[""], [null], [BLOB_URL], ["data:audio/wav;base64,UklGRg=="]])(
    "refuses a non-durable URL (%s)",
    async (url) => {
      await expect(persistMediaBlob(async () => ({ url }))).resolves.toEqual({ ok: false, reason: "no_url" });
    },
  );

  it("turns a thrown upload into an error result", async () => {
    const result = await persistMediaBlob(async () => {
      throw new Error("Network request failed");
    });
    expect(result).toEqual({ ok: false, reason: "error", message: "Network request failed" });
  });
});

describe("persistAudioBlob", () => {
  it("uploads the track as a named WAV file", async () => {
    const upload = vi.fn(async (_file: File) => ({ data: { url: AUDIO_CDN } }));
    const result = await persistAudioBlob(wavBlob(), "Original composition", upload);
    expect(result).toEqual({ ok: true, url: AUDIO_CDN });
    const file = upload.mock.calls[0][0];
    expect(file.name).toBe("Original composition.wav");
    expect(file.type).toBe("audio/wav");
  });

  it("names an untyped blob .wav and strips path characters from the label", () => {
    const file = audioFileFromBlob(new Blob([new Uint8Array(4)]), "Dubbed — es/MX");
    expect(file.name).toBe("Dubbed — es-MX.wav");
    expect(audioFileFromBlob(new Blob([new Uint8Array(4)]), "  ").name).toBe("audio.wav");
  });
});

describe("persistGeneratedImage", () => {
  it("passes a server engine's hosted URL straight through", async () => {
    const upload = vi.fn();
    await expect(persistGeneratedImage({ blob: pngBlob(), resultUrl: IMAGE_CDN }, upload)).resolves.toBe(IMAGE_CDN);
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads a WebGPU engine's blob-only result", async () => {
    const upload = vi.fn(async (_file: File) => ({ data: { url: IMAGE_CDN } }));
    await expect(persistGeneratedImage({ blob: pngBlob() }, upload)).resolves.toBe(IMAGE_CDN);
    expect(upload.mock.calls[0][0].type).toBe("image/png");
    expect(upload.mock.calls[0][0].name).toMatch(/^ai-image-\d+\.png$/);
  });

  it("throws a localized error instead of returning a blob URL when hosting fails", async () => {
    const upload = vi.fn(async () => {
      throw new Error("413 Payload Too Large");
    });
    await expect(persistGeneratedImage({ blob: pngBlob(), resultUrl: BLOB_URL }, upload)).rejects.toThrow(
      "The image couldn’t be saved to your project. Check your connection and try again.",
    );
  });
});

describe("stripTabScopedUrls", () => {
  it("only treats blob: URLs as tab-scoped", () => {
    expect(isTabScopedUrl(BLOB_URL)).toBe(true);
    expect(isTabScopedUrl(` ${BLOB_URL.toUpperCase()}`)).toBe(true);
    expect(isTabScopedUrl(SPRITE_DATA_URL)).toBe(false);
    expect(isTabScopedUrl(IMAGE_CDN)).toBe(false);
  });

  it("returns the same object when nothing needs stripping", () => {
    const value = { a: [{ url: IMAGE_CDN }], n: 3, flag: true, none: null };
    expect(stripTabScopedUrls(value)).toBe(value);
  });

  it("blanks nested blob: URLs and keeps untouched branches by identity", () => {
    const kept = { url: IMAGE_CDN };
    const value = { kept, layers: [{ source: { kind: "custom", url: BLOB_URL } }] };
    const out = stripTabScopedUrls(value);
    expect(out).not.toBe(value);
    expect(out.kept).toBe(kept);
    expect(out.layers[0].source.url).toBe("");
    expect(value.layers[0].source.url).toBe(BLOB_URL);
  });
});

describe("persistableRuntimeSlice — the save path's guard", () => {
  function videoWithLeakedBlobs(): CanvasState {
    const base = emptyCanvasState();
    const image = defaultWidget("image");
    if (image.params.kind === "image") image.params.data.source = { kind: "url", url: BLOB_URL };
    const hosted = defaultWidget("image");
    if (hosted.params.kind === "image") hosted.params.data.source = { kind: "url", url: IMAGE_CDN };
    return {
      ...base,
      scenes: base.scenes.map((scene) => ({ ...scene, durationSeconds: 12, widgets: [image, hosted] })),
      audioLayers: [
        makeAudioLayer({ id: "music-1", kind: "music", source: { kind: "custom", url: BLOB_URL }, label: "Original composition", durationSeconds: 12 }),
        makeAudioLayer({ id: "vo-1", kind: "voiceover", source: { kind: "custom", url: AUDIO_CDN }, label: "Take 1", durationSeconds: 8 }),
      ],
    };
  }

  it("never writes a blob: URL for a timeline kind, and keeps hosted media", () => {
    const slice = persistableRuntimeSlice("video", {
      canvasState: videoWithLeakedBlobs(),
      imageState: null,
      animationState: null,
      gameState: null,
      cadState: null,
    });
    const json = JSON.stringify(slice);
    expect(slice.kind).toBe("nle");
    expect(json).not.toContain("blob:");
    expect(json).toContain(IMAGE_CDN);
    expect(json).toContain(AUDIO_CDN);
  });

  it("leaves a clean slice untouched (same object as the unguarded payload shape)", () => {
    const base = emptyCanvasState();
    const slice = persistableRuntimeSlice("podcast", {
      canvasState: base,
      imageState: null,
      animationState: null,
      gameState: null,
      cadState: null,
    });
    expect(JSON.stringify(slice)).not.toContain("blob:");
    expect(slice.timelineSpec).toBeDefined();
  });
});
