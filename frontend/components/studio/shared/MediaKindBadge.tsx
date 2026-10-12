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
 * inline), but the chip dimensions + colour palette are driven from
 * `@shared/media-kinds` and the label from the shared, localized
 * `templateKindLabelKey` (@shared/template-kinds) — a template card that
 * passes `documentKind` reads "Résumé" / "Article" instead of "Document".
 */
import { AudioWaveform, BookOpen, Box, Film, FileText, Gamepad2, Headphones, Image as ImageIcon, Ruler, Sparkles, Workflow } from "lucide-react";
import type { MediaKind } from "@shared/media-kinds";
import { useTranslation } from "react-i18next";
import { templateKindLabelKey } from "@shared/template-kinds";
import { cn } from "@/lib/utils";

/** Per-kind visual palette. Kept here (next to the only consumer) rather
 *  than in @shared/media-kinds because the lucide icon set is frontend-
 *  only. ONE record drives chip colour + icon. */
const KIND_VISUAL: Record<MediaKind, {
  Icon: React.ComponentType<{ className?: string }>;
  pillClassName: string;
}> = {
  video:     { Icon: Film,           pillClassName: "bg-ink/85 text-ink-foreground" },
  podcast:   { Icon: Headphones,     pillClassName: "bg-sky-600/90 text-white" },
  voice:     { Icon: AudioWaveform,  pillClassName: "bg-amber-500/90 text-foreground" },
  animation: { Icon: Sparkles,       pillClassName: "bg-emerald-500/90 text-white" },
  game:      { Icon: Gamepad2,       pillClassName: "bg-teal-600/90 text-white" },
  comic:     { Icon: BookOpen,       pillClassName: "bg-sky-600/90 text-white" },
  image:     { Icon: ImageIcon,      pillClassName: "bg-rose-600/90 text-white" },
  cad:       { Icon: Ruler,          pillClassName: "bg-cyan-600/90 text-white" },
  cad_3d:    { Icon: Box,             pillClassName: "bg-teal-600/90 text-white" },
  interactive_comic: { Icon: Workflow, pillClassName: "bg-primary/90 text-primary-foreground" },
  document:  { Icon: FileText,       pillClassName: "bg-primary/90 text-primary-foreground" },
};

interface MediaKindBadgeProps {
  mediaKind: MediaKind;
  /** For `document` templates/projects — which document (résumé, job…).
   *  Refines the label; ignored for every other kind. */
  documentKind?: string | null;
  /** Optional class for the wrapper — callers position the badge via
   *  absolute / inline classes here. The badge itself controls colour +
   *  padding + icon. */
  className?: string;
  /** Size variant — `sm` for in-thumbnail overlays, `md` for inline use
   *  next to a title row. */
  size?: "sm" | "md";
  /** Render the chip even for `video`. Surfaces that label EVERY item by
   *  type (the Studio "My content" list) set this; the default keeps the
   *  video self-gate so video-heavy carousels don't gain redundant chips. */
  alwaysShow?: boolean;
}

export default function MediaKindBadge({
  mediaKind,
  documentKind,
  className,
  size = "sm",
  alwaysShow = false,
}: MediaKindBadgeProps) {
  const { t } = useTranslation();
  // Self-gate: the chooser today is overwhelmingly video, so a "Video"
  // chip on every card adds noise without information. Other kinds DO
  // surface because they're the new + rare case the user needs to notice.
  // `alwaysShow` opts a surface out of the gate when every item must be
  // typed.
  if (mediaKind === "video" && !alwaysShow) return null;
  const visual = KIND_VISUAL[mediaKind];
  const label = t(templateKindLabelKey(mediaKind, documentKind));
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
