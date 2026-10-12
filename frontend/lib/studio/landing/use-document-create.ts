/**
 * useDocumentCreate — the studio create step's "Create" (#2221). One path for
 * every document a visitor starts from the create flow:
 *
 *   résumé  → a career kit (résumés are edited on the kit page, never a loose
 *             studio document): a new MASTER kit, or a VARIANT branched off
 *             one of the viewer's masters (`createResumeVariation`) — wearing
 *             the picked design either way (`?design=`).
 *   job /   → a studio document seeded with the picked design BEFORE the
 *   company   editor mounts (`applyDocumentTemplate` on a blank state), so
 *             the canvas opens on-brand; no pick = the plain input template.
 *
 * The pure decision (`documentCreatePlan`) is split from the hook so the
 * branching is unit-tested without a router.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { resumeService } from "@/lib/services/resume-service";
import { DESIGN_PARAM, resumeEditorPath, resumeTemplateHref } from "@/lib/studio/resume-editor-link";
import { kitResumePath } from "@/lib/workspace/workspace-route";
import { newId } from "@/lib/studio/editor-v2/document-edit";
import { createBlankDocumentState, type DocumentState } from "@/lib/studio/editor-v2/document-state";
import { applyDocumentTemplate, type DocumentTemplateOption } from "@/lib/studio/editor-v2/document-templates";
import { DOCUMENT_AUTHORING } from "@/lib/studio/studio-authoring";
import { useCreateStudioDraft } from "@/lib/studio/use-create-studio-draft";

/** The documents the create step makes. */
export const CREATABLE_DOCUMENT_KINDS = ["resume", "job", "company"] as const;
export type CreatableDocumentKind = (typeof CREATABLE_DOCUMENT_KINDS)[number];

/** Résumé only: start a new master, or branch a variant off a master. */
export type ResumeStart = { mode: "master" } | { mode: "variant"; parentId: string };

export type DocumentCreatePlan =
  /** Go straight to a URL (a résumé master kit). */
  | { type: "navigate"; to: string }
  /** Branch a variant off `parentId`, then open it (wearing `design`). */
  | { type: "variant"; parentId: string; design: string | null }
  /** Mint a studio document from this seeded state. */
  | { type: "document"; documentState: DocumentState }
  /** Mint from the kind's plain input template (no design picked). */
  | { type: "template"; kind: "job" | "company" };

/** What Create does for a kind + picked design (+ résumé start). Pure. */
export function documentCreatePlan(
  kind: CreatableDocumentKind,
  design: DocumentTemplateOption | null,
  resumeStart: ResumeStart = { mode: "master" },
  idFactory: () => string = () => newId("blk"),
): DocumentCreatePlan {
  if (kind === "resume") {
    if (resumeStart.mode === "variant") {
      return { type: "variant", parentId: resumeStart.parentId, design: design?.id ?? null };
    }
    return {
      type: "navigate",
      to: design ? resumeTemplateHref(design.id, null) : `${NEW_KIT_PATH}?start=resume`,
    };
  }
  if (!design) return { type: "template", kind };
  return {
    type: "document",
    documentState: applyDocumentTemplate(createBlankDocumentState(kind, idFactory), design, idFactory),
  };
}

/** Where a freshly branched variant opens (with its design, if any). */
export function variantHref(resumeId: string, design: string | null): string {
  return design
    ? kitResumePath(resumeId, new URLSearchParams({ [DESIGN_PARAM]: design }))
    : resumeEditorPath(resumeId);
}

export function useDocumentCreate() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { create, creating } = useCreateStudioDraft();
  const [branching, setBranching] = useState(false);

  async function start(
    kind: CreatableDocumentKind,
    design: DocumentTemplateOption | null,
    resumeStart?: ResumeStart & { parentTitle?: string },
  ): Promise<void> {
    const plan = documentCreatePlan(kind, design, resumeStart);
    switch (plan.type) {
      case "navigate":
        navigate(plan.to);
        return;
      case "variant": {
        setBranching(true);
        try {
          const title = t("studio.create.variantTitle", { title: resumeStart?.parentTitle ?? "" });
          const variant = await resumeService.createResumeVariation(plan.parentId, title);
          navigate(variantHref(variant.id, plan.design));
        } catch (err) {
          toast({
            title: t("studio.create.variantFailed"),
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          });
        } finally {
          setBranching(false);
        }
        return;
      }
      case "template":
        await create({ kind: "template", templateId: DOCUMENT_AUTHORING[plan.kind].createTemplate });
        return;
      case "document":
        await create({
          kind: "document",
          documentState: plan.documentState,
          name: t(`labels.studioLanding.${kind}FallbackName`),
        });
        return;
    }
  }

  return { start, busy: creating || branching };
}
