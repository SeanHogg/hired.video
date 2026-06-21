// Reusable card for every AI tool shown on the Tools page and the Home
// page. Consumes a ToolCatalogEntry from data/tools-catalog.ts — no
// business logic or page-specific styling lives here, which keeps the
// catalog as the single source of truth and the pages thin.
//
// The footer routes through the shared <CardActions> bar (primary CTA on the
// left, Share + overflow in the ⋯ menu) so the action row aligns with every
// other card in the unified-search grid (ContentCard / marketplace cards),
// and every tool gets the same reusable social Share affordance for free.

import { CheckCircle2, ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import { CardActions } from "@/components/ui/CardActions";
import { buildShareAction } from "@/lib/card-share-action";
import { ToolTierBadge } from "@/components/ToolTierBadge";
import { ToolCategoryBadge } from "@/components/ToolCategoryBadge";
import { ToolAudienceBadge } from "@/components/ToolAudienceBadge";
import { ToolPromoVideo } from "@/components/ToolPromoVideo";
import { cn } from "@/lib/utils";
import { useLocalizedTool } from "@/lib/tools/localize-tool";
import type { DynamicCardAction } from "@/lib/dynamic-actions";
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
  const navigate = useNavigate();
  const Icon = tool.icon;

  // Footer actions: the CTA navigates to the tool, Share carries the rich
  // social payload (rendered in the ⋯ menu by CardActions). Mirrors the
  // ContentCard pattern so /search and /tools stay visually identical.
  const cardActions: DynamicCardAction[] = [
    ...(tool.ctaLabel
      ? [
          {
            id: "open",
            label: tool.ctaLabel,
            variant: "secondary" as const,
            icon: ArrowRight,
            onClick: () => navigate(tool.href),
          },
        ]
      : []),
    buildShareAction({
      entityUrl: tool.href,
      copySuccessDescription: t("toolCard.linkCopied", { label: tool.title }),
    }),
  ];

  return (
    <BaseCard className={cn("group flex flex-col h-full", className)}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center shrink-0",
                tool.iconBgClassName,
              )}
            >
              <Icon
                className={cn(
                  "h-6 w-6 group-hover:scale-110 transition-transform",
                  tool.iconColorClassName,
                )}
              />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-xl flex items-center gap-2 flex-wrap">
                <Link
                  to={tool.href}
                  className="hover:text-primary transition-colors"
                >
                  {tool.title}
                </Link>
                <ToolCategoryBadge category={tool.category} />
                <ToolTierBadge tier={tool.tier} />
                <ToolAudienceBadge tool={tool} />
              </CardTitle>
              <CardDescription>{tool.description}</CardDescription>
            </div>
          </div>
          {tool.statusBadge && (
            <Badge
              variant="secondary"
              className={cn("shrink-0", tool.statusBadge.className)}
            >
              {tool.statusBadge.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="flex-1 space-y-3">
          {tool.stats && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              {tool.stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className={cn("text-2xl font-bold", stat.valueClassName)}>
                    {stat.value}
                  </div>
                  <div className="text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {tool.features && tool.features.length > 0 && (
            <div className="space-y-2">
              {tool.features.map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  {feature}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Self-gating: ToolPromoVideo returns null when the catalog entry has
            no promoVideoUrl, so this is safe for every tool. Sits just above
            the shared footer bar. */}
        <div className="flex justify-end pt-3 empty:hidden">
          <ToolPromoVideo tool={tool} />
        </div>
      </CardContent>
      <CardActions actions={cardActions} />
    </BaseCard>
  );
}
