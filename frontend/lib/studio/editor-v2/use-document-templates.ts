/**
 * useDocumentTemplates — the single source the document-canvas template picker
 * reads. Returns, for the active entity kind:
 *   • `presets`   — the built-in descriptor library (synchronous, always there)
 *   • `owned`     — the user's own saved variations / published document
 *                   templates (marketplace rows they created)
 *   • `purchased` — document templates the user claimed (free) or bought
 *
 * Owned + purchased are loaded from the SAME marketplace the video templates
 * use (`studio_templates` + `template_licenses`); a document template is just a
 * `media_kind === "document"` row whose `document_kind` names the entity
 * (a résumé template = document_kind 'resume') and whose payload is a
 * content-stripped `DocumentState`. We map each to the entity-agnostic `DocumentTemplateOption`
 * so the picker renders one card grid and the applicator has one path — no
 * branching on builtin-vs-saved-vs-bought (DRY).
 *
 * Self-gating: the hook swallows fetch failures (anonymous users, network) and
 * returns empty owned/purchased lists, so the picker degrades to presets-only
 * without the caller threading an `isAuthed` flag.
 */
import { useEffect, useState } from "react";
import {
  studioTemplatesService,
  type StudioTemplate,
} from "@/lib/services/studio-templates-service";
import {
  documentStateToTemplateOption,
  documentTemplatesForEntity,
  type DocumentTemplateOption,
} from "./document-templates";
import type { DocumentEntityKind } from "./document-state";
import { mediaKindIsDocument } from "@shared/media-kinds";

export interface DocumentTemplateGroups {
  presets: DocumentTemplateOption[];
  owned: DocumentTemplateOption[];
  purchased: DocumentTemplateOption[];
  loading: boolean;
}

/** Keep only `document` templates whose payload targets `entityKind`, mapped to
 *  options. Shared by the owned + purchased branches. */
function toOptions(
  rows: StudioTemplate[],
  entityKind: DocumentEntityKind,
  source: "owned" | "purchased",
): DocumentTemplateOption[] {
  const out: DocumentTemplateOption[] = [];
  for (const row of rows) {
    // The row's document kind (a column) says which document it designs.
    if (!mediaKindIsDocument(row.mediaKind) || row.documentKind !== entityKind) continue;
    const option = documentStateToTemplateOption(row.videoScript, {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      source,
    });
    if (option) out.push(option);
  }
  return out;
}

export function useDocumentTemplates(
  entityKind: DocumentEntityKind,
): DocumentTemplateGroups {
  const presets = documentTemplatesForEntity(entityKind);
  const [owned, setOwned] = useState<DocumentTemplateOption[]>([]);
  const [purchased, setPurchased] = useState<DocumentTemplateOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [mine, licensed] = await Promise.all([
          studioTemplatesService.listMine().catch(() => [] as StudioTemplate[]),
          studioTemplatesService
            .listMyLicensedTemplates()
            .catch(() => []),
        ]);
        if (cancelled) return;
        setOwned(toOptions(mine, entityKind, "owned"));
        setPurchased(
          toOptions(
            licensed.map((l) => l.template),
            entityKind,
            "purchased",
          ),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityKind]);

  return { presets, owned, purchased, loading };
}
