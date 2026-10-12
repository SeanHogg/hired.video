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
import { Button } from "@/components/ui/button";
import MonoChip from "@/components/templates/MonoChip";
import { ToolAudienceBadge } from "@/components/ToolAudienceBadge";
import { ToolCategoryBadge } from "@/components/ToolCategoryBadge";
import { ToolPromoVideo } from "@/components/ToolPromoVideo";
import { ToolTierChip } from "@/components/tools/ToolTierChip";
import { ToolTitleBlock } from "@/components/tools/ToolTitleBlock";
import { TOOLS_CATALOG } from "@/data/tools-catalog";
import { localizeTool } from "@/lib/tools/localize-tool";
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
  const openLabel = tool.ctaLabel ?? t("tools.openNamed", { name: tool.title });

  return (
    <AppShell variant="public" bgClassName="bg-background">
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 pb-[72px] pt-8">
        <Link
          to="/tools"
          className="inline-flex min-h-[44px] items-center gap-1.5 self-start text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("tools.header.allTools")}
        </Link>

        <ToolTitleBlock
          icon={<Icon />}
          title={tool.title}
          description={tool.description}
          chips={
            <>
              <ToolCategoryBadge category={tool.category} />
              <ToolTierChip tier={tool.tier} />
              <ToolAudienceBadge tool={tool} />
              {tool.statusBadge && <MonoChip>{tool.statusBadge.label}</MonoChip>}
            </>
          }
          actions={
            <Button asChild size="lg">
              <Link to={tool.href}>{openLabel}</Link>
            </Button>
          }
        />

        {/* Self-gating: ToolPromoVideo returns null when promoVideoUrl
            is unset, so the hero is silently absent for tools without a
            demo video. No prop-drilled "hasDemo" gate. */}
        <ToolPromoVideo tool={tool} variant="inline" className="rounded-[20px]" />

        {tool.stats && (
          <section className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-6 rounded-[20px] border border-border bg-card p-6">
            {tool.stats.map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1">
                <div className="font-display text-4xl font-bold tracking-tight text-foreground">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </section>
        )}

        {tool.features && tool.features.length > 0 && (
          <section
            aria-labelledby="tool-features"
            className="flex flex-col gap-4 rounded-[20px] border border-border bg-card p-6"
          >
            <h2 id="tool-features" className="text-2xl font-bold tracking-tight">
              {t("tools.detail.whatYouGet")}
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3">
              {tool.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-[15px]">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-green-text" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link to={tool.href}>{openLabel}</Link>
          </Button>
        </div>
      </main>
    </AppShell>
  );
}
