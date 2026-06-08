// ToolDetail.tsx — public per-tool marketing/SEO page mounted at
// `/tools/:id`. Reads a single ToolCatalogEntry from the catalog and
// renders the inline `<ToolPromoVideo>` as the hero, plus features,
// stats, and a CTA into the tool's functional route (`tool.href`).
//
// Adding a tool to TOOLS_CATALOG with a `promoVideoUrl` automatically
// surfaces the demo here — no per-tool edit needed. Tools without a
// promo video still get a detail page, just without the hero player.
//
// Unknown ids redirect back to /tools rather than 404 — the catalog
// is the source of truth and an unknown id usually means a renamed or
// removed tool.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToolTierBadge } from "@/components/ToolTierBadge";
import { ToolAudienceBadge } from "@/components/ToolAudienceBadge";
import { ToolPromoVideo } from "@/components/ToolPromoVideo";
import { TOOLS_CATALOG } from "@/data/tools-catalog";
import { localizeTool } from "@/lib/tools/localize-tool";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/AppShell";
import { usePageChrome } from "@/lib/seo";

export default function ToolDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const rawTool = useMemo(() => TOOLS_CATALOG.find((tl) => tl.id === id), [id]);
  const tool = useMemo(
    () => (rawTool ? localizeTool(rawTool, t) : undefined),
    [rawTool, t],
  );
  usePageChrome();

  if (!tool) return <Navigate to="/tools" replace />;

  const Icon = tool.icon;

  return (
    <AppShell variant="public">
      <div className="px-4 py-8 space-y-8">
      <Link
        to="/tools"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> All tools
      </Link>

      <header className="flex items-start gap-4">
        <div
          className={cn(
            "w-16 h-16 rounded-xl flex items-center justify-center shrink-0",
            tool.iconBgClassName,
          )}
        >
          <Icon className={cn("h-8 w-8", tool.iconColorClassName)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-3xl font-bold">{tool.title}</h1>
            <ToolTierBadge tier={tool.tier} />
            <ToolAudienceBadge tool={tool} />
            {tool.statusBadge && (
              <Badge variant="secondary" className={tool.statusBadge.className}>
                {tool.statusBadge.label}
              </Badge>
            )}
          </div>
          <p className="text-lg text-muted-foreground">{tool.description}</p>
        </div>
      </header>

      {/* Self-gating: ToolPromoVideo returns null when promoVideoUrl
          is unset, so the hero is silently absent for tools without a
          demo video. No prop-drilled "hasDemo" gate. */}
      <ToolPromoVideo tool={tool} variant="inline" />

      {tool.stats && (
        <section className="grid grid-cols-2 gap-6 border rounded-lg p-6 bg-card">
          {tool.stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className={cn("text-4xl font-bold", stat.valueClassName)}>
                {stat.value}
              </div>
              <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
            </div>
          ))}
        </section>
      )}

      {tool.features && tool.features.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What you get</h2>
          <ul className="space-y-2">
            {tool.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-t pt-6">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link to={tool.href}>
            {tool.ctaLabel ?? t("tools.openNamed", { name: tool.title })}
          </Link>
        </Button>
      </section>
      </div>
    </AppShell>
  );
}
