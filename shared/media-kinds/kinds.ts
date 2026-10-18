/** Media-kind enum + type guard. See ../media-kinds.ts for the axis overview. */

export const MEDIA_KINDS = [
  "video",
  "podcast",
  "voice",
  "animation",
  "game",
  "comic",
  "interactive_comic",
  "image",
  "cad",
  "cad_3d",
  // Paged WYSIWYG document runtime (#1912) — resume / job / article / blog
  // authored on a fixed print sheet. Self-hosting canvas (DocumentStage),
  // exports PDF. State shape: frontend/lib/studio/editor-v2/document-state.ts.
  "document",
] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

export function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === "string" && (MEDIA_KINDS as readonly string[]).includes(value);
}
