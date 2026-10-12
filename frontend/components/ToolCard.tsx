// Reusable card for every AI tool shown on /tools and the dashboard.
// Consumes a ToolCatalogEntry from data/tools-catalog.ts — no business
// logic or page-specific styling lives here, which keeps the catalog as the
// single source of truth and the pages thin.
//
// Anatomy matches the Templates card (rounded-[18px] p-3.5): accent icon
// tile → name + one-line blurb → footer with mono category / tier chips on
// the left and Share + the primary "Open" action on the right.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import MonoChip from "@/components/templates/MonoChip";
import ShareMenu from "@/components/share/ShareMenu";
import { ToolCategoryBadge } from "@/components/ToolCategoryBadge";
import { ToolAudienceBadge } from "@/components/ToolAudienceBadge";
import { ToolPromoVideo } from "@/components/ToolPromoVideo";
import { ToolIconTile } from "@/components/tools/ToolTitleBlock";
import { ToolTierChip } from "@/components/tools/ToolTierChip";
import { cn } from "@/lib/utils";
import { useLocalizedTool } from "@/lib/tools/localize-tool";
import type { ToolCatalogEntry } from "@/data/tools-catalog";

interface Props {
  tool: ToolCatalogEntry;
  className?: string;
}

export function ToolCard({ tool: rawTool, className }: Props) {
  // Resolve every user-facing string for the active locale at the single
  // catalog seam; behavioral fields (icon, href, …) pass through unchanged.
  const tool = useLocalizedTool(rawTool);
  const { t } = useTranslation();
  const Icon = tool.icon;
  const shareUrl = `${window.location.origin}${tool.href}`;

  return (
    <article
      className={cn(
        "flex h-full flex-col gap-3 rounded-[18px] border border-border bg-card p-3.5 transition-colors hover:border-primary/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <ToolIconTile size="md">
          <Icon />
        </ToolIconTile>
        {tool.statusBadge && <MonoChip>{tool.statusBadge.label}</MonoChip>}
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <Link
          to={tool.href}
          className="text-[15px] font-semibold leading-snug text-foreground hover:text-primary"
        >
          {tool.title}
        </Link>
        <p className="line-clamp-2 text-[13px] text-muted-foreground">{tool.description}</p>
      </div>

      {/* Self-gating: renders nothing when the catalog entry has no promo video. */}
      <div className="empty:hidden">
        <ToolPromoVideo tool={tool} />
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap gap-1.5">
          <ToolCategoryBadge category={tool.category} />
          <ToolTierChip tier={tool.tier} />
          <ToolAudienceBadge tool={tool} />
        </span>
        <span className="flex items-center gap-1">
          <ShareMenu
            variant="icon"
            align="end"
            url={shareUrl}
            title={tool.title}
            text={tool.description}
            className="h-11 w-11"
          />
          <Button asChild size="sm" className="min-h-[44px] rounded-[10px] px-3.5 text-sm font-semibold">
            <Link to={tool.href} aria-label={t("tools.openNamed", { name: tool.title })}>
              {t("actions.open")}
            </Link>
          </Button>
        </span>
      </div>
    </article>
  );
}
