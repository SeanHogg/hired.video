/**
 * Open an EXISTING document entity (job / article) on the canvas
 * (#1914/#1915). Registry-driven — ONE flow for every kind (DRY, see
 * [studio-authoring.ts](../../studio-authoring.ts)): reuse the linked project
 * if present (#1882), else build the entity's DocumentState, bind the
 * subject, and mint a `kind:"document"` project. Per-kind logic is only the
 * `load(id)` that fetches the row + seeds its doc state; adding a new
 * document entity = one `documentEditEntry(...)` module + one
 * DOCUMENT_AUTHORING entry.
 */
import { studioService } from "@/lib/services/studio-service";
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";
import {
  DOCUMENT_AUTHORING,
  type DocumentAuthoringKind,
} from "@/lib/studio/studio-authoring";
import type { StudioSubject } from "@shared/studio-subject";
import {
  projectOutcome,
  toastEntryError,
  FAILED,
  type EntryContext,
  type EntryHandler,
} from "./types";

export type DocumentLoader = (
  id: string,
  ctx: EntryContext,
) => Promise<{ name: string; documentState: DocumentState }>;

export function documentEditEntry(
  kind: DocumentAuthoringKind,
  load: DocumentLoader,
): EntryHandler {
  const { editParam, subjectKind } = DOCUMENT_AUTHORING[kind];
  return {
    id: `edit:${kind}`,
    matches: (params) => !!params.get(editParam),
    run: async (ctx) => {
      const editId = ctx.params.get(editParam) ?? "";
      try {
        const subject: StudioSubject = { kind: subjectKind, id: editId };
        // Reopen the project already linked to this entity, if any — so
        // "Edit" lands straight in the editor instead of minting a duplicate
        // on every click (#1882). Null on the first-ever edit.
        const existing = await studioService.findDocumentProject(subject);
        if (existing) return projectOutcome(existing, ctx.params);
        const { name, documentState } = await load(editId, ctx);
        const created = await ctx.create({
          kind: "document",
          documentState,
          name,
          subjects: [subject],
        });
        return projectOutcome(created, ctx.params);
      } catch (err) {
        toastEntryError(ctx, "messages.studioLanding.openContentFailed", err);
        return FAILED;
      }
    },
  };
}
