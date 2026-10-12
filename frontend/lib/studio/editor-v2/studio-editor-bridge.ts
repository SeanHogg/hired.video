// Module-level registry that lets the AI CHRO's studio tools drive the
// Studio editor that is currently open IN THIS TAB — insert widgets,
// manage scenes, start a recording, add media — without the editor
// having to wire its internal state into the chat panel.
//
// Mirrors `active-form-bridge.ts` (which lets coach tools write a page's
// React-Hook-Form state). The editor calls `registerStudioEditor(handle)`
// on mount and unregisters on unmount; studio tools look the handle up
// via `requireStudioEditor()`.
//
// Why module-level (not React context): the AI chat panel is mounted
// app-globally — OUTSIDE the studio editor's React tree — so it can't
// reach editor state through context. The bridge is the shared seam both
// surfaces agree on. Studio actions are CLIENT-SIDE canvas mutations, so
// only the in-app AI CHRO (running in the same tab as the editor) can
// drive them — the server-side `/api/mcp` endpoint cannot.
//
// Self-gating: studio tools self-describe via `requiresStudioEditor` and
// are only exposed to the model when `getStudioEditor()` is non-null AND
// the handle's `supportsScenes` / `supportsRecording` flags are true
// (canvas-state authoring kinds — not game / image / animation).

import type { WidgetKind } from "./canvas-state";
import type { RecordingActionId } from "@/lib/studio/recording-modes";

/** Recording modes the editor's recorder supports, as the ActionsPanel
 *  recorder-sheet ids (dash-form, e.g. "screen-pip"). Alias of
 *  `RecordingActionId` so the bridge, palette and deep links share the
 *  one RecordingMode ↔ ActionId mapping in lib/studio/recording-modes. */
export type StudioRecordingMode = RecordingActionId;

export interface StudioSceneSummary {
  id: string;
  label: string;
  durationSeconds: number;
  widgetCount: number;
  /** True for the scene the editor is currently focused on. */
  active: boolean;
}

/** The action surface the open Studio editor exposes to AI tools. Every
 *  method wraps the SAME callback the editor's own buttons fire, so the
 *  chat-driven path and the click path can never diverge (DRY). */
export interface StudioEditorHandle {
  /** Persisted project id, or null for an unsaved draft. */
  projectId: string | null;
  /** Active mediaKind (video / podcast / comic / game / …). Tools use it
   *  to validate which widgets are insertable for this project. */
  mediaKind: string;
  /**
   * True when this project kind authors a timeline / canvas-state that
   * can take a screen/webcam recording. Game, image, animation, CAD and
   * document kinds are false — `getCoachToolSpecs` hides studio_start_recording
   * (#1911).
   */
  supportsRecording: boolean;
  /**
   * True when this project kind has scenes the studio_* scene/widget tools
   * can drive. Same kinds as `supportsRecording` today (canvas-state
   * authoring). False → those tools are not advertised (#1911).
   */
  supportsScenes: boolean;
  /** Id of the scene the editor is currently focused on. */
  getActiveSceneId: () => string;
  /** Snapshot of the scene list so the model can reference scene ids. */
  listScenes: () => StudioSceneSummary[];
  /** Widget kinds the user can currently insert (catalog ∩ mediaKind). */
  insertableWidgetKinds: () => WidgetKind[];
  /** Append a blank widget of `kind` to the active scene + select it. */
  insertWidget: (kind: WidgetKind) => void;
  /** Add a new empty scene after the active one; returns its id. */
  addScene: () => string;
  duplicateScene: (sceneId: string) => void;
  deleteScene: (sceneId: string) => void;
  /** Reorder scenes to match the given id order. Ids not present are
   *  dropped from the order (the editor filters unknown ids). */
  reorderScenes: (orderedIds: string[]) => void;
  setActiveScene: (sceneId: string) => void;
  /** Set a scene's solid background colour (clears any rich preset). */
  setSceneBackground: (sceneId: string, color: string) => void;
  /** Drop an image / video onto the active scene by URL. */
  addImageWidget: (url: string) => void;
  addVideoWidget: (url: string, durationSeconds: number) => void;
  /** Open the browser screenshot picker and place the result. */
  captureScreenshot: () => void | Promise<void>;
  /** Open the recorder armed to `mode`. Cannot auto-start capture — the
   *  browser requires a user gesture for getDisplayMedia/getUserMedia —
   *  so this surfaces the recorder UI for the user to hit Record.
   *  `asScene` (default true) makes the finished clip a new full-bleed
   *  scene; false keeps the legacy overlay-widget behaviour. */
  openRecorder: (mode: StudioRecordingMode, opts?: { asScene?: boolean }) => void;
}

// Single open editor per tab. A ref-cell rather than a Map (cf.
// active-form-bridge's Map) because there is never more than one Studio
// editor mounted at a time.
const registry: { current: StudioEditorHandle | null } = { current: null };

export function registerStudioEditor(handle: StudioEditorHandle): void {
  registry.current = handle;
}

/** Unregister on unmount. Pass the handle so a late-firing unmount of a
 *  PREVIOUS editor can't clobber a newer one that already registered. */
export function unregisterStudioEditor(handle?: StudioEditorHandle): void {
  if (!handle || registry.current === handle) {
    registry.current = null;
  }
}

export function getStudioEditor(): StudioEditorHandle | null {
  return registry.current;
}

/** Throws a user-facing Error when no editor is mounted, so an AI tool
 *  call fails loudly instead of silently no-op-ing. */
export function requireStudioEditor(): StudioEditorHandle {
  if (!registry.current) {
    throw new Error(
      "No Studio editor is open — open a video in Studio (/studio) before running this action.",
    );
  }
  return registry.current;
}
