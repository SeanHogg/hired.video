// Shared details body — renders the preview, blurb, badges, and "Use template"
// CTA for any TemplateMeta. Both the marketplace route (/marketplace/templates/:slug)
// and the in-Studio Sheet drawer mount this component, so the two stay
// pixel-aligned for free.
//
// Self-gating: every visible affordance reads from the apply hook + meta.
// No canBuy / canUse / isCreator booleans are drilled in.

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApplyTemplate, priceLabel } from "@/lib/templates/use-apply-template";
import type { TemplateMeta } from "@/lib/templates/types";
import TemplatePreview from "./TemplatePreview";

interface Props {
  meta: TemplateMeta;
  /** When true, lays out in a tight column suitable for a Sheet drawer
   *  (preview on top, info+CTA stacked below). When false, renders a wider
   *  side-by-side suitable for the marketplace route page. */
  compact?: boolean;
}

const KIND_BADGE: Record<TemplateMeta["kind"], string> = {
  resume: "Resume template",
  "studio-builtin": "Studio template",
  "studio-creator": "Creator template",
};

export default function TemplateDetails({ meta, compact = false }: Props) {
  const { apply, ctaLabel, isOwned, isPaid, busy } = useApplyTemplate(meta);

  const previewBlock = (
    <div
      className={
        compact
          ? "rounded-lg border bg-card overflow-hidden aspect-[4/3] flex items-center justify-center"
          : "rounded-xl border bg-card overflow-hidden min-h-[420px] flex items-center justify-center"
      }
    >
      <TemplatePreview meta={meta} compact={compact} />
    </div>
  );

  const infoBlock = (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{meta.name}</h2>
        {meta.industry && (
          <p className="text-xs text-muted-foreground mt-0.5">{meta.industry}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-xs">{KIND_BADGE[meta.kind]}</Badge>
        <Badge variant={isPaid ? "default" : "secondary"} className="text-xs">
          {isOwned ? "Owned" : priceLabel(meta.priceCents)}
        </Badge>
        {meta.tags.slice(0, 4).map((t) => (
          <Badge key={t} variant="secondary" className="text-xs">
            {t}
          </Badge>
        ))}
      </div>

      {meta.blurb && (
        <p className="text-sm text-muted-foreground leading-relaxed">{meta.blurb}</p>
      )}

      <Button onClick={() => void apply()} disabled={busy} size="sm" className="self-start">
        {busy && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
        {ctaLabel}
      </Button>
    </div>
  );

  if (compact) {
    return (
      <div className="flex flex-col gap-4">
        {previewBlock}
        {infoBlock}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 p-4 sm:p-6">
      {previewBlock}
      <aside className="lg:border-l lg:pl-6">{infoBlock}</aside>
    </div>
  );
}
