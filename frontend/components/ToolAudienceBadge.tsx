// Audience pill shown on every <ToolCard> and on the tool detail page.
// Reads the audience bucket directly from the catalog entry so callers
// don't reimplement the bucketing rule. Self-gates: while the job-seeker /
// hiring audience split is off (every tool is for everyone) the pill adds
// no information, so it renders nothing.

import { useTranslation } from "react-i18next";
import { Briefcase, Building2, Globe2, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getToolAudience,
  TOOL_AUDIENCE_SPLIT_ENABLED,
  type ToolAudience,
  type ToolCatalogEntry,
} from "@/data/tools-catalog";

interface AudienceMeta {
  labelKey: string;
  icon: LucideIcon;
  className: string;
}

const AUDIENCE_META: Record<ToolAudience, AudienceMeta> = {
  job_seeker: {
    labelKey: "labels.tools.audienceJobSeekers",
    icon: Briefcase,
    className: "bg-accent text-accent-foreground",
  },
  recruiter_employer: {
    labelKey: "labels.tools.audienceRecruitersEmployers",
    icon: Building2,
    className: "bg-secondary text-secondary-foreground",
  },
  universal: {
    labelKey: "labels.tools.audienceEveryoneBadge",
    icon: Globe2,
    className: "bg-muted text-muted-foreground",
  },
};

interface Props {
  /** Catalog entry — preferred. The badge derives its bucket from
   *  `audienceRoles` so callers can't drift from /tools. */
  tool?: ToolCatalogEntry;
  /** Or pass the bucket directly. */
  audience?: ToolAudience;
  /** Hide the icon — useful when the badge sits inside a tight row. */
  withIcon?: boolean;
  className?: string;
}

export function ToolAudienceBadge({
  tool,
  audience,
  withIcon = true,
  className,
}: Props) {
  const { t } = useTranslation();
  if (!TOOL_AUDIENCE_SPLIT_ENABLED) return null;
  const bucket = audience ?? (tool ? getToolAudience(tool) : null);
  if (!bucket) return null;
  const meta = AUDIENCE_META[bucket];
  const Icon = meta.icon;
  return (
    <Badge
      variant="secondary"
      className={cn("text-xs gap-1", meta.className, className)}
    >
      {withIcon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {t(meta.labelKey)}
    </Badge>
  );
}
