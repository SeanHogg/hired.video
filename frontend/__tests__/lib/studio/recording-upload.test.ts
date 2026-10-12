/**
 * #563 — a recorded clip reaches saved studio state only as a durable URL.
 * `persistRecording` never yields a blob:/data: URL; failures come back as a
 * result the recorder turns into Retry / Download / Discard.
 */
import { describe, expect, it, vi } from "vitest";
import { isEphemeralMediaUrl } from "@/lib/studio/media-persistence";
import {
  persistRecording,
  recordingFileFromBlob,
  type RecordingUploader,
} from "@/lib/studio/recording-upload";

const PROJECT_ID = "a7c3e1f0-2b4d-4c6e-8f10-123456789abc";
const CDN_URL = "https://cdn.hired.video/studio/recordings/3b9f6d2e-8c41-4f7a-9e0d-5a1c2b3d4e5f/1760000000000-recording.webm";

function webmClip(): Blob {
  return new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])], { type: "video/webm;codecs=vp9,opus" });
}

describe("recordingFileFromBlob", () => {
  it("names a Chrome webm and a Safari mp4 clip by container", () => {
    expect(recordingFileFromBlob(webmClip(), 1760000000000).name).toBe("recording-1760000000000.webm");
    const mp4 = recordingFileFromBlob(new Blob([new Uint8Array(4)], { type: "video/mp4" }), 1);
    expect(mp4.name).toBe("recording-1.mp4");
    expect(mp4.type).toBe("video/mp4");
  });

  it("defaults an untyped blob to video/webm", () => {
    expect(recordingFileFromBlob(new Blob([new Uint8Array(4)]), 2).type).toBe("video/webm");
  });
});

describe("isEphemeralMediaUrl", () => {
  it.each([
    ["blob:https://hired.video/5d1c7c1e-1b7a-4d0e-9c43-0e2b8f1a6d55", true],
    ["data:video/webm;base64,GkXfo0", true],
    ["  BLOB:https://hired.video/x", true],
    [CDN_URL, false],
    ["/api/courses/scorm-asset/u/p/index.html", false],
  ])("%s → %s", (url, expected) => {
    expect(isEphemeralMediaUrl(url)).toBe(expected);
  });
});

describe("persistRecording", () => {
  it("uploads the clip and returns the CDN URL", async () => {
    const upload = vi.fn<RecordingUploader>().mockResolvedValue({ id: "rec-1", videoUrl: CDN_URL });
    const result = await persistRecording(webmClip(), { mode: "screen+webcam", projectId: PROJECT_ID, durationMs: 42_500 }, upload);
    expect(result).toEqual({ ok: true, url: CDN_URL, recordingId: "rec-1" });
    const [file, mode, projectId, durationMs] = upload.mock.calls[0]!;
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe("video/webm;codecs=vp9,opus");
    expect([mode, projectId, durationMs]).toEqual(["screen+webcam", PROJECT_ID, 42_500]);
  });

  it("reports no_url when the server stored nothing (and never falls back to a blob URL)", async () => {
    const upload = vi.fn<RecordingUploader>().mockResolvedValue({ id: "rec-2", videoUrl: null });
    expect(await persistRecording(webmClip(), { mode: "webcam", durationMs: 1000 }, upload)).toEqual({ ok: false, reason: "no_url" });
  });

  it("rejects a blob: URL echoed back as if it were durable", async () => {
    const upload = vi.fn<RecordingUploader>().mockResolvedValue({ id: "rec-3", videoUrl: "blob:https://hired.video/abc" });
    expect(await persistRecording(webmClip(), { mode: "webcam", durationMs: 1000 }, upload)).toEqual({ ok: false, reason: "no_url" });
  });

  it("returns the error message when the upload throws (offline / 413)", async () => {
    const upload = vi.fn<RecordingUploader>().mockRejectedValue(new Error("Network error during upload"));
    expect(await persistRecording(webmClip(), { mode: "screen", durationMs: 0 }, upload)).toEqual({
      ok: false,
      reason: "error",
      message: "Network error during upload",
    });
  });
});
