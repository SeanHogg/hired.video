/**
 * The document format's bound entity (#1920 / #1914): redirects a
 * résumé-bound document to the kit workspace (résumés are created and edited only
 * there), and loads (or seeds) the entity's content once the document
 * runtime hydrates. Lifted out of StudioEditorV2.
 *
 * The in-studio résumé branches (upload-into-canvas, Version History, the
 * template re-skin) were removed with #2311: the redirect below means a
 * résumé document never stays open in the studio.
 */
import { useEffect } from "react";
import { mediaKindIsDocument, type MediaKind } from "@shared/media-kinds";
import { useRedirectResumeDocument } from "@/lib/studio/resume-editor-link";
import { loadDocumentEntity, seedDocumentContent } from "@/lib/studio/document/document-entity";
import { useAuth } from "@/lib/auth";
import { useJobDocumentFormBridge } from "@/lib/studio/document/use-job-document-form-bridge";
import { useJobPostGuard } from "@/lib/studio/job-post-access";
import type { DocumentRuntime } from "./use-history-runtimes";

export function useDocumentEntity(currentMediaKind: MediaKind, documentRuntime: DocumentRuntime): void {
  const { documentState, documentStateHydrated, setDocumentEntityContent } = documentRuntime;
  const { user } = useAuth();

  // The AI coach fills a job document through the active-form bridge (#1915).
  useJobDocumentFormBridge(currentMediaKind, documentRuntime);
  // A NEW job posting is for recruiters / employers only (#1915).
  useJobPostGuard(
    mediaKindIsDocument(currentMediaKind) &&
      documentStateHydrated &&
      documentState.entityKind === "job" &&
      !documentState.entityId,
  );

  // A document bound to a résumé is edited in the kit workspace, not here.
  useRedirectResumeDocument(
    mediaKindIsDocument(currentMediaKind) && documentStateHydrated ? documentState.entityKind : null,
    documentState.entityId,
  );

  // Once the document runtime hydrates, load the bound entity's content (so
  // section blocks render real data), or seed a blank record for a fresh
  // draft with no entity row yet (lib/studio/document/document-entity).
  useEffect(() => {
    if (!mediaKindIsDocument(currentMediaKind) || !documentStateHydrated) return;
    let cancelled = false;
    void loadDocumentEntity(documentState).then(async (loaded) => {
      if (cancelled) return;
      if (!loaded) {
        // A fresh draft — an employer's job posting starts with their
        // company (as the retired JobCreatePage did).
        const seeded = await seedDocumentContent(documentState.entityKind, user);
        if (!cancelled) setDocumentEntityContent((prev) => prev ?? seeded);
        return;
      }
      setDocumentEntityContent(loaded.content);
    });
    return () => {
      cancelled = true;
    };
    // documentState.entityId is the binding signal; entityKind is stable.
  }, [currentMediaKind, documentStateHydrated, documentState.entityId]);
}
