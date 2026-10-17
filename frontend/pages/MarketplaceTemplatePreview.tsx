// Template detail page — /marketplace/templates/:templateId.
// Resolves a slug (resume / studio-builtin / studio-creator — or a creator
// template's id, for old links) through the
// unified template registry. Layout: breadcrumb → big live preview on the
// left (resume templates render the visitor's chosen resume; video kinds
// play through TemplatePlayer) and one detail/CTA panel on the right →
// related templates. A new kind lands here for free once it's registered.

import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import ErrorBoundary from "@/components/ErrorBoundary";
import MarketplaceItemShell from "@/components/marketplace/MarketplaceItemShell";
import RelatedTemplates from "@/components/templates/RelatedTemplates";
import ResumeSourceSelector from "@/components/templates/ResumeSourceSelector";
import TemplateDetailPanel from "@/components/templates/TemplateDetailPanel";
import TemplatePlayer from "@/components/templates/TemplatePlayer";
import TemplatePreview from "@/components/templates/TemplatePreview";
import { useAuth } from "@/lib/auth";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import { useBreadcrumbs } from "@/lib/seo";
import { useUgcSeo } from "@/lib/seo-ugc";
import { useResume } from "@/hooks/queries/use-resumes";
import { useTemplate } from "@/lib/templates/registry";
import { isResumeTemplate, type TemplateMeta } from "@/lib/templates/types";
import type { Resume } from "@/types/resume";

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
    // Creator templates carry a real thumbnail; others fall back to the
    // platform default card via the SEO layer.
    previewImageUrl: meta.thumbnailUrl,
  });
  return null;
}

/** Resolves the resume the preview renders: the bundled sample, or one of
 *  the signed-in visitor's resumes picked in ResumeSourceSelector. */
function usePreviewResume(selection: string): Resume {
  const isSample = selection === "sample";
  const { data, isError } = useResume(isSample ? null : selection, { keepPrevious: true });
  return isSample || isError || !data ? SAMPLE_RESUME : data;
}

export default function MarketplaceTemplatePreview() {
  const { templateId } = useParams<{ templateId: string }>();
  const { template: meta, loading } = useTemplate(templateId);
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  // BreadcrumbList JSON-LD (Home → Templates → this template). Built before
  // the early returns so the hook order stays stable.
  const breadcrumbItems = useMemo(
    () =>
      meta
        ? [
            { name: t("marketplaceTemplate.breadcrumb.home"), url: "/" },
            { name: t("marketplaceTemplate.breadcrumb.templates"), url: "/templates" },
            { name: meta.name, url: `/marketplace/templates/${meta.slug}` },
          ]
        : [],
    [meta, t],
  );
  useBreadcrumbs(breadcrumbItems);

  const [sampleSelection, setSampleSelection] = useState<string>("sample");
  const previewResume = usePreviewResume(sampleSelection);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        {t("templates.detail.loading")}
      </div>
    );
  }

  // Unknown / missing template → bounce to the catalog.
  if (!meta) {
    return <Navigate to="/templates" replace />;
  }

  const path = `/marketplace/templates/${encodeURIComponent(meta.slug)}`;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  // Resume templates keep the document renderer (DeclarativeResumeRenderer
  // pins itself to light via force-light-scope); every other kind plays
  // through TemplatePlayer. ErrorBoundary isolates a malformed resume to
  // the preview pane (#1885).
  const previewBlock =
    isResumeTemplate(meta) ? (
      <>
        {isAuthenticated && (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-sm text-muted-foreground">{t("templates.detail.previewWith")}</span>
            <ResumeSourceSelector meta={meta} value={sampleSelection} onChange={setSampleSelection} />
          </div>
        )}
        <article className="overflow-hidden rounded-lg bg-card shadow-2xl ring-1 ring-input">
          <ErrorBoundary level="component">
            <TemplatePreview meta={meta} resume={previewResume} />
          </ErrorBoundary>
        </article>
      </>
    ) : (
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-ink shadow-2xl ring-1 ring-input">
        <TemplatePlayer meta={meta} />
      </div>
    );

  // Mockup layout: breadcrumb → [big preview | info panel] (wraps to a
  // single column, preview first) → related templates.
  const page = (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 pb-[72px] pt-4">
      <nav aria-label={t("templates.detail.breadcrumbAria")}>
        <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <li>
            <Link to="/" className="text-primary hover:underline">
              {t("marketplaceTemplate.breadcrumb.home")}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link to="/templates" className="text-primary hover:underline">
              {t("marketplaceTemplate.breadcrumb.templates")}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{meta.name}</li>
        </ol>
      </nav>

      <div className="flex flex-wrap items-start gap-8">
        <section
          aria-label={t("templates.detail.previewAria")}
          className="flex min-w-0 flex-[999_1_600px] flex-col gap-3"
        >
          {previewBlock}
        </section>
        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
          <TemplateDetailPanel meta={meta} shareUrl={shareUrl} />
        </aside>
      </div>

      <RelatedTemplates meta={meta} />
    </main>
  );

  return <MarketplaceItemShell seo={<TemplateSEO meta={meta} />} preview={page} />;
}
