// Reusable card for every AI tool shown on the Tools page and the Home
// page. Consumes a ToolCatalogEntry from data/tools-catalog.ts — no
// business logic or page-specific styling lives here, which keeps the
// catalog as the single source of truth and the pages thin.

import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToolTierBadge } from "@/components/ToolTierBadge";
import { ToolCategoryBadge } from "@/components/ToolCategoryBadge";
import { ToolAudienceBadge } from "@/components/ToolAudienceBadge";
import { ToolPromoVideo } from "@/components/ToolPromoVideo";
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
  const Icon = tool.icon;

  return (
    <Link to={tool.href} className="block h-full">
      <Card
        className={cn(
          "h-full hover:shadow-lg transition-shadow cursor-pointer group",
          className,
        )}
      >
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
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
                  {tool.title}
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
        <CardContent>
          <div className="space-y-3">
            {tool.stats && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                {tool.stats.map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div
                      className={cn(
                        "text-2xl font-bold",
                        stat.valueClassName,
                      )}
                    >
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
                  <div
                    key={feature}
                    className="flex items-center gap-2 text-sm"
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    {feature}
                  </div>
                ))}
              </div>
            )}

            {tool.ctaLabel && (
              <Button className="w-full mt-4" variant="outline">
                {tool.ctaLabel}
              </Button>
            )}

            {/* Self-gating: ToolPromoVideo returns null when the catalog
                entry has no promoVideoUrl, so this is safe for every tool. */}
            <div className="flex justify-end">
              <ToolPromoVideo tool={tool} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
