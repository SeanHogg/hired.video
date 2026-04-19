// Small tier pill shown next to a tool. Renders "PRO" for paid-tier tools
// and "FREE" for everything else so the Tools page is unambiguous about
// gating. Used on the menu item, the quick-run dialog header, and the
// tool's full-page header.

import { Badge } from "@/components/ui/badge";
import { Crown, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTool } from "@/lib/tools/registry";

export type ToolTier = "free" | "pro";

interface Props {
  /** Tool id from the registry. Used to auto-infer tier when `tier` prop is omitted. */
  toolId?: string;
  /**
   * Explicit tier — overrides the registry lookup. Use this for tools that
   * aren't in the registry (e.g. static/marketing-only tools on the Tools
   * page) or when you want to force a label.
   */
  tier?: ToolTier;
  /** Hide entirely (used when the surrounding layout has its own tier indicator). */
  hidden?: boolean;
  className?: string;
  /** When true, also show the icon. Defaults to true. */
  withIcon?: boolean;
}

export function ToolTierBadge({ toolId, tier, hidden, className, withIcon = true }: Props) {
  if (hidden) return null;

  // Resolve tier. Explicit prop wins. Without it, we fall back to the
  // registry but only render for PRO tools — this preserves the original
  // "only flag paid tools" behavior in context menus and dialogs.
  let resolved: ToolTier | null = tier ?? null;
  if (!resolved && toolId) {
    const tool = getTool(toolId);
    if (tool?.requiresPro) resolved = "pro";
  }
  if (!resolved) return null;

  if (resolved === "pro") {
    return (
      <Badge
        variant="secondary"
        className={cn("bg-amber-100 text-amber-800 text-xs gap-1", className)}
      >
        {withIcon && <Crown className="h-3 w-3" />}
        PRO
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className={cn("bg-green-100 text-green-800 text-xs gap-1", className)}
    >
      {withIcon && <Gift className="h-3 w-3" />}
      FREE
    </Badge>
  );
}
