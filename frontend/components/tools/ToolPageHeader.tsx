// Shared header for full-page tools under /tools/*.
//
// Composes the canonical PageHeader so the breadcrumb tab strip ("Tools")
// + heading + actions match every other top-level surface (Resumes, Jobs,
// People, Companies, Tasks, …).
//
// Self-gating bits stay inside the children, not the call sites:
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
import { Wrench } from "lucide-react";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import { ToolHistoryButton } from "@/components/ToolHistoryButton";
import { ToolTierBadge, type ToolTier } from "@/components/ToolTierBadge";
import { ToolAnonValueCard } from "@/components/tools/ToolAnonValueCard";
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
  // Single-segment breadcrumb back to the Tools index. The current tool
  // tab is `current` and intentionally doesn't navigate (clicking it
  // re-loads the page). This matches the /services pattern where each
  // detail surface still shows the parent strip.
  const tabs: PageHeaderTab[] = [
    { key: "tools", label: "Tools", icon: Wrench, to: "/tools" },
    { key: "current", label: typeof title === "string" ? title : "Current" },
  ];

  return (
    <>
      <PageHeader
        tabs={tabs}
        activeTabKey="current"
        className={cn("mb-6", className)}
        title={
          <span className="flex items-center gap-3 min-w-0">
            <span
              className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center shrink-0",
                iconBgClassName,
              )}
            >
              {icon}
            </span>
            <span className="min-w-0 flex items-center gap-2 flex-wrap">
              {title}
              <ToolTierBadge toolId={toolId} tier={tier} />
              {titleExtras}
            </span>
          </span>
        }
        description={description}
        actions={<ToolHistoryButton toolId={toolId} />}
      />
      {/* Self-gating: returns null for authenticated visitors and for any
          toolId not in the catalog, so every tool surface picks up the
          marketing strip without per-page wiring. */}
      <ToolAnonValueCard toolId={toolId} />
    </>
  );
}
