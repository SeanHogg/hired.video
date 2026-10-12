/**
 * useKitDesignTemplate — "Save design as template" in the career kit: the
 * design on screen becomes one of the user's résumé templates (a studio
 * template, media kind 'document' / document kind 'resume'), through the
 * ONE publish path (POST /api/studio/templates/from-resume/:id).
 *
 * Self-gating: only a signed-in account (not a guest) with the résumé saved
 * can save its design — the API also refuses anyone but the résumé's owner.
 * The payload is the live design (kitDesignDocument); the server strips any
 * content from it before storing.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ResumeContent } from "@shared/resume";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";
import { useAuth } from "@/lib/auth";
import {
  studioTemplatesService,
  type StudioTemplate,
  type TemplatePublishFields,
} from "@/lib/services/studio-templates-service";
import { kitDesignDocument } from "@/lib/templates/resume-design-document";

interface Args {
  /** The kit's saved résumé — null until the draft is saved. */
  resumeId: string | null;
  content: ResumeContent | null;
  /** The design on screen. */
  descriptor: ResumeTemplateDescriptor;
  /** The résumé still shows its own stored design (maybe a studio layout). */
  usingSavedDesign: boolean;
}

export interface KitDesignTemplate {
  /** Whether this visitor may save the design (signed in, résumé saved). */
  available: boolean;
  resumeId: string | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  publish: (fields: TemplatePublishFields) => Promise<StudioTemplate>;
}

export function useKitDesignTemplate({ resumeId, content, descriptor, usingSavedDesign }: Args): KitDesignTemplate {
  const { t } = useTranslation();
  const { user, isGuest } = useAuth();
  const [open, setOpen] = useState(false);

  const publish = useCallback(
    (fields: TemplatePublishFields) => {
      if (!resumeId) return Promise.reject(new Error(t("workspace.designTemplate.saveFirst")));
      return studioTemplatesService.publishFromResume(resumeId, {
        ...fields,
        videoScript: kitDesignDocument(content, descriptor, usingSavedDesign),
      });
    },
    [resumeId, content, descriptor, usingSavedDesign, t],
  );

  return { available: !!user && !isGuest && !!resumeId, resumeId, open, setOpen, publish };
}
