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
  | "media-url";

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
};

const KIND_ORDER: DragKind[] = [
  "widget",
  "media-url",
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
   *   - media-url → URL string */
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
      ...(mediaType ? { mediaType: mediaType as "image" | "video" } : {}),
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

// Re-export WidgetKind so consumers of the protocol that build widget
// payloads don't import from two places.
export type { WidgetKind };
