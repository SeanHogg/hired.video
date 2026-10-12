/**
 * Shared types for the /studio landing page (StudioLanding) and its
 * section components under `components/studio/landing/`.
 */
import type { TemplateDef } from "@/lib/studio/templates/catalog";
import type { StudioTemplate } from "@/lib/services/studio-templates-service";
import type { useCreateStudioDraft } from "@/lib/studio/use-create-studio-draft";

/** The page's single shared `create` (minted with `skipNavigate: true`). */
export type CreateStudioDraft = ReturnType<typeof useCreateStudioDraft>["create"];

// Normalised shape the owned-template surfaces consume so the card +
// carousel renderers don't branch on "is this a creator-published row or
// a license join". The provenance field gates the badge label and the
// Edit affordance — only `created` rows get an edit pencil because
// purchased rows don't belong to the viewer.
export type OwnedTemplate = {
  template: StudioTemplate;
  provenance: "created" | "purchased" | "claimed";
};

// Discriminated row the unified carousel renders — built-in catalog rows
// and owned rows share one scroller, the card switches on `kind`.
export type TemplateRow =
  | { kind: "builtin"; template: TemplateDef }
  | { kind: "owned"; owned: OwnedTemplate };
