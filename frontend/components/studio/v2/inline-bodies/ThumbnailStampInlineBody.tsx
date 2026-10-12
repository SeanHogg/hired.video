/**
 * ThumbnailStampInlineBody — canvas-side preview of a thumbnail
 * variant. Useful for end-of-video "watch next" stamps that show the
 * project's chosen poster frame in-scene. In playback the engagement
 * overlay adds the click-through to the parent video (#1586).
 */
import { Image as ImageIcon, Loader2 } from "lucide-react";

import { useEngagementAsset } from "@/lib/studio/engagement/use-engagement-asset";

interface Props {
  projectId: string;
  assetId: string;
}

export default function ThumbnailStampInlineBody({ projectId, assetId }: Props) {
  const loaded = useEngagementAsset("thumbnail-stamp", projectId, assetId);
  const thumb = loaded === undefined ? undefined : loaded?.kind === "thumbnail-stamp" ? loaded.thumbnail : null;

  if (thumb === undefined) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        Loading thumbnail…
      </div>
    );
  }

  if (!thumb) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-muted-foreground">
        <ImageIcon className="h-4 w-4" />
        Thumbnail not found
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded">
      <img
        src={thumb.imageUrl}
        alt={thumb.headlineText ?? "Thumbnail variant"}
        className="h-full w-full object-cover"
        loading="lazy"
      />
      {thumb.isSelected && (
        <span className="absolute top-1 left-1 rounded bg-brand-primary px-1.5 py-0.5 text-[9px] font-medium text-white">
          LIVE
        </span>
      )}
      {thumb.headlineText && (
        <div className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {thumb.headlineText}
        </div>
      )}
    </div>
  );
}
