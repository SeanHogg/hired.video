// Studio-side wrapper around the generic <EmbedSheet>. Fetches the iframe
// snippet from `/api/studio/videos/:videoId/embed` on open, then hands it
// to the shared sheet. Self-gates on `videoId` — render <EmbedSheet> with a
// not-yet-public error if the video isn't ready, so the caller never has to
// pre-check.

import { useEffect, useState } from "react";
import { EmbedSheet } from "@/components/EmbedSheet";
import { studioService } from "@/lib/services/studio-service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The `videos.id` row used by the embed endpoint. For studio projects
   *  this is `project.youtubeVideoId ?? project.id` (the same id used in
   *  the public `/v/:id` URL). */
  videoId: string | null;
  /** Studio project id (#696). When the project has no published render
   *  (`/api/studio/videos/:id/embed` 404s), fall back to a project-keyed
   *  iframe at `/embedded/studio/:projectId`, which the unified player
   *  serves straight from `studio_projects` — so unrendered-but-public
   *  projects are still embeddable. */
  projectId?: string | null;
  videoTitle?: string;
}

/** Build the project-keyed iframe snippet client-side (#696). The
 *  `/embedded/studio/:id` route mounts the unified player, so this works
 *  without a published `videos.id`. */
function projectEmbedSnippet(projectId: string, title?: string): string {
  const src = `https://hired.video/embedded/studio/${projectId}`;
  const safeTitle = (title ?? "Video").replace(/"/g, "&quot;");
  return `<iframe width="640" height="360" src="${src}" title="${safeTitle}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
}

export default function StudioVideoEmbedSheet({
  open,
  onOpenChange,
  videoId,
  projectId,
  videoTitle,
}: Props) {
  const [snippet, setSnippet] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // #696 — a public project with no published render has no `videos.id`
    // embed row. Serve the project-keyed iframe directly instead of
    // showing "make it public". Rendered / YouTube projects still prefer
    // the richer backend snippet below.
    const projectFallback = (): boolean => {
      if (!projectId) return false;
      setSnippet(projectEmbedSnippet(projectId, videoTitle));
      setPreviewUrl(`https://hired.video/v/${projectId}`);
      setError(null);
      return true;
    };
    if (!videoId) {
      // No render id at all — go straight to the project iframe.
      if (!projectFallback()) setError("Save and publish the project to embed it.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSnippet(null);
    setPreviewUrl(null);
    studioService
      .getVideoEmbed(videoId)
      .then((res) => {
        if (cancelled) return;
        if (res.data) {
          setSnippet(res.data.embedHtml);
          setPreviewUrl(res.data.shareUrl);
        } else if (!projectFallback()) {
          setError("Could not load the embed snippet.");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // The endpoint 404s when there's no published render — fall back to
        // the project-keyed embed before surfacing any error.
        if (projectFallback()) return;
        const msg = err instanceof Error ? err.message : "Could not load the embed snippet.";
        setError(
          /not found|404/i.test(msg)
            ? "Make the video public to generate an embed snippet."
            : msg,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, videoId, projectId, videoTitle]);

  return (
    <EmbedSheet
      open={open}
      onOpenChange={onOpenChange}
      snippet={snippet}
      previewUrl={previewUrl}
      heading={videoTitle ? `Embed "${videoTitle}"` : "Embed this video"}
      description="Paste this iframe snippet onto your website, blog, or job posting. The video stays in sync with edits and re-renders you publish here."
      loading={loading}
      error={error}
    />
  );
}
