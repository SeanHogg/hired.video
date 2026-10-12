// LinkPreviewCard — the unfurled-link card (#1968), shared by the
// composer (live POST /api/feed/link-preview result) and FeedPostCard
// (the preview the server resolved and stored at create time). Image,
// title, description and site name each self-gate, and the card falls
// back to the bare URL when the page exposed no OpenGraph tags.

import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LinkPreviewResponse } from "@/types/feed";

interface Props {
  preview: LinkPreviewResponse | null;
  loading?: boolean;
  /** False when the card sits inside another link (a reshare embed) —
   *  renders a plain block so anchors don't nest. */
  interactive?: boolean;
}

export function LinkPreviewCard({ preview, loading, interactive = true }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3" role="status">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("feed.linkPreview.loading")}
      </div>
    );
  }
  if (!preview) return null;

  const { url, title, description, imageUrl, siteName } = preview;
  const body = (
    <>
      {imageUrl && (
        <img
          src={imageUrl}
          alt={title ?? t("feed.linkPreview.imageAlt")}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-32 object-cover bg-muted"
        />
      )}
      <div className="p-3 bg-muted/30 min-w-0">
        {siteName && (
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{siteName}</p>
        )}
        <p className="text-xs font-medium line-clamp-2 break-words">{title ?? url}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 break-words">{description}</p>
        )}
      </div>
    </>
  );
  const frame = "mt-3 block min-w-0 border rounded-lg overflow-hidden";
  if (!interactive) return <div className={frame}>{body}</div>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`${frame} hover:bg-muted/40 transition-colors`}
    >
      {body}
    </a>
  );
}

export default LinkPreviewCard;
