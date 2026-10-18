/**
 * Starting work from a creator-published studio template — ONE core for
 * every place that does it (the editor's `?studioTemplate=`, the /studio
 * deep-link entry, the Templates section's "Use" and the marketplace's
 * useApplyTemplate): load the template and build the create input
 * (`useCreateStudioDraft`) its kind starts from. Each caller keeps its own
 * toasts and navigation.
 *
 *   résumé template  (document, documentKind 'resume')
 *                    → `resumeTemplate`: a career kit wearing it — a résumé
 *                      is made in the kit, never as a loose document
 *   other document   → `document`: a new document project seeded with the
 *                      template's (content-free) layout
 *   everything else  → `script`: the template's canvas script
 *
 * A template without a payload has nothing to start from (null).
 */
import { studioTemplatesService, type StudioTemplate } from "@/lib/services/studio-templates-service";
import { isResumeStudioTemplate } from "@/lib/templates/resume-template-design";
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";
import type { VideoScript } from "@/types/video-script";
import { mediaKindIsDocument } from "@shared/media-kinds";

/** The create input (`useCreateStudioDraft`) a studio template starts from. */
export type StudioTemplateStart =
  | { kind: "script"; script: VideoScript; name: string }
  | { kind: "document"; documentState: DocumentState; name: string }
  /** `design` = the template's listing slug (or id) — the kit fetches it. */
  | { kind: "resumeTemplate"; design: string };

type TemplateFacts = Pick<StudioTemplate, "id" | "listingSlug" | "videoScript" | "name" | "mediaKind" | "documentKind">;

/** The template's create input — null when it carries no payload. */
export function studioTemplateStart(template: TemplateFacts): StudioTemplateStart | null {
  const payload = template.videoScript;
  if (!payload || typeof payload !== "object") return null;
  if (isResumeStudioTemplate(template)) {
    return { kind: "resumeTemplate", design: template.listingSlug ?? template.id };
  }
  if (mediaKindIsDocument(template.mediaKind)) {
    // A template is structure, not content: the new document binds to no entity.
    return { kind: "document", documentState: { ...(payload as DocumentState), entityId: null }, name: template.name };
  }
  return { kind: "script", script: payload as VideoScript, name: template.name };
}

/** Fetch the template by its listing slug (or id), then
 *  `studioTemplateStart`. Rejects when the fetch fails. */
export async function loadStudioTemplateStart(slug: string): Promise<StudioTemplateStart | null> {
  return studioTemplateStart(await studioTemplatesService.getBySlugOrId(slug));
}
