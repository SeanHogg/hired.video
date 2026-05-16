// Marketplace surface for previewing and applying any kind of template.
// Resolves a slug (resume / studio-builtin / studio-creator) through the
// unified template registry, then composes the kind-agnostic shell from
// <TemplatePreview> + <TemplateApplyButton> so a new kind lands here for
// free as soon as it's registered.

import { Eye, Loader2, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import CreatorPitchAside from "@/components/marketplace/CreatorPitchAside";
import MarketplaceItemShell from "@/components/marketplace/MarketplaceItemShell";
import ReportAbuseButton from "@/components/moderation/ReportAbuseButton";
import ResumeSourceSelector from "@/components/templates/ResumeSourceSelector";
import TemplateApplyButton from "@/components/templates/TemplateApplyButton";
import TemplatePreview from "@/components/templates/TemplatePreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import { useSEO } from "@/lib/seo";
import { resumeService } from "@/lib/services/resume-service";
import { useTemplate } from "@/lib/templates/registry";
import { priceLabel } from "@/lib/templates/use-apply-template";
import type { TemplateMeta } from "@/lib/templates/types";
import type { Resume } from "@/types/resume";

const KIND_PITCH: Record<TemplateMeta["kind"], string> = {
  resume: "resume templates",
  "studio-builtin": "studio video templates",
  "studio-creator": "creator video templates",
};

// Mounted as the seo slot so useSEO only fires here, not on every parent
// re-render path. Title/description follow the meta so each template
// gets a distinct indexable page.
function TemplateSEO({ meta }: { meta: TemplateMeta }) {
  useSEO(`/marketplace/templates/${meta.slug}`, {
    title: `${meta.name} — hired.video Marketplace`,
    description:
      `Preview the "${meta.name}" template — a hired.video Marketplace template. ` +
      (meta.blurb || "Buy once, apply to any of your work."),
    keywords: `${meta.name}, ${meta.industry ?? ""}, ${meta.tags.join(", ")}, hired.video marketplace, templates`,
    ogTitle: `${meta.name} — hired.video Marketplace`,
    ogDescription: meta.blurb || `${meta.industry ?? ""}`.trim(),
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Product",
      name: meta.name,
      category: meta.industry ?? "Templates",
      brand: { "@type": "Organization", name: "hired.video" },
      offers: {
        "@type": "Offer",
        price: (meta.priceCents / 100).toFixed(2),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `https://hired.video/marketplace/templates/${meta.slug}`,
      },
    },
  });
  return null;
}

export default function MarketplaceTemplatePreview() {
  const { templateId } = useParams<{ templateId: string }>();
  const { template: meta, loading } = useTemplate(templateId);

  // Resume picker state — only the "resume" kind reads `previewResume` so
  // it's safe to keep this state at the top level. ResumeSourceSelector
  // self-gates (renders nothing for non-resume kinds), so the marketplace
  // page doesn't have to branch.
  const [sampleSelection, setSampleSelection] = useState<string>("sample");
  const [previewResume, setPreviewResume] = useState<Resume>(SAMPLE_RESUME);

  useEffect(() => {
    if (sampleSelection === "sample") {
      setPreviewResume(SAMPLE_RESUME);
      return;
    }
    let cancelled = false;
    resumeService
      .getResumeById(sampleSelection)
      .then((r) => {
        if (!cancelled && r) setPreviewResume(r);
      })
      .catch(() => {
        if (!cancelled) setPreviewResume(SAMPLE_RESUME);
      });
    return () => {
      cancelled = true;
    };
  }, [sampleSelection]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading template…
      </div>
    );
  }

  // Unknown / missing template → bounce to the catalog.
  if (!meta) {
    return <Navigate to="/search?category=templates" replace />;
  }

  const badges = (
    <>
      <Badge variant="secondary" className="flex items-center gap-1">
        <Eye className="w-3 h-3" />
        <span className="font-mono">{meta.name}</span>
      </Badge>
      {meta.industry && (
        <Badge variant="outline" className="text-xs">{meta.industry}</Badge>
      )}
      <Badge
        variant={meta.priceCents > 0 ? "default" : "secondary"}
        className="text-xs"
      >
        {priceLabel(meta.priceCents)}
      </Badge>
    </>
  );

  const actions = (
    <>
      <ResumeSourceSelector meta={meta} value={sampleSelection} onChange={setSampleSelection} />
      <TemplateApplyButton meta={meta} size="sm" />
      <Button asChild size="sm" variant="ghost">
        <Link to="/search?category=templates">Browse all</Link>
      </Button>
      {/* Report Abuse — self-gates: hidden when the current user is the
          creator, and bounces anonymous visitors to /login first.
          Studio creator templates carry their backend uuid in
          `meta.origin.template.id`; only those are reportable here
          (resume + studio-builtin templates have separate moderation
          surfaces). */}
      {meta.origin.kind === "studio-creator" && (
        <ReportAbuseButton
          entityType="studio_template"
          entityId={meta.origin.template.id}
          entityOwnerId={meta.origin.template.creatorId ?? undefined}
          entityLabel="studio template"
        />
      )}
    </>
  );

  // Right-rail: creator pitch with a secondary CTA so the apply button
  // stays visible even when the visitor scrolls past the top action bar.
  const secondary = (
    <div className="rounded-xl border p-4 space-y-2">
      <h4 className="text-sm font-semibold">Like this template?</h4>
      <p className="text-xs text-muted-foreground">
        Add it to your library and use it on any of your work — same content,
        instantly restyled.
      </p>
      <TemplateApplyButton meta={meta} size="sm" className="w-full" />
      <Button asChild size="sm" variant="ghost" className="w-full">
        <Link to="/search?category=templates">
          <Store className="w-4 h-4 mr-1" />
          Browse all templates
        </Link>
      </Button>
    </div>
  );

  // Studio-builtin previews (and creator templates without intrinsic media)
  // need an explicit size box — the shell's preview slot is height-less so
  // resume documents + <video> elements can use their natural dimensions.
  // Wrap with a wide aspect-video frame for everything that isn't a tall
  // resume document, so the unified TemplateThumb / video / image actually
  // has something to fill.
  const previewBody = <TemplatePreview meta={meta} resume={previewResume} />;
  const wrappedPreview =
    meta.kind === "resume" ? (
      previewBody
    ) : (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-muted/30 shadow-sm">
          {previewBody}
        </div>
      </div>
    );

  return (
    <MarketplaceItemShell
      seo={<TemplateSEO meta={meta} />}
      badges={badges}
      actions={actions}
      preview={wrappedPreview}
      sidebar={<CreatorPitchAside itemTypeLabel={KIND_PITCH[meta.kind]} secondary={secondary} />}
    />
  );
}
