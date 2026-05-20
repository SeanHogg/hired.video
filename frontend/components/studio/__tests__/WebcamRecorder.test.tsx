/**
 * WebcamRecorder regression tests.
 *
 * The recorder is the single surface that backs every "record yourself"
 * entry point in Studio — the webcam widget's "Record from webcam"
 * dialog, the screen-recording template, and the "Screen + PiP"
 * voice-over mode. It has regressed twice in the way the screenshot
 * captures: clicking the basic webcam button surfaces a
 * "Screen share was cancelled. Click 'Share Screen' again to retry."
 * error, because the AbortError branch in the catch hard-coded the
 * screen-share noun + verb regardless of mode. That's the SOLID
 * violation — mode-specific copy was scattered across ternaries in
 * the render tree but not the error mapper.
 *
 * These tests pin:
 *   1. The error-copy map (`mapMediaAcquisitionError`) varies by mode
 *      for AbortError and is mode-agnostic for the camera/permission
 *      errors that are always camera-shaped (NotAllowedError etc).
 *   2. Each mode hits only the media APIs it should — `webcam` mode
 *      must never call `getDisplayMedia`, and `screen` mode must
 *      never request video from `getUserMedia` (mic-only).
 *   3. The component renders mode-appropriate panel title / idle hint
 *      / start-button verb so a future ternary added to the render
 *      tree won't silently drift from the table.
 *   4. The header is wired to RECORDING_MODES — adding a fourth mode
 *      is one record, not a hunt through switch statements.
 *
 * Run: vitest run components/studio/__tests__/WebcamRecorder.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  WebcamRecorder,
  RECORDING_MODES,
  mapMediaAcquisitionError,
  type RecordingMode,
} from "@/components/studio/WebcamRecorder";

// ---------------------------------------------------------------------------
// Test doubles for the browser media APIs jsdom does not implement.
// ---------------------------------------------------------------------------

function makeTrack(kind: "audio" | "video") {
  return {
    kind,
    enabled: true,
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getSettings: () => ({ width: 1920, height: 1080 }),
  };
}

function makeStream(tracks: ReturnType<typeof makeTrack>[]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    addTrack: vi.fn(),
  } as unknown as MediaStream;
}

function makeWebcamStream() {
  return makeStream([makeTrack("video"), makeTrack("audio")]);
}

function makeScreenStream() {
  return makeStream([makeTrack("video"), makeTrack("audio")]);
}

function makeMicStream() {
  return makeStream([makeTrack("audio")]);
}

let getUserMediaMock: ReturnType<typeof vi.fn>;
let getDisplayMediaMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getUserMediaMock = vi.fn();
  getDisplayMediaMock = vi.fn();

  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: getUserMediaMock,
      getDisplayMedia: getDisplayMediaMock,
    },
  });

  // MediaRecorder is referenced inside getSupportedMimeType() even
  // before recording starts, and again at start. Minimal shim.
  class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    state = "inactive";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    start = vi.fn();
    stop = vi.fn();
  }
  (globalThis as unknown as { MediaRecorder: typeof FakeMediaRecorder }).MediaRecorder =
    FakeMediaRecorder;

  // AudioContext is constructed during startAudioAnalysis — the
  // recorder swallows its constructor throwing, but giving it a real
  // shape avoids touching unrelated code paths.
  class FakeAudioContext {
    createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
    createAnalyser = vi.fn(() => ({
      fftSize: 0,
      frequencyBinCount: 16,
      getByteFrequencyData: vi.fn(),
    }));
    close = vi.fn(() => Promise.resolve());
  }
  (globalThis as unknown as { AudioContext: typeof FakeAudioContext }).AudioContext =
    FakeAudioContext;

  // requestAnimationFrame fires a single tick synchronously; the
  // recorder uses it for the audio meter + canvas composite and
  // doesn't care that it never re-fires in tests.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());

  // HTMLCanvasElement.captureStream is not in jsdom; PiP composite
  // needs it.
  (
    HTMLCanvasElement.prototype as unknown as { captureStream: () => MediaStream }
  ).captureStream = () => makeStream([makeTrack("video"), makeTrack("audio")]);

  // jsdom returns undefined from HTMLMediaElement.play, but the
  // recorder treats it as a Promise (`.play().catch(...)`). Real
  // browsers return a Promise per spec — stub it so the test
  // environment matches the production contract.
  (
    HTMLMediaElement.prototype as unknown as { play: () => Promise<void> }
  ).play = () => Promise.resolve();

  // jsdom doesn't ship `MediaStream`. Screen-only mode builds one
  // from the screen video tracks + mic audio tracks; before this
  // shim that constructor threw "MediaStream is not defined" which
  // dropped the recorder back to error state and made every screen-
  // mode preview-state assertion impossible to reach.
  class FakeMediaStream {
    private tracks: Array<ReturnType<typeof makeTrack>>;
    constructor(tracks: Array<ReturnType<typeof makeTrack>> = []) {
      this.tracks = [...tracks];
    }
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks.filter((t) => t.kind === "audio"); }
    getVideoTracks() { return this.tracks.filter((t) => t.kind === "video"); }
    addTrack(t: ReturnType<typeof makeTrack>) { this.tracks.push(t); }
  }
  (globalThis as unknown as { MediaStream: typeof FakeMediaStream }).MediaStream =
    FakeMediaStream;

  // 2D canvas context is referenced by the PiP composite path.
  if (!HTMLCanvasElement.prototype.getContext) {
    (
      HTMLCanvasElement.prototype as unknown as {
        getContext: () => CanvasRenderingContext2D;
      }
    ).getContext = () =>
      ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D;
  } else {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D,
    );
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Pure helper — the bug surface lives here.
// ---------------------------------------------------------------------------

describe("mapMediaAcquisitionError", () => {
  it("AbortError in WEBCAM mode says 'Camera access was cancelled', NOT 'Screen share' (regression #screencam-abort-copy)", () => {
    const err = new DOMException("aborted", "AbortError");
    const msg = mapMediaAcquisitionError(err, "webcam");
    expect(msg).toContain("Camera access was cancelled");
    expect(msg).toContain("Start Camera");
    expect(msg).not.toContain("Screen share");
    expect(msg).not.toContain("Share Screen");
  });

  it("AbortError in SCREEN mode says 'Screen share was cancelled'", () => {
    const err = new DOMException("aborted", "AbortError");
    expect(mapMediaAcquisitionError(err, "screen")).toBe(
      'Screen share was cancelled. Click "Share Screen" again to retry.',
    );
  });

  it("AbortError in SCREEN+WEBCAM mode says 'Screen share was cancelled' (the screen picker is the canonical AbortError source in PiP)", () => {
    const err = new DOMException("aborted", "AbortError");
    expect(mapMediaAcquisitionError(err, "screen+webcam")).toBe(
      'Screen share was cancelled. Click "Share Screen" again to retry.',
    );
  });

  it("NotAllowedError is mode-agnostic — always points the user at the permission prompt", () => {
    const err = new DOMException("denied", "NotAllowedError");
    for (const mode of ["webcam", "screen", "screen+webcam"] as RecordingMode[]) {
      expect(mapMediaAcquisitionError(err, mode)).toMatch(
        /permission denied/i,
      );
    }
  });

  it("NotFoundError tells the user to plug a device in", () => {
    const err = new DOMException("missing", "NotFoundError");
    expect(mapMediaAcquisitionError(err, "webcam")).toMatch(
      /no camera or microphone found/i,
    );
  });

  it.each(["NotReadableError", "TrackStartError"])(
    "%s names the 'busy device' apps the user should close",
    (name) => {
      const err = new DOMException("busy", name);
      const msg = mapMediaAcquisitionError(err, "webcam");
      expect(msg).toMatch(/being used by another app/i);
      expect(msg).toMatch(/Zoom|Slack|OBS/);
    },
  );

  it("OverconstrainedError points at the resolution setting", () => {
    const err = new DOMException("constraints", "OverconstrainedError");
    expect(mapMediaAcquisitionError(err, "webcam")).toMatch(
      /resolution/i,
    );
  });

  it("falls back to a generic message for unknown DOMException names", () => {
    const err = new DOMException("weird", "WeirdError");
    expect(mapMediaAcquisitionError(err, "webcam")).toContain("weird");
  });

  it("handles non-DOMException errors (plain Error, string)", () => {
    expect(mapMediaAcquisitionError(new Error("boom"), "webcam")).toContain(
      "boom",
    );
    expect(mapMediaAcquisitionError("oh no", "webcam")).toContain("oh no");
  });
});

// ---------------------------------------------------------------------------
// RECORDING_MODES table — locks the contract every other surface reads.
// ---------------------------------------------------------------------------

describe("RECORDING_MODES table", () => {
  it("has exactly the three supported modes in a stable order", () => {
    expect(RECORDING_MODES.map((m) => m.id)).toEqual([
      "webcam",
      "screen",
      "screen+webcam",
    ]);
  });

  it("every mode has a non-empty accessNoun / startVerb (drift guard)", () => {
    for (const m of RECORDING_MODES) {
      expect(m.accessNoun.trim().length).toBeGreaterThan(0);
      expect(m.startVerb.trim().length).toBeGreaterThan(0);
      expect(m.panelTitle.trim().length).toBeGreaterThan(0);
      expect(m.idleHint.trim().length).toBeGreaterThan(0);
    }
  });

  it("webcam mode is the only one whose accessNoun mentions the camera", () => {
    const webcam = RECORDING_MODES.find((m) => m.id === "webcam")!;
    expect(webcam.accessNoun.toLowerCase()).toContain("camera");
    const screen = RECORDING_MODES.find((m) => m.id === "screen")!;
    expect(screen.accessNoun.toLowerCase()).not.toContain("camera");
  });
});

// ---------------------------------------------------------------------------
// Mode → media-API routing. These are the wiring checks that catch the
// "webcam mode somehow triggered screen share" class of regression.
// ---------------------------------------------------------------------------

describe("WebcamRecorder media-API routing", () => {
  it("WEBCAM mode calls getUserMedia ONCE with video+audio, and never calls getDisplayMedia", async () => {
    getUserMediaMock.mockResolvedValue(makeWebcamStream());
    const user = userEvent.setup();

    render(<WebcamRecorder onRecordingComplete={vi.fn()} mode="webcam" />);
    await user.click(screen.getByRole("button", { name: /start camera/i }));

    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    expect(getDisplayMediaMock).not.toHaveBeenCalled();
    const constraints = getUserMediaMock.mock.calls[0][0];
    expect(constraints.audio).toBe(true);
    expect(constraints.video).toBeTruthy();
    expect(constraints.video).not.toBe(false);
  });

  it("SCREEN mode calls getDisplayMedia + getUserMedia(audio-only, video:false) — no camera prompt for voice-over users", async () => {
    getDisplayMediaMock.mockResolvedValue(makeScreenStream());
    getUserMediaMock.mockResolvedValue(makeMicStream());
    const user = userEvent.setup();

    render(<WebcamRecorder onRecordingComplete={vi.fn()} mode="screen" />);
    await user.click(screen.getByRole("button", { name: /share screen/i }));

    expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);
    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    const micConstraints = getUserMediaMock.mock.calls[0][0];
    expect(micConstraints.video).toBe(false);
    expect(micConstraints.audio).toBe(true);
  });

  it("SCREEN+WEBCAM mode acquires the WEBCAM before the screen picker (so a busy camera doesn't waste a screen pick)", async () => {
    const order: string[] = [];
    getUserMediaMock.mockImplementation(async () => {
      order.push("user");
      return makeWebcamStream();
    });
    getDisplayMediaMock.mockImplementation(async () => {
      order.push("display");
      return makeScreenStream();
    });
    const user = userEvent.setup();

    render(
      <WebcamRecorder onRecordingComplete={vi.fn()} mode="screen+webcam" />,
    );
    await user.click(screen.getByRole("button", { name: /share screen/i }));

    expect(order).toEqual(["user", "display"]);
  });
});

// ---------------------------------------------------------------------------
// Mode-specific error copy — this is the user-visible regression.
// ---------------------------------------------------------------------------

describe("WebcamRecorder error copy", () => {
  it("WEBCAM mode + AbortError shows the CAMERA copy, not the screenshot bug's 'Screen share' copy", async () => {
    getUserMediaMock.mockRejectedValue(
      new DOMException("aborted", "AbortError"),
    );
    const user = userEvent.setup();

    render(<WebcamRecorder onRecordingComplete={vi.fn()} mode="webcam" />);
    await user.click(screen.getByRole("button", { name: /start camera/i }));

    expect(
      await screen.findByText(/Camera access was cancelled/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Screen share was cancelled/i),
    ).not.toBeInTheDocument();
  });

  it("SCREEN mode + AbortError (user dismissed picker) shows the screen-share copy", async () => {
    getDisplayMediaMock.mockRejectedValue(
      new DOMException("aborted", "AbortError"),
    );
    const user = userEvent.setup();

    render(<WebcamRecorder onRecordingComplete={vi.fn()} mode="screen" />);
    await user.click(screen.getByRole("button", { name: /share screen/i }));

    expect(
      await screen.findByText(/Screen share was cancelled/i),
    ).toBeInTheDocument();
  });

  it("renders a Try-again retry button when an error fires in idle (gap #490 — picker-cancel dead end)", async () => {
    getUserMediaMock.mockRejectedValue(
      new DOMException("aborted", "AbortError"),
    );
    const user = userEvent.setup();

    render(<WebcamRecorder onRecordingComplete={vi.fn()} mode="webcam" />);
    await user.click(screen.getByRole("button", { name: /start camera/i }));

    expect(
      await screen.findByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("stops every track that did get acquired before the error (no leaked streams on half-failed PiP)", async () => {
    const webcam = makeWebcamStream();
    getUserMediaMock.mockResolvedValue(webcam);
    getDisplayMediaMock.mockRejectedValue(
      new DOMException("aborted", "AbortError"),
    );
    const user = userEvent.setup();

    render(
      <WebcamRecorder onRecordingComplete={vi.fn()} mode="screen+webcam" />,
    );
    await user.click(screen.getByRole("button", { name: /share screen/i }));

    await screen.findByText(/Screen share was cancelled/i);
    for (const track of webcam.getTracks()) {
      expect((track as unknown as { stop: ReturnType<typeof vi.fn> }).stop)
        .toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// Mode-driven labels in the idle render — guards against the next
// "someone added a ternary that drifted from the table" regression.
// ---------------------------------------------------------------------------

describe("WebcamRecorder idle render labels", () => {
  it.each(RECORDING_MODES)(
    "mode=$id renders its panelTitle, idleHint, and startVerb verbatim",
    (mode) => {
      render(
        <WebcamRecorder onRecordingComplete={vi.fn()} mode={mode.id} />,
      );
      expect(screen.getByText(mode.panelTitle)).toBeInTheDocument();
      expect(screen.getByText(mode.idleHint)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: new RegExp(mode.startVerb, "i") }),
      ).toBeInTheDocument();
    },
  );

  it("every mode has a non-empty cancelPreviewLabel (drift guard)", () => {
    for (const m of RECORDING_MODES) {
      expect(m.cancelPreviewLabel.trim().length).toBeGreaterThan(0);
    }
  });

  it("screen modes label the cancel button as 'Stop sharing' (matches the browser tray copy)", () => {
    expect(
      RECORDING_MODES.find((m) => m.id === "screen")!.cancelPreviewLabel,
    ).toBe("Stop sharing");
    expect(
      RECORDING_MODES.find((m) => m.id === "screen+webcam")!.cancelPreviewLabel,
    ).toBe("Stop sharing");
  });
});

// ---------------------------------------------------------------------------
// Preview-state UX — the user-reported "I can't tell how to back out of a
// screen share, or when sharing has stopped" thread.
// ---------------------------------------------------------------------------

describe("WebcamRecorder preview-state UX", () => {
  it("SCREEN mode shows a visible 'Sharing screen' badge while previewing — no more guessing whether the capture is live", async () => {
    getDisplayMediaMock.mockResolvedValue(makeScreenStream());
    getUserMediaMock.mockResolvedValue(makeMicStream());
    const user = userEvent.setup();

    render(<WebcamRecorder onRecordingComplete={vi.fn()} mode="screen" />);
    await user.click(screen.getByRole("button", { name: /share screen/i }));

    expect(await screen.findByText(/sharing screen/i)).toBeInTheDocument();
  });

  it("WEBCAM mode does NOT show the 'Sharing screen' badge (badge is screen-only — webcam users have the camera light)", async () => {
    getUserMediaMock.mockResolvedValue(makeWebcamStream());
    const user = userEvent.setup();

    render(<WebcamRecorder onRecordingComplete={vi.fn()} mode="webcam" />);
    await user.click(screen.getByRole("button", { name: /start camera/i }));

    expect(screen.queryByText(/sharing screen/i)).not.toBeInTheDocument();
  });

  it("SCREEN mode preview renders a 'Stop sharing' button that releases every stream and returns to idle", async () => {
    const screenStream = makeScreenStream();
    const micStream = makeMicStream();
    getDisplayMediaMock.mockResolvedValue(screenStream);
    getUserMediaMock.mockResolvedValue(micStream);
    const user = userEvent.setup();

    render(<WebcamRecorder onRecordingComplete={vi.fn()} mode="screen" />);
    await user.click(screen.getByRole("button", { name: /share screen/i }));

    const stop = await screen.findByRole("button", { name: /stop sharing/i });
    await user.click(stop);

    // Every track from every stream we acquired must be stopped — no
    // leaking the browser's "sharing" tray or holding the mic open.
    for (const track of [
      ...screenStream.getTracks(),
      ...micStream.getTracks(),
    ]) {
      expect((track as unknown as { stop: ReturnType<typeof vi.fn> }).stop)
        .toHaveBeenCalled();
    }
    // Back to idle — the "Share Screen" affordance is visible again.
    expect(
      screen.getByRole("button", { name: /share screen/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sharing screen/i)).not.toBeInTheDocument();
  });

  it("WEBCAM mode preview renders a 'Cancel' button (not 'Stop sharing' — there's no screen capture to release)", async () => {
    getUserMediaMock.mockResolvedValue(makeWebcamStream());
    const user = userEvent.setup();

    render(<WebcamRecorder onRecordingComplete={vi.fn()} mode="webcam" />);
    await user.click(screen.getByRole("button", { name: /start camera/i }));

    expect(
      await screen.findByRole("button", { name: /^cancel$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /stop sharing/i }),
    ).not.toBeInTheDocument();
  });

  it("browser-native 'Stop sharing' (track 'ended') during PREVIEW returns to idle with a clear notice — no stale frame, no dead-end UI", async () => {
    const screenStream = makeScreenStream();
    getDisplayMediaMock.mockResolvedValue(screenStream);
    getUserMediaMock.mockResolvedValue(makeMicStream());
    const user = userEvent.setup();

    render(<WebcamRecorder onRecordingComplete={vi.fn()} mode="screen" />);
    await user.click(screen.getByRole("button", { name: /share screen/i }));
    // Wait for preview to settle.
    await screen.findByText(/sharing screen/i);

    // Locate the 'ended' listener the component registered on the
    // screen video track and fire it — that's what Chrome does when
    // the user clicks "Stop sharing" in the native tray.
    const videoTrack = screenStream.getVideoTracks()[0] as unknown as {
      addEventListener: ReturnType<typeof vi.fn>;
    };
    const endedListener = videoTrack.addEventListener.mock.calls.find(
      ([evt]) => evt === "ended",
    )?.[1] as (() => void) | undefined;
    expect(endedListener).toBeDefined();
    // Wrap the manual dispatch in act() — the listener flips React
    // state (setRecordingState/setError) and without act() React
    // logs an "update outside act" warning that masks real failures.
    act(() => { endedListener!(); });

    expect(
      await screen.findByText(/screen sharing ended/i),
    ).toBeInTheDocument();
    // Back to idle — Share Screen button is visible again.
    expect(
      screen.getByRole("button", { name: /share screen/i }),
    ).toBeInTheDocument();
  });

});
