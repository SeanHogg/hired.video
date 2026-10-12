/**
 * #563 — `setMusicFromBlob` (the original-music composer's sink) adds a music
 * layer only with a hosted URL. A failed upload adds nothing and returns
 * `false` so the composer keeps the track behind Retry / Download / Discard;
 * a blob: URL never reaches the canvas state autosave persists.
 */
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uploadSceneAudio: vi.fn(),
  toast: vi.fn(() => ({ id: "t1", dismiss: () => {}, update: () => {} })),
}));
vi.mock("@/lib/services/studio-service", () => ({
  studioService: { uploadSceneAudio: mocks.uploadSceneAudio },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("../use-screenshot-capture", () => ({ useScreenshotCapture: () => ({ capture: async () => null }) }));

import { useWidgetActions } from "../use-widget-actions";
import { emptyCanvasState, musicLayers, type CanvasState } from "../canvas-state";
import type { Selection } from "../editor-types";

const CDN_URL = "https://cdn.hired.video/uploads/3b9f6d2e-8c41-4f7a-9e0d-5a1c2b3d4e5f/1760000000000-Original%20composition.wav";

/** 16 s of composer output: a RIFF/WAVE header is enough for the upload path. */
function composedWav(): Blob {
  return new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])], { type: "audio/wav" });
}

function setup() {
  return renderHook(() => {
    const [state, setState] = useState<CanvasState>(() => emptyCanvasState());
    const [, setSelection] = useState<Selection>({ kind: "scene", sceneId: "s1" } as Selection);
    const actions = useWidgetActions({
      setState,
      activeSceneId: state.scenes[0].id,
      setSelection,
      placeWidget: () => {},
    });
    return { state, actions };
  });
}

beforeEach(() => {
  mocks.uploadSceneAudio.mockReset();
  mocks.toast.mockClear();
});

describe("setMusicFromBlob", () => {
  it("hosts the track and adds a custom music layer with the CDN URL", async () => {
    mocks.uploadSceneAudio.mockResolvedValue({ success: true, data: { url: CDN_URL } });
    const { result } = setup();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.actions.setMusicFromBlob(composedWav(), 16, "Original composition");
    });
    expect(ok).toBe(true);
    const [layer] = musicLayers(result.current.state);
    expect(layer.source).toEqual({ kind: "custom", url: CDN_URL });
    expect(layer.label).toBe("Original composition");
    expect(layer.durationSeconds).toBe(16);
    const file = mocks.uploadSceneAudio.mock.calls[0][0] as File;
    expect(file.name).toBe("Original composition.wav");
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Music added to composition" });
  });

  it("adds nothing and reports failure when the upload throws (signed out / offline)", async () => {
    mocks.uploadSceneAudio.mockRejectedValue(new Error("Authentication required"));
    const { result } = setup();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.actions.setMusicFromBlob(composedWav(), 16, "Original composition");
    });
    expect(ok).toBe(false);
    expect(musicLayers(result.current.state)).toHaveLength(0);
    expect(JSON.stringify(result.current.state)).not.toContain("blob:");
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Upload failed — your track isn’t saved yet",
        description: "Authentication required",
        variant: "destructive",
      }),
    );
  });

  it("treats an upload that answers with a blob: URL as not saved", async () => {
    mocks.uploadSceneAudio.mockResolvedValue({
      success: true,
      data: { url: "blob:https://hired.video/0c4e8a52-6f1d-4b3a-9d2e-7f8a9b0c1d2e" },
    });
    const { result } = setup();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.actions.setMusicFromBlob(composedWav(), 4, "");
    });
    expect(ok).toBe(false);
    expect(musicLayers(result.current.state)).toHaveLength(0);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Check your connection, then try again." }),
    );
    // An empty label still uploads under a usable file name.
    expect((mocks.uploadSceneAudio.mock.calls[0][0] as File).name).toBe("music.wav");
  });
});
