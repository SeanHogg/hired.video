/**
 * Tests for the pluggable image-gen engine facade (#932 + #941). The
 * facade is the single port every AI-image consumer routes through —
 * MediaPicker, DrawingStage, future Game / CAD surfaces. The engine
 * priority order encodes the user's "web first, server fallback"
 * directive; these tests pin that contract.
 *
 * Run: vitest run lib/services/__tests__/image-gen-engine.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateImage,
  pickAvailableImageGenEngine,
  registerImageGenEngine,
  type ImageGenEngineId,
} from "@/lib/services/image-gen-engine";

// ─── Test fixtures ────────────────────────────────────────────────────
//
// The module registers two engines on import (webgpu-sd-turbo as
// always-unavailable today, server-cf-sdxl-lightning as always-available
// via the network call). For these tests we re-register against the
// same ids — `registerImageGenEngine` is a Map.set, so each test fully
// controls the registry state for its assertions.

function fakeBlob(): Blob {
  return new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
}

const ORIGINAL_URL_CREATE = URL.createObjectURL;
const ORIGINAL_URL_REVOKE = URL.revokeObjectURL;

beforeEach(() => {
  // jsdom doesn't have URL.createObjectURL — stub it so the engine's
  // previewUrl assignment doesn't blow up.
  URL.createObjectURL = vi.fn(() => "blob://test-preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = ORIGINAL_URL_CREATE;
  URL.revokeObjectURL = ORIGINAL_URL_REVOKE;
});

describe("pickAvailableImageGenEngine — ordering", () => {
  it("prefers webgpu-sd-turbo when both engines are available", async () => {
    registerImageGenEngine({
      id: "webgpu-sd-turbo",
      label: "WebGPU (mocked available)",
      isAvailable: async () => true,
      generate: async () => ({
        blob: fakeBlob(),
        previewUrl: "blob://webgpu",
        engine: "webgpu-sd-turbo",
        elapsedMs: 0,
      }),
    });
    registerImageGenEngine({
      id: "server-cf-sdxl-lightning",
      label: "Server (mocked available)",
      isAvailable: async () => true,
      generate: async () => ({
        blob: fakeBlob(),
        previewUrl: "blob://server",
        engine: "server-cf-sdxl-lightning",
        elapsedMs: 0,
      }),
    });

    const picked = await pickAvailableImageGenEngine();
    expect(picked.id).toBe("webgpu-sd-turbo");
  });

  it("falls back to server when WebGPU is unavailable", async () => {
    registerImageGenEngine({
      id: "webgpu-sd-turbo",
      label: "WebGPU (mocked unavailable)",
      isAvailable: async () => false,
      generate: async () => {
        throw new Error("should not be called");
      },
    });
    registerImageGenEngine({
      id: "server-cf-sdxl-lightning",
      label: "Server (mocked available)",
      isAvailable: async () => true,
      generate: async () => ({
        blob: fakeBlob(),
        previewUrl: "blob://server",
        engine: "server-cf-sdxl-lightning",
        elapsedMs: 0,
      }),
    });

    const picked = await pickAvailableImageGenEngine();
    expect(picked.id).toBe("server-cf-sdxl-lightning");
  });

  it("throws when no engine is available", async () => {
    const unavailable = (id: ImageGenEngineId) => ({
      id,
      label: "(mocked unavailable)",
      isAvailable: async () => false,
      generate: async () => {
        throw new Error("should not be called");
      },
    });
    registerImageGenEngine(unavailable("webgpu-sd-turbo"));
    registerImageGenEngine(unavailable("server-cf-sdxl-lightning"));

    await expect(pickAvailableImageGenEngine()).rejects.toThrow(/No image generation engine/);
  });
});

describe("generateImage — facade", () => {
  it("trims + caps the prompt before handing it to the engine", async () => {
    const generate = vi.fn(async (input: { prompt: string }) => ({
      blob: fakeBlob(),
      previewUrl: "blob://preview",
      engine: "server-cf-sdxl-lightning" as const,
      elapsedMs: 0,
      capturedPrompt: input.prompt,
    }));
    registerImageGenEngine({
      id: "webgpu-sd-turbo",
      label: "(skip)",
      isAvailable: async () => false,
      generate: async () => {
        throw new Error("should skip webgpu when unavailable");
      },
    });
    registerImageGenEngine({
      id: "server-cf-sdxl-lightning",
      label: "Server",
      isAvailable: async () => true,
      generate,
    });

    const longPrompt = "  " + "x".repeat(2000) + "  ";
    await generateImage({ prompt: longPrompt });
    const handed = generate.mock.calls[0][0].prompt;
    expect(handed.startsWith(" ")).toBe(false);
    expect(handed.length).toBeLessThanOrEqual(500);
  });

  it("rejects prompts shorter than 3 characters", async () => {
    await expect(generateImage({ prompt: "  hi  " })).rejects.toThrow(/at least 3/);
  });

  it("returns the engine's result verbatim (blob + engine id + resultUrl when set)", async () => {
    registerImageGenEngine({
      id: "webgpu-sd-turbo",
      label: "(skip)",
      isAvailable: async () => false,
      generate: async () => {
        throw new Error("should skip");
      },
    });
    registerImageGenEngine({
      id: "server-cf-sdxl-lightning",
      label: "Server",
      isAvailable: async () => true,
      generate: async () => ({
        blob: fakeBlob(),
        previewUrl: "blob://server",
        engine: "server-cf-sdxl-lightning",
        elapsedMs: 42,
        resultUrl: "https://cdn.example/abc.png",
      }),
    });

    const result = await generateImage({ prompt: "a calm beach at dawn" });
    expect(result.engine).toBe("server-cf-sdxl-lightning");
    expect(result.resultUrl).toBe("https://cdn.example/abc.png");
    expect(result.elapsedMs).toBe(42);
  });
});
