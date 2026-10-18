/**
 * WebcamRecorder session state machine.
 *
 *   idle ──PREVIEW_READY──▶ previewing ──RECORDING_STARTED──▶ recording
 *    ▲                          │                                 │
 *    │◀──PREVIEW_CANCELLED──────┤                                 │
 *    │◀──SCREEN_SHARE_ENDED─────┘                                 │
 *    │                                                            ▼
 *    └────────────────────RETAKE──────────────────────── recorded ◀─RECORDING_FINISHED
 *
 * The reducer applies each event exactly as the pre-split component's
 * setState calls did (no extra guards), so behaviour is unchanged.
 */
import type { RecordingState } from "./types";

export interface RecorderState {
  status: RecordingState;
  elapsedSec: number;
  error: string | null;
  recordedBlob: Blob | null;
  recordedUrl: string | null;
}

export type RecorderEvent =
  /** Start / retry of preview acquisition — clears any prior error. */
  | { type: "PREVIEW_REQUESTED" }
  | { type: "PREVIEW_READY" }
  /** Acquisition failed or a device op (flip / resolution) failed. */
  | { type: "ERROR"; error: string }
  /** User released the preview via the explicit Stop sharing / Cancel button. */
  | { type: "PREVIEW_CANCELLED" }
  /** Browser-tray "Stop sharing" during preview. */
  | { type: "SCREEN_SHARE_ENDED"; error: string }
  | { type: "RECORDING_STARTED" }
  | { type: "TICK"; elapsedSec: number }
  | { type: "RECORDING_FINISHED"; blob: Blob; url: string }
  | { type: "RETAKE" };

export const initialRecorderState: RecorderState = {
  status: "idle",
  elapsedSec: 0,
  error: null,
  recordedBlob: null,
  recordedUrl: null,
};

export function recorderReducer(
  state: RecorderState,
  event: RecorderEvent,
): RecorderState {
  switch (event.type) {
    case "PREVIEW_REQUESTED":
      return state.error === null ? state : { ...state, error: null };
    case "PREVIEW_READY":
      return { ...state, status: "previewing" };
    case "ERROR":
      return { ...state, error: event.error };
    case "PREVIEW_CANCELLED":
      return { ...state, error: null, status: "idle" };
    case "SCREEN_SHARE_ENDED":
      return { ...state, status: "idle", error: event.error };
    case "RECORDING_STARTED":
      return { ...state, elapsedSec: 0, status: "recording" };
    case "TICK":
      // Same-value bail-out, as useState did for an unchanged second.
      return state.elapsedSec === event.elapsedSec
        ? state
        : { ...state, elapsedSec: event.elapsedSec };
    case "RECORDING_FINISHED":
      return {
        ...state,
        recordedBlob: event.blob,
        recordedUrl: event.url,
        status: "recorded",
      };
    case "RETAKE":
      return {
        ...state,
        recordedBlob: null,
        recordedUrl: null,
        elapsedSec: 0,
        status: "idle",
      };
  }
}
