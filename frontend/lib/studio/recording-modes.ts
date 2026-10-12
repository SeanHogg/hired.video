/**
 * Recording-source table — the single source of truth for every
 * recording-mode chooser in Studio (RecordingModeButtons in the Actions
 * panel's Recording & Audio section and the recorder's in-panel source
 * picker, template `defaultRecordingMode`, the extension `?capture=` URL
 * param) and for the RecordingMode <-> ActionId mapping.
 *
 * Pure data + i18n keys, no React / lucide imports: the editor's main
 * bundle can render the chooser without pulling the (lazy-loaded)
 * MediaRecorder chunk in WebcamRecorder.tsx, and lib/ hooks can map a
 * `?capture=` value to the matching Actions-panel sheet.
 */
import type { ActionId } from "@/lib/studio/editor-v2/editor-types";

/** Recording source the WebcamRecorder mounts in. Used as the source
 *  of truth for every recording-mode chooser in Studio (the Recording
 *  & Audio section's quick-launch buttons, the in-panel mode picker,
 *  template `defaultRecordingMode`, the extension `?capture=` URL
 *  param). Don't write a second copy of these strings — import this. */
export type RecordingMode = "webcam" | "screen" | "screen+webcam";

/** Display metadata for each recording mode. Single source — every
 *  surface that lets the user pick a recording mode reads from this
 *  list so labels + ordering can never drift. Every copy field is an
 *  i18n KEY (`*Key`), never a literal — consumers render it via
 *  `t(m.labelKey)` so the table stays a pure, framework-free module.
 *  Icons are looked up by consumer (we don't import lucide here to
 *  keep this file tree-shakable from the Async Interview / Code
 *  Walkthrough surfaces that don't render the picker themselves). */
export const RECORDING_MODES: ReadonlyArray<{
  id: RecordingMode;
  /** i18n key — short label for chip / button. */
  labelKey: string;
  /** i18n key — long label used in the open-panel header ("Webcam Recording"). */
  panelTitleKey: string;
  /** Icon name from lucide-react — consumers do their own
   *  `import { Video, Monitor, MonitorPlay } from 'lucide-react'`
   *  and switch on this id. Keeps this module dep-free. */
  iconName: "video" | "monitor" | "monitor-play";
  /** i18n key — tooltip / aria description. */
  descriptionKey: string;
  /** i18n key — idle-state hint shown inside the recorder viewport
   *  before the user has acquired any media. */
  idleHintKey: string;
  /** i18n key — verb on the primary "start" button in idle state
   *  ("Start Camera" vs "Share Screen"). Keeps every label-vs-mode
   *  coupling in this single table. */
  startVerbKey: string;
  /** i18n key — noun used in error copy ("Camera access was cancelled"
   *  vs "Screen share was cancelled"). The AbortError surface used to
   *  hard-code "Screen share" regardless of mode, so dismissing the
   *  camera permission prompt in webcam mode showed a misleading
   *  screen-share error. Single source — every error message that
   *  varies by mode pulls from here. */
  accessNounKey: string;
  /** i18n key — label on the preview-state cancel button — "Stop
   *  sharing" for screen modes (mirrors the browser's own tray copy so
   *  users know the screen-share is the thing they're releasing),
   *  "Cancel" for webcam. Without this button the preview state was a
   *  dead end: the only forward action was Record, and the only "back
   *  out" gesture was the browser's native Stop-sharing tray which left
   *  the panel showing a frozen preview frame. */
  cancelPreviewLabelKey: string;
}> = [
  {
    id: "webcam",
    labelKey: "webcamRecorder.mode.webcam.label",
    panelTitleKey: "webcamRecorder.mode.webcam.panelTitle",
    iconName: "video",
    descriptionKey: "webcamRecorder.mode.webcam.description",
    idleHintKey: "webcamRecorder.mode.webcam.idleHint",
    startVerbKey: "webcamRecorder.mode.webcam.startVerb",
    accessNounKey: "webcamRecorder.mode.webcam.accessNoun",
    cancelPreviewLabelKey: "actions.cancel",
  },
  {
    id: "screen",
    labelKey: "webcamRecorder.mode.screen.label",
    panelTitleKey: "webcamRecorder.mode.screen.panelTitle",
    iconName: "monitor",
    descriptionKey: "webcamRecorder.mode.screen.description",
    idleHintKey: "webcamRecorder.mode.screen.idleHint",
    startVerbKey: "webcamRecorder.shareScreen",
    accessNounKey: "webcamRecorder.screenShareNoun",
    cancelPreviewLabelKey: "webcamRecorder.stopSharing",
  },
  {
    id: "screen+webcam",
    labelKey: "webcamRecorder.mode.screenPip.label",
    panelTitleKey: "webcamRecorder.mode.screenPip.panelTitle",
    iconName: "monitor-play",
    descriptionKey: "webcamRecorder.mode.screenPip.description",
    idleHintKey: "webcamRecorder.mode.screenPip.idleHint",
    startVerbKey: "webcamRecorder.shareScreen",
    accessNounKey: "webcamRecorder.screenShareNoun",
    cancelPreviewLabelKey: "webcamRecorder.stopSharing",
  },
];

/** Actions-panel sheets that host the recorder — one per RecordingMode. */
export type RecordingActionId = Extract<ActionId, "webcam" | "screen" | "screen-pip">;

/** RecordingMode -> the Actions-panel sheet that opens the recorder armed
 *  in that mode. The ONLY place the two vocabularies meet: the bridge /
 *  palette / deep links speak ActionId ("screen-pip"), the recorder
 *  speaks RecordingMode ("screen+webcam"). */
export const RECORDING_MODE_ACTION: Readonly<Record<RecordingMode, RecordingActionId>> = {
  webcam: "webcam",
  screen: "screen",
  "screen+webcam": "screen-pip",
};

/** Inverse of RECORDING_MODE_ACTION — the recorder mode an open action
 *  arms, or null when the action is not a recorder sheet. */
export function recordingModeForAction(id: ActionId | null): RecordingMode | null {
  if (id === null) return null;
  return RECORDING_MODES.find((m) => RECORDING_MODE_ACTION[m.id] === id)?.id ?? null;
}

/** Narrows an arbitrary string (e.g. the `?capture=` URL param) to a mode. */
export function isRecordingMode(value: string | null | undefined): value is RecordingMode {
  return RECORDING_MODES.some((m) => m.id === value);
}
