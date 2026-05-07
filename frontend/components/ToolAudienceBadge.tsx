// Audience pill shown on every <ToolCard> and on the /tools audience
// filter chips. Reads the audience bucket directly from the catalog
// entry so callers don't reimplement the bucketing rule.

import { Briefcase, Building2, Globe2, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getToolAudience,
  type ToolAudience,
  type ToolCatalogEntry,
} from "@/data/tools-catalog";

interface AudienceMeta {
  label: string;
  icon: LucideIcon;
  className: string;
}

const AUDIENCE_META: Record<ToolAudience, AudienceMeta> = {
  job_seeker: {
    label: "Job Seekers",
    icon: Briefcase,
    className: "bg-blue-100 text-blue-800",
  },
  recruiter_employer: {
    label: "Recruiters & Employers",
    icon: Building2,
    className: "bg-purple-100 text-purple-800",
  },
  universal: {
    label: "Everyone",
    icon: Globe2,
    className: "bg-slate-100 text-slate-800",
  },
};

export function getAudienceMeta(audience: ToolAudience): AudienceMeta {
  return AUDIENCE_META[audience];
}

interface Props {
  /** Catalog entry — preferred. The badge derives its bucket from
   *  `audienceRoles` so callers can't drift from /tools. */
  tool?: ToolCatalogEntry;
  /** Or pass the bucket directly (used by filter chips that don't have
   *  a tool entry). */
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
  const bucket = audience ?? (tool ? getToolAudience(tool) : null);
  if (!bucket) return null;
  const meta = AUDIENCE_META[bucket];
  const Icon = meta.icon;
  return (
    <Badge
      variant="secondary"
      className={cn("text-xs gap-1", meta.className, className)}
    >
      {withIcon && <Icon className="h-3 w-3" />}
      {meta.label}
    </Badge>
  );
}
