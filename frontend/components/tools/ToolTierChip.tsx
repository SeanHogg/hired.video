// Mono tier chip (FREE green / PRO neutral) for tool cards and the tool
// page header. Same resolution rule as ToolTierBadge: an explicit `tier`
// wins; otherwise only registry PRO tools render (free is implicit).

import { useTranslation } from "react-i18next";
import MonoChip from "@/components/templates/MonoChip";
import { getTool } from "@/lib/tools/registry";
import type { ToolTier } from "@/data/tools-catalog";

interface Props {
  toolId?: string;
  tier?: ToolTier;
  className?: string;
}

export function ToolTierChip({ toolId, tier, className }: Props) {
  const { t } = useTranslation();
  const resolved: ToolTier | null =
    tier ?? (toolId && getTool(toolId)?.requiresPro ? "pro" : null);
  if (!resolved) return null;
  return (
    <MonoChip tone={resolved === "free" ? "free" : "neutral"} className={className}>
      {resolved === "free" ? t("labels.free") : t("labels.pro")}
    </MonoChip>
  );
}
