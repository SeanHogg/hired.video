/**
 * Overlay media → résumé interactivity (#2153).
 *
 * A résumé is interactive: an item (a role, a project, a degree…) carries
 * media through `content.metaData[]` rows bound to the item's stable `id`
 * (`ResumeSectionMeta.referenceId`), and the renderer plays them back
 * (`ItemMediaStrip`). When an image or video is dropped onto an item on the
 * document canvas, the overlay gets a `mediaBinding` (document-state.ts) and
 * this module writes the matching `metaData` row back into the ENTITY
 * content — so a studio-made image dropped on an experience card makes that
 * card interactive, and it survives section reorder (binding by id, never by
 * index).
 *
 * The row's id is the overlay widget's id, so moving the overlay onto
 * another item re-binds the same row instead of adding a second one, and
 * deleting the overlay removes exactly its row. Nothing else in the content
 * changes (skillEvidence and every section keep their references).
 *
 * Pure (plus one DOM read helper, `bindingAtPoint`).
 */
import { MetaType, type ResumeContent, type ResumeSectionMeta } from "@shared/resume";
import { listResolvableItems } from "@shared/skill-evidence";
import type { MediaBinding } from "@/lib/studio/editor-v2/document-state";

/** The attributes a renderer entry carries so a drop can find its item. */
export const RESUME_ITEM_ID_ATTR = "data-resume-item-id";

export interface BoundMedia {
  /** The overlay widget's id — the metaData row's id. */
  overlayId: string;
  url: string;
  kind: "image" | "video";
  /** The résumé owner (ResumeSectionMeta.userId). */
  userId: string;
  name?: string;
}

/** The binding for the item with this stable id, or null when the content
 *  has no such item (a stale id, a section without ids). */
export function resolveMediaBinding(content: ResumeContent, referenceId: string): MediaBinding | null {
  const item = listResolvableItems(content).find((i) => i.id === referenceId);
  return item ? { referenceId: item.id, itemType: item.itemType } : null;
}

function metaTypeFor(media: BoundMedia): ResumeSectionMeta["metaType"] {
  if (media.kind === "image") return MetaType.Image;
  return /\.webm(\?|#|$)/i.test(media.url) ? MetaType.VideoWebM : MetaType.VideoMP4;
}

export type BindMediaResult =
  | { ok: true; content: ResumeContent; binding: MediaBinding }
  | { ok: false; reason: "unknown-item" | "empty-url" };

/** Upsert the overlay's metaData row on the item `referenceId` names. */
export function upsertBoundMedia(
  content: ResumeContent,
  referenceId: string,
  media: BoundMedia,
  now: () => string = () => new Date().toISOString(),
): BindMediaResult {
  if (!media.url.trim()) return { ok: false, reason: "empty-url" };
  const binding = resolveMediaBinding(content, referenceId);
  if (!binding) return { ok: false, reason: "unknown-item" };
  const rows = content.metaData ?? [];
  const existing = rows.find((r) => r.id === media.overlayId);
  const row: ResumeSectionMeta = {
    ...(existing ?? {}),
    id: media.overlayId,
    userId: existing?.userId ?? media.userId,
    referenceId: binding.referenceId,
    name: media.name ?? existing?.name ?? "",
    metaType: metaTypeFor(media),
    url: media.url,
    createdAt: existing?.createdAt ?? now(),
  };
  const metaData = existing ? rows.map((r) => (r.id === media.overlayId ? row : r)) : [...rows, row];
  return { ok: true, content: { ...content, metaData }, binding };
}

/** Drop the overlay's metaData row (the overlay was deleted or unbound).
 *  Returns the same content when there is no such row. */
export function removeBoundMedia(content: ResumeContent, overlayId: string): ResumeContent {
  const rows = content.metaData;
  if (!rows?.some((r) => r.id === overlayId)) return content;
  return { ...content, metaData: rows.filter((r) => r.id !== overlayId) };
}

/** The résumé item under a screen point (the drop point of a media drag),
 *  read from the renderer's `data-resume-item-id` marks. */
export function bindingAtPoint(clientX: number, clientY: number, doc: Document = document): string | null {
  for (const el of doc.elementsFromPoint(clientX, clientY)) {
    const marked = el.closest(`[${RESUME_ITEM_ID_ATTR}]`);
    const id = marked?.getAttribute(RESUME_ITEM_ID_ATTR);
    if (id) return id;
  }
  return null;
}
