/**
 * `?studioTemplate=<slug>` — a creator-published template (marketplace
 * "Use"). Mints a draft from the template's payload (the shared core:
 * lib/studio/studio-template-start); a résumé template opens the career kit
 * wearing it instead.
 */
import { loadStudioTemplateStart } from "@/lib/studio/studio-template-start";
import { resumeTemplateHref } from "@/lib/studio/resume-editor-link";
import { projectOutcome, toastEntryError, FAILED, type EntryHandler } from "./types";

export const studioTemplateEntry: EntryHandler = {
  id: "studioTemplate",
  matches: (params) => !!params.get("studioTemplate"),
  run: async (ctx) => {
    const { t, toast } = ctx;
    try {
      const start = await loadStudioTemplateStart(ctx.params.get("studioTemplate") ?? "");
      if (!start) {
        toast({
          title: t("messages.studioLanding.templateNoContentTitle"),
          description: t("messages.studioLanding.templateNoContentBody"),
          variant: "destructive",
        });
        return FAILED;
      }
      if (start.kind === "resumeTemplate") return { type: "navigate", to: resumeTemplateHref(start.design) };
      const created = await ctx.create(start);
      return projectOutcome(created, ctx.params);
    } catch (err) {
      toastEntryError(ctx, "messages.studioLanding.loadTemplateFailed", err);
      return FAILED;
    }
  },
};
