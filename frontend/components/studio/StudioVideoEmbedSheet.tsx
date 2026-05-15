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
  videoTitle?: string;
}

export default function StudioVideoEmbedSheet({
  open,
  onOpenChange,
  videoId,
  videoTitle,
}: Props) {
  const [snippet, setSnippet] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !videoId) return;
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
        } else {
          setError("Could not load the embed snippet.");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Could not load the embed snippet.";
        // The endpoint 404s when the video isn't public — surface that as a
        // friendlier message rather than a raw API error.
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
  }, [open, videoId]);

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
