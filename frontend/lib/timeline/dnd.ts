/**
 * Drag-and-drop MIME types used by the NLE timeline.
 *
 * Lives here (not on a UI component) so any source surface — the
 * studio sidebar VIDEO/STOCK MEDIA picker, a future bulk-import
 * affordance, etc. — can dispatch a drag against the same MIME without
 * importing a UI module.
 */

/** Drag MIME for "an existing MediaSource id" — payload is the id. */
export const NLE_SOURCE_DRAG_MIME = "application/x-nle-source";

/** Drag MIME for "a media item from the studio sidebar that hasn't
 *  yet been turned into a MediaSource" — payload is a JSON string of
 *  `{ url: string, mediaType: 'video' | 'audio' | 'image', filename: string }`.
 *  The NLE timeline editor probes the URL and registers the resulting
 *  MediaSource on first drop, then treats subsequent drops of the same
 *  url as the existing source. Single source of truth — the sidebar
 *  picker emits this shape; the NLE editor consumes it. */
export const NLE_MEDIA_DRAG_MIME = "application/x-nle-media";

export interface NleMediaDragPayload {
  url: string;
  mediaType: "video" | "audio" | "image";
  filename: string;
}
