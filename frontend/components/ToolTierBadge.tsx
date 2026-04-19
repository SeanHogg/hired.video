// Small "PRO" pill shown next to a tool that requires a paid tier. Used
// on the menu item, the quick-run dialog header, and the tool's
// full-page header so users see the gating before clicking.

import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTool } from "@/lib/tools/registry";

interface Props {
  /** Tool id from the registry. Inferred required-pro flag from the registry entry. */
  toolId: string;
  /** Override visibility — hide even when registry says requiresPro. */
  hidden?: boolean;
  className?: string;
  /** When true, also show the icon. Defaults to true. */
  withIcon?: boolean;
}

export function ToolTierBadge({ toolId, hidden, className, withIcon = true }: Props) {
  const tool = getTool(toolId);
  if (hidden || !tool?.requiresPro) return null;
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
