import { BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * OfficialBadge — visual marker for hired.video-authored content.
 *
 * Self-gating: returns null when the content isn't official, so consumers
 * can always render it unconditionally. Distinguishes platform-authored
 * content (Sean Hogg / superadmin / scripted seed) from community-authored
 * content across every creator surface (articles, templates, voices,
 * services, courses, certifications).
 *
 * Backs gap #183 in the Consolidated Gap Register.
 */
interface OfficialBadgeProps {
  /** True when the content is platform-authored. Render nothing otherwise. */
  isOfficial: boolean | null | undefined;
  /** "sm" for inline use on listing cards, "md" on detail pages. */
  size?: "sm" | "md";
  className?: string;
}

export function OfficialBadge({ isOfficial, size = "sm", className }: OfficialBadgeProps) {
  if (!isOfficial) return null;
  const iconCls = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 bg-primary/10 text-primary border-primary/20",
        size === "sm" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5",
        className,
      )}
      aria-label="Official hired.video content"
      title="Official hired.video content"
    >
      <BadgeCheck className={iconCls} aria-hidden />
      Official
    </Badge>
  );
}

export default OfficialBadge;
