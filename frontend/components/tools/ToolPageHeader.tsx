// Shared header for full-page tools under /tools/*.
//
// Composes the canonical PageHeader. The tab strip lists every catalog
// tool (filtered by viewer audience) so a user inside one tool can hop
// straight to another without bouncing through `/tools`. PageHeader's
// row is `overflow-x-auto`, so the strip scrolls horizontally as the
// catalog grows.
//
// Self-gating bits stay inside the children, not the call sites:
//   - ToolTierBadge resolves tier from the registry (PRO auto-shows; FREE
//     only renders when `tier="free"` is passed explicitly).
//   - ToolHistoryButton returns null for anonymous users.
//   - The tab strip filters by viewer audience via `useEffectiveRole`,
//     so a job seeker doesn't see recruiter-only tabs and vice versa.
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

import { useMemo, type ReactNode } from "react";
import { Wrench } from "lucide-react";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import { ToolHistoryButton } from "@/components/ToolHistoryButton";
import { ToolTierBadge, type ToolTier } from "@/components/ToolTierBadge";
import { ToolCategoryBadge } from "@/components/ToolCategoryBadge";
import { ToolAnonValueCard } from "@/components/tools/ToolAnonValueCard";
import {
  TOOLS_CATALOG,
  audienceForRole,
  isToolInAudience,
} from "@/data/tools-catalog";
import { useEffectiveRole } from "@/hooks/use-effective-role";
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
  const effectiveRole = useEffectiveRole();

  // Build the cross-tool tab strip. "All Tools" links back to the index;
  // each subsequent tab targets a tool's full-page surface (only entries
  // that route to `/tools/<slug>` — chrome-extension cards and the
  // /chat-based interview coach don't fit the tab metaphor). Audience
  // filter mirrors `/tools` so a recruiter doesn't see seeker-only tabs.
  const tabs: PageHeaderTab[] = useMemo(() => {
    const audience = audienceForRole(effectiveRole) ?? "all";
    // Each tab carries its tool's catalog icon so the strip reads as an
    // icon menu (matching the icon'd top-level Tools / Learning tabs) rather
    // than a wall of text.
    const toolTabs: PageHeaderTab[] = TOOLS_CATALOG
      .filter((t) => t.href.startsWith("/tools/"))
      .filter((t) => isToolInAudience(t, audience))
      .map((t) => ({ key: t.id, label: t.title, to: t.href, icon: t.icon }));
    return [
      { key: "all", label: "All Tools", icon: Wrench, to: "/tools" },
      ...toolTabs,
    ];
  }, [effectiveRole]);

  return (
    <>
      {/* Cross-tool nav strip — pinned as a sticky action bar (same pattern
          as the list pages' tab strips) so the user can hop between tools
          without scrolling back to the top. Tabs-only header → PageHeader
          renders it as the flat full-bleed band; the title block below
          scrolls normally. */}
      <PageHeader tabs={tabs} activeTabKey={toolId} sticky />
      <PageHeader
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
              <ToolCategoryBadge toolId={toolId} />
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
