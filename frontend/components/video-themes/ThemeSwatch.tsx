import { VIDEO_THEMES, type VideoThemeId } from "@shared/video-themes";
import { cn } from "@/lib/utils";

/**
 * A theme's look as a small tile: its gradient with an accent bar. The
 * colours are the video's own hex palette (the video renders to pixels),
 * so the tile previews exactly what the frame will wear in either app theme.
 */
export function ThemeSwatch({ themeId, className }: { themeId: VideoThemeId; className?: string }) {
  const theme = VIDEO_THEMES[themeId];
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-block h-8 w-12 flex-none overflow-hidden rounded-md ring-1 ring-border", className)}
      style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
    >
      <span className="absolute bottom-1.5 left-1.5 h-1 w-5 rounded-full" style={{ background: theme.accent }} />
    </span>
  );
}
