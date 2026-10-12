// Shared header pieces for full-page tools under /tools/* (composed by
// ToolShell):
//   - ToolNavStrip: sticky cross-tool tab strip (every catalog tool,
//     filtered by viewer audience) so a user can hop between tools.
//   - ToolPageHeader: ToolTitleBlock (accent icon tile, mono category +
//     tier chips, display h1, lede, history action) + ToolAnonValueCard.
//
// Self-gating bits stay inside the children, not the call sites:
//   - ToolTierChip resolves tier from the registry (PRO auto-shows; FREE
//     only renders when `tier="free"` is passed explicitly).
//   - ToolHistoryButton returns null for anonymous users.
//   - ToolAnonValueCard returns null for signed-in users.

import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Wrench } from "lucide-react";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import { ToolHistoryButton } from "@/components/ToolHistoryButton";
import { ToolCategoryBadge } from "@/components/ToolCategoryBadge";
import { ToolAnonValueCard } from "@/components/tools/ToolAnonValueCard";
import { ToolTierChip } from "@/components/tools/ToolTierChip";
import { ToolTitleBlock } from "@/components/tools/ToolTitleBlock";
import {
  TOOLS_CATALOG,
  audienceForRole,
  isToolInAudience,
  type ToolTier,
} from "@/data/tools-catalog";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import { localizeTool } from "@/lib/tools/localize-tool";

interface Props {
  toolId: string;
  icon: ReactNode;
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

/** Cross-tool nav strip — pinned as a sticky full-bleed action bar so a
 *  user inside one tool can hop to another without bouncing via /tools.
 *  Must sit directly inside the shell's `p-4 md:p-6` wrapper (the action-bar
 *  surface cancels that padding to reach the content edges). */
export function ToolNavStrip({ toolId }: { toolId: string }) {
  const { t } = useTranslation();
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
      .filter((tool) => tool.href.startsWith("/tools/"))
      .filter((tool) => isToolInAudience(tool, audience))
      .map((tool) => {
        const lt = localizeTool(tool, t);
        return { key: tool.id, label: lt.title, to: tool.href, icon: tool.icon };
      });
    return [
      { key: "all", label: t("tools.header.allTools"), icon: Wrench, to: "/tools" },
      ...toolTabs,
    ];
  }, [effectiveRole, t]);

  return <PageHeader tabs={tabs} activeTabKey={toolId} sticky />;
}

/** Title block (accent icon tile, mono chips, display h1, lede, history
 *  action) + the signed-out value strip. */
export function ToolPageHeader({
  toolId,
  icon,
  title,
  description,
  tier,
  titleExtras,
  className,
}: Props) {
  return (
    <>
      <ToolTitleBlock
        className={className}
        icon={icon}
        title={title}
        description={description}
        chips={
          <>
            <ToolCategoryBadge toolId={toolId} />
            <ToolTierChip toolId={toolId} tier={tier} />
            {titleExtras}
          </>
        }
        actions={<ToolHistoryButton toolId={toolId} />}
      />
      {/* Self-gating: returns null for authenticated visitors and for any
          toolId not in the catalog, so every tool surface picks up the
          marketing strip without per-page wiring. */}
      <ToolAnonValueCard toolId={toolId} />
    </>
  );
}
