/**
 * useEntityDocument — the document-canvas design linked to an entity (a job
 * posting, a company page) for its public page (#274/#275). The owner reads
 * their own linked project (drafts included); everyone else reads only a
 * project the owner made public. The content comes from the entity row, the
 * same `loadDocumentEntity` the studio editor binds, so the page renders
 * exactly what the canvas authors (preview === render === view).
 *
 * Anyone can link their OWN project to any subject id, so a visitor only ever
 * sees a design authored by one of the entity's owners (`authorIds`) — never
 * a stranger's project hung on someone else's job or company.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { documentEntityKindOf } from "@shared/document-entity-kinds";
import type { StudioSubject } from "@shared/studio-subject";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import type { DocumentEntityContent, DocumentState } from "@/lib/studio/editor-v2/document-state";
import { loadDocumentEntity } from "./document-entity";
import { validateDocumentContent } from "./field-validation";
import { mediaKindIsDocument } from "@shared/media-kinds";

export interface EntityDocument {
  project: StudioProject;
  state: DocumentState;
  content: DocumentEntityContent | null;
}

export interface EntityDocumentResult {
  doc: EntityDocument | null;
  loading: boolean;
  /** Owner: show or hide the design to visitors. Showing it PUBLISHES the
   *  page, so it runs the publish-tier validation first (a company's
   *  industry / size / address, a job's title + description — #1915) and
   *  returns the issues instead of publishing. [] = done. Throws when the
   *  visibility write fails. */
  setPublic: (isPublic: boolean) => Promise<string[]>;
}

/** The newest document project linked to the subject that the viewer may see. */
async function findVisibleProject(
  subject: StudioSubject,
  isOwner: boolean,
  authorIds: readonly string[],
): Promise<StudioProject | null> {
  if (isOwner) return studioService.findDocumentProject(subject);
  const res = await studioService.getPublicProjects(subject);
  const docs = (res.data ?? []).filter((p) => mediaKindIsDocument(p.mediaKind) && authorIds.includes(p.userId));
  docs.sort((a, b) => b.updateDateTime.localeCompare(a.updateDateTime));
  return docs[0] ?? null;
}

/** A stored payload is a renderable document when it names its entity kind
 *  and carries pages (older / malformed rows render nothing). */
function asDocumentState(payload: unknown): DocumentState | null {
  if (!documentEntityKindOf(payload)) return null;
  const pages = (payload as { pages?: unknown }).pages;
  return Array.isArray(pages) && pages.length > 0 ? (payload as DocumentState) : null;
}

export interface EntityDocumentInput {
  subject: StudioSubject;
  /** The viewer owns the entity (sees their own drafts, can toggle). */
  isOwner: boolean;
  /** Users whose designs may show to visitors: the entity's owner (plus a
   *  company's team). */
  authorIds: readonly string[];
}

export function useEntityDocument({ subject, isOwner, authorIds }: EntityDocumentInput): EntityDocumentResult {
  const { t } = useTranslation();
  const [doc, setDoc] = useState<EntityDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const project = await findVisibleProject(subject, isOwner, authorIds);
        const state = project ? asDocumentState(project.documentState) : null;
        // Only a design OF this entity (a job doc on a job, not some other
        // document that happens to be linked).
        if (!project || !state || state.entityKind !== subject.kind) {
          if (!cancelled) setDoc(null);
          return;
        }
        // The canvas renders THIS entity row's live content.
        const loaded = await loadDocumentEntity({ ...state, entityId: subject.id });
        if (!cancelled) setDoc({ project, state, content: loaded?.content ?? null });
      } catch {
        // No design is the safe fallback — the page's standard view shows.
        if (!cancelled) setDoc(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // authorIds is identity-unstable from callers; its joined value is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject.kind, subject.id, isOwner, authorIds.join(",")]);

  const setPublic = useCallback(
    async (isPublic: boolean): Promise<string[]> => {
      if (!doc) return [];
      const projectId = doc.project.id;
      if (isPublic) {
        const issues = validateDocumentContent(
          doc.state.entityKind,
          doc.content as Record<string, unknown> | null,
          t,
          "publish",
        );
        if (issues.length > 0) return issues;
      }
      await studioService.updateProjectVisibility(projectId, isPublic);
      setDoc((d) => (d && d.project.id === projectId ? { ...d, project: { ...d.project, isPublic } } : d));
      return [];
    },
    [doc, t],
  );

  return { doc, loading, setPublic };
}
