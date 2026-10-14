import { LayoutTemplate } from "lucide-react";
import {
  studioTemplatesService,
  type StudioTemplate,
} from "@/lib/services/studio-templates-service";
import { isResumeStudioTemplate } from "@/lib/templates/resume-template-design";
import type { LinkedContentMeta } from "./types";

/** Per-row discriminator for the one `template` kind: résumé templates
 *  (studio_templates with documentKind 'resume', folded in by mig 0520)
 *  vs every other creator template the user authored. There is no second
 *  LinkedContentKind — the subtitle is the only split. */
export function linkedContentTemplateSubtitle(
  t: Pick<StudioTemplate, "mediaKind" | "documentKind">,
): string {
  return isResumeStudioTemplate(t) ? "Resume template" : "Studio template";
}

export const TEMPLATE_LINKED_CONTENT: LinkedContentMeta = {
  label: "Template",
  sectionLabel: "Your templates",
  icon: LayoutTemplate,
  // Marketplace listing page accepts slug OR id (`getBySlugOrId`). There is
  // no `publicTemplatePath` in shared/public-paths — this is the public
  // viewer URL every other template surface already uses (`templatePageHref`).
  viewUrl: (id) => `/marketplace/templates/${encodeURIComponent(id)}`,
  ctaLabel: "View template",
  listForUser: async () => {
    // ONE store: studio_templates already unions video / document / résumé
    // creator templates (mig 0520 folded resume_templates in). No separate
    // resume-template listing service ships today.
    const items = await studioTemplatesService.listMine();
    return items
      .filter((t): t is typeof t & { id: string } => Boolean(t.id))
      .map((t) => ({
        kind: "template" as const,
        id: t.id,
        title: t.name || "Untitled template",
        subtitle: linkedContentTemplateSubtitle(t),
      }));
  },
  fetchSummary: async (id) => {
    try {
      const t = await studioTemplatesService.getById(id);
      if (!t?.id) return null;
      const description = typeof t.description === "string" ? t.description : "";
      const tags = Array.isArray(t.tags)
        ? t.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 4)
        : [];
      return {
        kind: "template",
        id: t.id,
        title: t.name || "Untitled template",
        subtitle: linkedContentTemplateSubtitle(t),
        body: description ? [description.slice(0, 200)] : [],
        badges: [t.visibility, t.mediaKind, ...tags].filter(
          (s): s is string => Boolean(s),
        ),
      };
    } catch {
      return null;
    }
  },
};
