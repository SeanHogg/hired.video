// Marketplace surface for previewing and applying any kind of template.
// Resolves a slug (resume / studio-builtin / studio-creator) through the
// unified template registry, then composes the kind-agnostic shell from
// <TemplatePreview> + <TemplateApplyButton> so a new kind lands here for
// free as soon as it's registered.

import { Eye, Loader2, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import ErrorBoundary from "@/components/ErrorBoundary";
import CreatorPitchAside from "@/components/marketplace/CreatorPitchAside";
import MarketplaceItemShell from "@/components/marketplace/MarketplaceItemShell";
import ReportAbuseButton from "@/components/moderation/ReportAbuseButton";
import ResumeSourceSelector from "@/components/templates/ResumeSourceSelector";
import TemplateApplyButton from "@/components/templates/TemplateApplyButton";
import TemplatePlayer from "@/components/templates/TemplatePlayer";
import TemplatePreview from "@/components/templates/TemplatePreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import { useUgcSeo } from "@/lib/seo-ugc";
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

// Mounted as the seo slot so useUgcSeo only fires when the template is
// resolved. Builder lives in lib/seo-ugc.ts ("templateListing" kind).
function TemplateSEO({ meta }: { meta: TemplateMeta }) {
  useUgcSeo("templateListing", {
    slug: meta.slug,
    name: meta.name,
    blurb: meta.blurb,
    industry: meta.industry,
    tags: meta.tags,
    priceCents: meta.priceCents,
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

  // Resume templates keep the document renderer — they aren't time-based,
  // so there's no "play" concept. Every other kind routes through
  // <TemplatePlayer/>, which mounts the unified <StudioPlayer/> behind a
  // press-play overlay so visitors can watch the template walk through
  // its scenes before adopting it.
  // Isolate the preview render: a malformed resume (bad skillEvidence row,
  // null content, etc.) crashes only the preview pane — not the whole page —
  // and the developer view surfaces the exact error inline (#1885).
  const wrappedPreview =
    meta.kind === "resume" ? (
      <ErrorBoundary level="component">
        <TemplatePreview meta={meta} resume={previewResume} />
      </ErrorBoundary>
    ) : (
      <div className="w-full px-4 py-6">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-muted/30 shadow-sm">
          <TemplatePlayer meta={meta} />
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
