/**
 * The document AI panel's sink (#1934(2)): a generated image lands on the
 * document as an IMAGE BLOCK in the flow (after the selected block, or at the
 * end) — not as a widget on a video scene, which a document doesn't have.
 * Pure; the surface uploads the image first and passes its CDN url.
 */
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";
import { firstPageId, insertBlockAt, updateBlock } from "@/lib/studio/editor-v2/document-edit";

/** Insert an image block showing `url` before `beforeId` (or at the end of
 *  the first page). Returns the next state and the new block's id. */
export function insertGeneratedImageBlock(
  state: DocumentState,
  url: string,
  beforeId: string | null = null,
): { state: DocumentState; blockId: string } {
  const pageId = firstPageId(state);
  const inserted = insertBlockAt(state, pageId, { kind: "image", label: "Image" }, beforeId);
  return { state: updateBlock(inserted.state, pageId, inserted.blockId, { imageUrl: url }), blockId: inserted.blockId };
}
