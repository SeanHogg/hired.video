/**
 * Drag protocol — single source of truth for "what's being dragged into
 * the v2 canvas?". Every draggable in the left rail writes its kind +
 * payload via `writeDragPayload()` on dragstart; the canvas drop target
 * reads back via `readDragPayload()` and dispatches by `kind`.
 *
 * Per the standing DRY rule: there is ONE place that defines the MIME
 * names, ONE place that serialises the payload, and ONE place (the
 * CanvasStage drop handler) that branches on kind. No picker re-rolls
 * its own dataTransfer protocol.
 */

import type { WidgetKind } from "./canvas-state";

export type DragKind =
  | "widget"
  | "theme"
  | "background"
  | "font"
  | "music"
  | "media-url"
  | "linked-content"
  | "screenshot";

/**
 * Per-kind MIME type. Multiple types can be present on the same drag
 * (rare but allowed) — the drop handler reads the first kind it
 * recognises in `KIND_ORDER`.
 */
export const DRAG_MIME: Record<DragKind, string> = {
  widget: "application/x-studio-widget-kind",
  theme: "application/x-studio-theme-id",
  background: "application/x-studio-bg-value",
  font: "application/x-studio-font-id",
  music: "application/x-studio-music-id",
  "media-url": "application/x-studio-media-url",
  "linked-content": "application/x-studio-linked-content-ref",
  screenshot: "application/x-studio-screenshot-trigger",
};

const KIND_ORDER: DragKind[] = [
  "widget",
  "linked-content",
  "media-url",
  "screenshot",
  "background",
  "theme",
  "font",
  "music",
];

export interface DragPayload {
  kind: DragKind;
  /** Primary payload. Interpreted per kind:
   *   - widget   → WidgetKind id
   *   - theme    → VisualTheme.id
   *   - background → BgPreset.value (the encoded "type:color:color" string)
   *   - font     → FontPreset.id
   *   - music    → MusicTrack.id
   *   - media-url → URL string
   *   - linked-content → `<entityKind>:<entityId>` (see
   *     `lib/studio/editor-v2/linked-content.ts:encodeLinkedContentRef`)
   *   - screenshot → opaque marker string (the actual frame is captured
   *     after drop, by `useScreenshotCapture`, so no payload is needed) */
  data: string;
  /** Set for `media-url` drops so the canvas knows whether to drop an
   *  Image or Video widget. */
  mediaType?: "image" | "video";
}

/**
 * Write a payload onto a dragstart event's dataTransfer. Sets the
 * primary MIME for the kind + a fallback `text/plain` so unintended
 * drops outside the canvas (e.g. into a text field) read something
 * legible instead of failing silently.
 */
export function writeDragPayload(
  dt: DataTransfer,
  payload: DragPayload,
): void {
  dt.effectAllowed = "copy";
  dt.setData(DRAG_MIME[payload.kind], payload.data);
  if (payload.mediaType) {
    dt.setData("application/x-studio-media-type", payload.mediaType);
  }
  dt.setData("text/plain", payload.data);
}

/**
 * Read the first recognised payload from a drop event's dataTransfer.
 * Returns null when no kind matches — caller treats that as "ignore
 * the drop".
 */
export function readDragPayload(dt: DataTransfer): DragPayload | null {
  for (const kind of KIND_ORDER) {
    const data = dt.getData(DRAG_MIME[kind]);
    if (!data) continue;
    const mediaType =
      kind === "media-url"
        ? (dt.getData("application/x-studio-media-type") as
            | "image"
            | "video"
            | "")
        : "";
    return {
      kind,
      data,
      ...(mediaType ? { mediaType } : {}),
    };
  }
  return null;
}

/**
 * Pre-check used by `onDragOver` to decide whether to call
 * `preventDefault()` (which unlocks the drop). dataTransfer.getData()
 * returns "" during dragover for security reasons, so we have to test
 * the types list instead. ANY of our MIMEs => acceptable.
 */
export function hasRecognisedPayload(dt: DataTransfer): boolean {
  return KIND_ORDER.some((kind) => dt.types.includes(DRAG_MIME[kind]));
}

/**
 * Identify the dragged kind from `dataTransfer.types` (the only data
 * available during dragover). Returns null when the drag carries no
 * recognised MIME. Used by drop-target chrome (CanvasStage, ScenesRail)
 * to show kind-aware highlight + label before the user actually drops.
 */
export function detectDragKind(dt: DataTransfer): DragKind | null {
  for (const kind of KIND_ORDER) {
    if (dt.types.includes(DRAG_MIME[kind])) return kind;
  }
  return null;
}

/**
 * Human-readable label + tone per drag kind. Used by every drop-target
 * surface so the highlight chrome reads the same wording across the
 * editor — DRY single source for "what does dropping this do?".
 */
export interface DragKindMeta {
  label: string;
  accent:
    | "brand-purple"
    | "sky-500"
    | "emerald-500"
    | "amber-500"
    | "rose-500"
    | "indigo-500";
}

export const DRAG_KIND_META: Record<DragKind, DragKindMeta> = {
  widget: { label: "Drop to add widget", accent: "brand-purple" },
  theme: { label: "Drop to apply theme", accent: "indigo-500" },
  background: { label: "Drop to set background", accent: "emerald-500" },
  font: { label: "Drop on a text widget", accent: "amber-500" },
  music: { label: "Drop on the timeline", accent: "rose-500" },
  "media-url": { label: "Drop to add media", accent: "sky-500" },
  "linked-content": { label: "Drop to embed your content", accent: "indigo-500" },
  screenshot: { label: "Drop to capture a screenshot", accent: "sky-500" },
};

// Re-export WidgetKind so consumers of the protocol that build widget
// payloads don't import from two places.
export type { WidgetKind };
