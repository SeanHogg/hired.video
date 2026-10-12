import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";
import ShareMenu from "@/components/share/ShareMenu";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useTimeAgo } from "@/hooks/use-time-ago";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { inlinePreviewUrl, shortName, videoOwnerPath } from "@/lib/landing/video-wall";
import type { PublicVideo } from "@/lib/services/studio-service";
import { cn } from "@/lib/utils";
import { isVideoThemeId, videoThemeLabelKey } from "@shared/video-themes";

interface PublicVideoCardProps {
  video: PublicVideo;
  /** The hero stack shows the frame only (no action row). */
  bare?: boolean;
  className?: string;
}

/**
 * One posted video as a 9:16 card: its still (a hosted file plays muted on
 * hover or focus), the person's short name, headline and when it was posted.
 * Opens the person's profile; "Make one like this" starts a kit.
 */
export function PublicVideoCard({ video, bare = false, className }: PublicVideoCardProps) {
  const { t } = useTranslation();
  const { getTimeAgo } = useTimeAgo();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [previewing, setPreviewing] = useState(false);
  const preview = !reduced && previewing ? inlinePreviewUrl(video) : null;
  const href = videoOwnerPath(video) ?? NEW_KIT_PATH;
  const name = shortName(video.ownerName);
  const meta = [video.ownerHeadline, getTimeAgo(video.createdAt)].filter(Boolean).join(" · ");
  const theme = isVideoThemeId(video.themeId) && video.themeId !== "standard" ? t(videoThemeLabelKey(video.themeId)) : "";

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <Link
        to={href}
        aria-label={t("landing.wall.open", { name: name || video.title })}
        onMouseEnter={() => setPreviewing(true)}
        onMouseLeave={() => setPreviewing(false)}
        onFocus={() => setPreviewing(true)}
        onBlur={() => setPreviewing(false)}
        className="group relative flex aspect-[9/16] flex-col justify-center overflow-hidden rounded-[14px] bg-ink p-3.5 text-ink-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {video.thumbnailUrl && (
          <img
            src={video.thumbnailUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {preview && (
          <video
            src={preview}
            muted
            autoPlay
            loop
            playsInline
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {video.goal && (
          <span className="absolute left-2.5 top-2.5 max-w-[75%] truncate rounded-full bg-ink/60 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
            {t(`build.video.badge.goal.${video.goal}`)}
          </span>
        )}
        {!video.thumbnailUrl && (
          <b className="relative font-display text-[19px] font-extrabold leading-[1.05]">{video.title}</b>
        )}
        <span
          aria-hidden="true"
          className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-ink/60"
        >
          <Play className="h-3 w-3 fill-current" />
        </span>
        <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-ink/90 to-transparent px-3 pb-2.5 pt-6 text-xs">
          {name && <b className="truncate">{name}</b>}
          {meta && <span className="truncate opacity-85">{meta}</span>}
          {theme && <span className="truncate text-[11px] font-semibold opacity-85">{t("landing.wall.themeOf", { theme })}</span>}
        </span>
      </Link>
      {!bare && (
        <div className="flex items-center gap-1.5">
          <Link to={NEW_KIT_PATH} className="inline-flex min-h-[36px] flex-1 items-center text-[13px] font-semibold text-primary hover:underline">
            {t("landing.wall.makeLikeThis")}
          </Link>
          <ShareMenu
            variant="icon"
            url={`${window.location.origin}${href}`}
            title={video.title}
            text={t("landing.wall.shareText", { name: name || video.title })}
          />
        </div>
      )}
    </div>
  );
}
