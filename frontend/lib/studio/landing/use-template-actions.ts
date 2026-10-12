/**
 * useTemplateActions — the Templates section's Use / Preview handlers for
 * built-in catalog rows and owned (created / claimed / purchased) rows.
 * "Use" mints a draft through the page's shared `create` and routes the
 * user to `/studio/<real-id>`; "Preview" opens the public marketplace page.
 */
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import type { ContentTemplate } from "@/lib/studio/templates/catalog";
import { studioBuiltinSlug } from "@/lib/templates/registry";
import type { StudioTemplate } from "@/lib/services/studio-templates-service";
import { studioTemplateStart } from "@/lib/studio/studio-template-start";
import type { CreateStudioDraft } from "./types";

export function useTemplateActions(create: CreateStudioDraft) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();

  function openTemplate(templateId: string) {
    // skipNavigate is set on the shared `create` so the deep-link
    // forwarder can append UI-state seed params (?capture=) onto the
    // destination URL. Carousel clicks don't need that, so route the
    // user straight to /studio/<id> here.
    //
    // Forward `?contentTemplate=<id>` on the destination URL so the
    // editor knows the project's mediaKind synchronously at mount —
    // without this, audio-only kinds (podcast / voice) briefly flash
    // the video defaults (Widgets tab + collapsed timeline) before
    // the post-load effect re-applies the kind-aware defaults. Pure
    // UI hint, server is the SoT for `studio_projects.media_kind`.
    void create({ kind: "template", templateId: templateId as ContentTemplate })
      .then((created) => {
        if (created) {
          navigate(
            `/studio/${encodeURIComponent(created.id)}?contentTemplate=${encodeURIComponent(templateId)}`,
          );
        }
      });
  }

  // Open a user-published (or claimed/purchased) studio template — mints
  // a new draft project from the template's canvas script and routes the
  // user to /studio/<real-id>. Mirrors the `?studioTemplate=` deep-link
  // handler in useStudioLandingEntry; kept here so the carousel/grid card
  // clicks don't need to fake a URL bounce.
  async function openStudioTemplate(template: StudioTemplate) {
    const start = studioTemplateStart(template);
    if (!start) {
      toast({
        title: t("messages.studioLanding.templateNoContentTitle"),
        description: t("messages.studioLanding.templateNoContentBody"),
        variant: "destructive",
      });
      return;
    }
    try {
      const created = await create(start);
      if (created) navigate(`/studio/${encodeURIComponent(created.id)}`);
    } catch (err) {
      toast({
        title: t("messages.studioLanding.openTemplateFailed"),
        description: err instanceof Error ? err.message : t("errors.unknownErrorAdmin"),
        variant: "destructive",
      });
    }
  }

  // Preview a user-published template — same listing page the
  // marketplace + built-in carousel both link to. Falls back to the
  // template id when the row hasn't generated a slug yet (private +
  // unlisted drafts).
  function previewStudioTemplate(template: StudioTemplate) {
    const slug = template.listingSlug ?? template.id;
    navigate(`/marketplace/templates/${slug}`);
  }

  // Click-through to the public marketplace preview page. Same URL the
  // homepage / search results / TemplateCard "Preview" buttons open, so
  // /studio cards and every other surface land on the same SEO page.
  function previewTemplate(templateId: ContentTemplate) {
    navigate(`/marketplace/templates/${studioBuiltinSlug(templateId)}`);
  }

  return { openTemplate, openStudioTemplate, previewStudioTemplate, previewTemplate };
}
