import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getVisibilityConfig, type ContentVisibility } from "@/lib/visibility-config";

interface VisibilityBadgeProps {
  visibility: ContentVisibility | string | undefined | null;
  className?: string;
}

/**
 * Unified visibility badge used across all content card types so a "Private"
 * resume, a "Private" job post, and a "Private" user profile all render with
 * the same icon, label, and color scheme.
 */
export function VisibilityBadge({ visibility, className }: VisibilityBadgeProps) {
  const config = getVisibilityConfig(visibility);
  const Icon = config.icon;
  return (
    <Badge variant="secondary" className={cn("text-xs", config.className, className)}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}

export default VisibilityBadge;
