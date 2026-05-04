// Shared header for full-page tools under /tools/*. One row, two columns:
// the title block (icon + name + tier badge + description) on the left,
// and the action buttons (Back to Tools + View History) pinned to the
// right.
//
// Self-gating bits live inside the component, not in the call sites:
//   - ToolTierBadge resolves tier from the registry (PRO auto-shows; FREE
//     only renders when `tier="free"` is passed explicitly).
//   - ToolHistoryButton returns null for anonymous users.
//
// Usage:
//
//   <ToolPageHeader
//     toolId="skill-extractor"
//     icon={<Sparkles className="h-6 w-6 text-brand-purple" />}
//     iconBgClassName="bg-brand-purple/10"
//     title="Skill Extractor"
//     description="Upload a job description or resume…"
//     tier="free"
//   />

import { type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ToolHistoryButton } from "@/components/ToolHistoryButton";
import { ToolTierBadge, type ToolTier } from "@/components/ToolTierBadge";
import { cn } from "@/lib/utils";

interface Props {
  toolId: string;
  icon: ReactNode;
  iconBgClassName: string;
  title: ReactNode;
  description: ReactNode;
  /** Force a tier label. Omit to let ToolTierBadge auto-resolve from the
   *  registry (only PRO tools auto-show). */
  tier?: ToolTier;
  /** Extra elements appended after the title and tier badge — used for
   *  one-off marketing badges (e.g. AIResumeScorer's "Hot"). */
  titleExtras?: ReactNode;
  className?: string;
}

export function ToolPageHeader({
  toolId,
  icon,
  iconBgClassName,
  title,
  description,
  tier,
  titleExtras,
  className,
}: Props) {
  return (
    <div className={cn("mb-8", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "w-12 h-12 rounded-lg flex items-center justify-center shrink-0",
              iconBgClassName,
            )}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold flex items-center gap-2 flex-wrap">
              {title}
              <ToolTierBadge toolId={toolId} tier={tier} />
              {titleExtras}
            </h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/tools">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Tools
            </Button>
          </Link>
          <ToolHistoryButton toolId={toolId} />
        </div>
      </div>
    </div>
  );
}
