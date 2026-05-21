/**
 * MediaKindBadge — small kind chip rendered on every template / project card.
 *
 * Single source of truth for "show the user what kind of project this is."
 * Used by:
 *   - BuiltinTemplateCard + OwnedTemplateCard in StudioLanding (the chooser)
 *   - StudioVideoCard in the "My videos" grid
 *   - The per-template public landing page (#901) once it ships
 *
 * Per the standing DRY rule, the badge SELF-GATES — it returns `null` when
 * `mediaKind === "video"` so the existing video-only chooser doesn't gain
 * redundant "Video" chips on every card. Callers don't pass `showBadge` /
 * `hideForVideo` booleans; they just hand in the project's mediaKind and
 * the badge decides whether to render.
 *
 * Visual position is the caller's responsibility (absolute-positioned vs.
 * inline), but the chip dimensions + colour palette + label text are all
 * driven from `@shared/media-kinds` so a rename in one place propagates.
 */
import { AudioWaveform, Film, Headphones, Sparkles } from "lucide-react";
import {
  MEDIA_KIND_UI,
  type MediaKind,
} from "@shared/media-kinds";
import { cn } from "@/lib/utils";

/** Per-kind visual palette. Kept here (next to the only consumer) rather
 *  than in @shared/media-kinds because the lucide icon set is frontend-
 *  only. ONE record drives chip colour + icon. */
const KIND_VISUAL: Record<MediaKind, {
  Icon: React.ComponentType<{ className?: string }>;
  pillClassName: string;
}> = {
  video:     { Icon: Film,           pillClassName: "bg-slate-900/85 text-white" },
  podcast:   { Icon: Headphones,     pillClassName: "bg-violet-600/90 text-white" },
  voice:     { Icon: AudioWaveform,  pillClassName: "bg-amber-500/90 text-slate-900" },
  animation: { Icon: Sparkles,       pillClassName: "bg-emerald-500/90 text-white" },
};

export interface MediaKindBadgeProps {
  mediaKind: MediaKind;
  /** Optional class for the wrapper — callers position the badge via
   *  absolute / inline classes here. The badge itself controls colour +
   *  padding + icon. */
  className?: string;
  /** Size variant — `sm` for in-thumbnail overlays, `md` for inline use
   *  next to a title row. */
  size?: "sm" | "md";
}

export default function MediaKindBadge({
  mediaKind,
  className,
  size = "sm",
}: MediaKindBadgeProps) {
  // Self-gate: the chooser today is overwhelmingly video, so a "Video"
  // chip on every card adds noise without information. Other kinds DO
  // surface because they're the new + rare case the user needs to notice.
  if (mediaKind === "video") return null;
  const visual = KIND_VISUAL[mediaKind];
  const label = MEDIA_KIND_UI[mediaKind].badgeLabel;
  const sizing =
    size === "md"
      ? "px-2 py-1 text-xs gap-1.5"
      : "px-2 py-0.5 text-[10px] gap-1";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <span
      className={cn(
        "pointer-events-none inline-flex items-center rounded-full font-semibold shadow-sm backdrop-blur",
        visual.pillClassName,
        sizing,
        className,
      )}
    >
      <visual.Icon className={iconSize} />
      {label}
    </span>
  );
}
