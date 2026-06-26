// Marketplace surface for previewing and applying any kind of template.
// Resolves a slug (resume / studio-builtin / studio-creator) through the
// unified template registry, then composes the kind-agnostic shell from
// <TemplatePreview> + <TemplateApplyButton> so a new kind lands here for
// free as soon as it's registered.

import { ChevronRight, Eye, Loader2, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import ErrorBoundary from "@/components/ErrorBoundary";
import CreatorAttribution from "@/components/studio/CreatorAttribution";
import CreatorPitchAside from "@/components/marketplace/CreatorPitchAside";
import MarketplaceItemShell from "@/components/marketplace/MarketplaceItemShell";
import ReportAbuseButton from "@/components/moderation/ReportAbuseButton";
import RelatedTemplates from "@/components/templates/RelatedTemplates";
import ResumeSourceSelector from "@/components/templates/ResumeSourceSelector";
import ShareMenu from "@/components/share/ShareMenu";
import TemplateApplyButton from "@/components/templates/TemplateApplyButton";
import TemplateMarketingContent from "@/components/templates/TemplateMarketingContent";
import TemplatePlayer from "@/components/templates/TemplatePlayer";
import TemplatePreview from "@/components/templates/TemplatePreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import { useBreadcrumbs } from "@/lib/seo";
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
    // OG / Twitter / JSON-LD image — previously dropped, leaving social + AI
    // preview cards image-less. Creator templates carry a real thumbnail;
    // others omit it and fall back to the platform default card via the SEO
    // layer. (previewVideoUrl is a clip, not an image — never used here.)
    previewImageUrl: meta.thumbnailUrl,
  });
  return null;
}

export default function MarketplaceTemplatePreview() {
  const { templateId } = useParams<{ templateId: string }>();
  const { template: meta, loading } = useTemplate(templateId);
  const { t } = useTranslation();

  // BreadcrumbList JSON-LD (Home → Templates → this template). Built before
  // the early returns so the hook order stays stable; emits an empty list
  // while the template resolves, then the real trail once it does.
  const breadcrumbItems = useMemo(
    () =>
      meta
        ? [
            { name: t("marketplaceTemplate.breadcrumb.home"), url: "/" },
            {
              name: t("marketplaceTemplate.breadcrumb.templates"),
              url: "/search?category=templates",
            },
            { name: meta.name, url: `/marketplace/templates/${meta.slug}` },
          ]
        : [],
    [meta, t],
  );
  useBreadcrumbs(breadcrumbItems);

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

  // Canonical, shareable URL for this template — drives the social ShareMenu
  // (LinkedIn / X / Facebook / WhatsApp / Email / copy / native). Built from
  // the live origin so it stays correct across preview / prod hosts.
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/marketplace/templates/${encodeURIComponent(meta.slug)}`
      : `/marketplace/templates/${encodeURIComponent(meta.slug)}`;

  const actions = (
    <>
      <ResumeSourceSelector meta={meta} value={sampleSelection} onChange={setSampleSelection} />
      <TemplateApplyButton meta={meta} size="sm" />
      <ShareMenu
        variant="outline"
        url={shareUrl}
        title={meta.name}
        text={meta.blurb}
      />
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
      {/* #633 — credit the publishing creator with a link to their public
          profile. Self-gating: renders nothing for non-creator templates
          or while the user resolves. */}
      {meta.origin.kind === "studio-creator" && (
        <CreatorAttribution creatorId={meta.origin.template.creatorId} label="Created by" />
      )}
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
  const playerBlock =
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

  // Page header — the single <h1> (the template name used to render only as a
  // mono Badge in the action bar, leaving the page with no H1) plus a visible
  // breadcrumb trail whose Home / Templates links flow PageRank back up to the
  // catalog hubs and give crawlers a path off every template page.
  const header = (
    <header className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <li>
            <Link to="/" className="hover:underline">
              {t("marketplaceTemplate.breadcrumb.home")}
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3 w-3" />
          </li>
          <li>
            <Link to="/search?category=templates" className="hover:underline">
              {t("marketplaceTemplate.breadcrumb.templates")}
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3 w-3" />
          </li>
          <li className="font-medium text-foreground" aria-current="page">
            {meta.name}
          </li>
        </ol>
      </nav>
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{meta.name}</h1>
      {meta.industry && (
        <p className="mt-1 text-sm text-muted-foreground">{meta.industry}</p>
      )}
    </header>
  );

  // Main column = header → preview/player → full marketing surface (context
  // CTA → how it works → why use → who it's for → why join) → related
  // templates. The page used to render only the bare player; the header gives
  // it a crawlable H1 + breadcrumbs and the related grid keeps it linked into
  // the rest of the catalog instead of being a near-orphan.
  const wrappedPreview = (
    <>
      {header}
      {playerBlock}
      <TemplateMarketingContent meta={meta} />
      <RelatedTemplates meta={meta} />
    </>
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
