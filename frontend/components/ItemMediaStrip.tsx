/**
 * ItemMediaStrip — drop-in widget that surfaces per-item media attachments
 * (production stills, demo videos, YouTube reels, hyperlinks) on any resume
 * item that supports id-based metaData binding (work, volunteer, project,
 * education, basics, skills, etc.). Reads `content.metaData` (or the
 * metaData array directly) and filters to entries whose `referenceId`
 * matches this item's id.
 *
 * Self-gating per the DRY rule — takes only `{ itemId, metaData, variant }`
 * and decides whether to render anything. Returns null when the item has
 * no bound media, when itemId is missing, or when metaData is empty.
 * Consumers don't pass `hasMedia` or `showMedia` booleans — the widget
 * is responsible for deciding.
 *
 * Two visual variants:
 *   - "pills"  — compact MetaBadge button row (classic ResumeViewer look)
 *   - "tiles"  — image / video-poster thumbnails (media-led templates like
 *                Actor — Headshot Hero and Director — Filmography Serif).
 *
 * Both variants open the same MediaModal preview on click, so the lightbox
 * is unified across renderers.
 */

import { useState } from "react";
import { Play, ExternalLink, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MetaBadge } from "@/components/MetaBadge";
import MediaModal from "@/components/MediaModal";
import { MetaType, type ResumeSectionMeta } from "@/types/resume";
import { getYouTubeThumbnail } from "@/lib/media-url";

type Variant = "pills" | "tiles";

interface Props {
  itemId: string | undefined | null;
  metaData: ResumeSectionMeta[] | undefined | null;
  variant?: Variant;
  className?: string;
}

export default function ItemMediaStrip({
  itemId,
  metaData,
  variant = "pills",
  className,
}: Props) {
  if (!itemId || !metaData || metaData.length === 0) return null;
  const items = metaData.filter((m) => m.referenceId === itemId);
  if (items.length === 0) return null;

  if (variant === "tiles") {
    return (
      <div className={cn("mt-3 flex flex-wrap gap-2", className)}>
        {items.map((m) => (
          <MediaTile key={m.id} meta={m} />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("mt-2 flex flex-wrap gap-2", className)}>
      {items.map((m) => (
        <MetaBadge key={m.id} meta={m} />
      ))}
    </div>
  );
}

// ─── Tile variant ──────────────────────────────────────────────────────────

function MediaTile({ meta }: { meta: ResumeSectionMeta }) {
  const [open, setOpen] = useState(false);

  const isImage = meta.metaType === MetaType.Image;
  const isYouTube = meta.metaType === MetaType.YouTube;
  const isFileVideo =
    meta.metaType === MetaType.VideoMP4 || meta.metaType === MetaType.VideoWebM;
  const isVideo = isYouTube || isFileVideo;

  const thumbnail = isImage
    ? meta.url
    : isYouTube
    ? getYouTubeThumbnail(meta.url, "mq")
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative h-24 w-32 overflow-hidden rounded-md border bg-muted/40 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
        title={meta.name || (isVideo ? "Video" : isImage ? "Image" : "Link")}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={meta.name || ""}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
            onError={(e) => {
              // Hide broken image so the icon-fallback layer shows through.
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : isFileVideo ? (
          <video
            src={meta.url}
            preload="metadata"
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ExternalLink className="h-6 w-6" />
          </div>
        )}

        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20">
            <div className="rounded-full bg-black/70 p-2">
              <Play className="h-4 w-4 fill-white text-white" />
            </div>
          </div>
        )}

        {meta.name && (
          <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            {meta.name}
          </div>
        )}

        {!thumbnail && !isFileVideo && isImage && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}
      </button>

      <MediaModal media={meta} open={open} onOpenChange={setOpen} />
    </>
  );
}
