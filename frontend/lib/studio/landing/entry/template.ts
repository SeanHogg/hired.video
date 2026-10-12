/**
 * `?template=<visual-theme-file>` — the blog "worked example" deep-link
 * (BlogStudioTemplateRow). These are V1 visual-theme files (data/templates/
 * *.json → VideoScript); the create seam converts the script to a v2 draft
 * via `kind:"script"`. `loadTemplate` is a static import — the module is
 * already in the /studio graph (StudioWizard) and each JSON file is still its
 * own lazily-loaded chunk inside it. Signed-out visitors fall back to a blank
 * anon draft via the create seam.
 */
import { loadTemplate } from "@/lib/studio/load-template";
import { projectOutcome, toastEntryError, FAILED, type EntryHandler } from "./types";

export const visualTemplateEntry: EntryHandler = {
  id: "template",
  matches: (params) => !!params.get("template"),
  run: async (ctx) => {
    try {
      const script = await loadTemplate(ctx.params.get("template") ?? "");
      if (!script) return FAILED;
      const created = await ctx.create({ kind: "script", script });
      return projectOutcome(created, ctx.params);
    } catch (err) {
      toastEntryError(ctx, "messages.studioLanding.loadTemplateFailed", err);
      return FAILED;
    }
  },
};
