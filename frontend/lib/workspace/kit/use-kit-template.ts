/**
 * useKitTemplate — the career kit wearing a résumé template (`?design=<ref>`,
 * the target of every résumé "Use this template": resumeTemplateHref).
 *
 * ONE apply path for both kinds of résumé template:
 *   - a built-in preset id        → the kit's Design pick (setTemplateId);
 *   - a résumé studio template    → fetched through the studio-template API
 *     (listing slug or id). Its design is either a page layout, stored on
 *     the résumé as one undoable step (withDocumentLayout) and rendered as
 *     the résumé's own design, or — for a legacy row — a built-in preset it
 *     names.
 * A ref that resolves to nothing usable toasts and leaves the résumé as is.
 */
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ResumeContent } from "@shared/resume";
import { useToast } from "@/hooks/use-toast";
import { getTemplateById } from "@/types/resume-template";
import { withDocumentLayout } from "@/lib/resume-design";
import { studioTemplatesService } from "@/lib/services/studio-templates-service";
import { resumeTemplateDesign, type ResumeTemplateDesign } from "@/lib/templates/resume-template-design";

interface Args {
  content: ResumeContent | null;
  commit: (next: ResumeContent, group?: string) => void;
  setTemplateId: (templateId: string) => void;
  keepSavedDesign: () => void;
}

/** The design a `?design=` ref names — a preset synchronously, a studio
 *  template after a fetch. Null when it names nothing wearable. */
export async function resolveKitDesign(ref: string): Promise<ResumeTemplateDesign | null> {
  if (getTemplateById(ref)) return { kind: "preset", templateId: ref };
  try {
    return resumeTemplateDesign(await studioTemplatesService.getBySlugOrId(ref));
  } catch {
    return null;
  }
}

export function useKitTemplate({ content, commit, setTemplateId, keepSavedDesign }: Args): (ref: string) => void {
  const { t } = useTranslation();
  const { toast } = useToast();
  // The fetch resolves later: apply to the draft as it is THEN.
  const contentRef = useRef(content);
  contentRef.current = content;

  return useCallback(
    (ref: string) => {
      const apply = (design: ResumeTemplateDesign | null) => {
        if (design?.kind === "preset") {
          setTemplateId(design.templateId);
          return;
        }
        const latest = contentRef.current;
        if (design?.kind === "layout" && latest) {
          commit(withDocumentLayout(latest, design.layout), "entry:template");
          keepSavedDesign();
          return;
        }
        toast({ title: t("workspace.template.unavailable"), variant: "destructive" });
      };
      // A preset applies in the same render as the draft's own defaults.
      if (getTemplateById(ref)) apply({ kind: "preset", templateId: ref });
      else void resolveKitDesign(ref).then(apply);
    },
    [commit, setTemplateId, keepSavedDesign, toast, t],
  );
}
