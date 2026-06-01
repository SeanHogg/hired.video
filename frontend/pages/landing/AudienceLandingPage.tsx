// /for/:audience — dispatcher across the two audience taxonomies.
//
//   - Life-stage  → renders <LifeStageLandingPage /> (#1629, Resource Maps)
//   - Profession  → renders the existing studio-templates view (#900)
//
// Single route entry point per the DRY rule — both taxonomies share the
// /for URL space; dispatch happens here so consumers don't fork by
// taxonomy at routing time.
//
// Slug shape: kebab-case in URL, snake_case in the enum (e.g.
// `/for/recent-graduates` ↔ `recent_graduates`); `audienceKeyFromSlug`
// in shared/audiences.ts owns the conversion.

import { useParams, Navigate, useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { MEDIA_KIND_UI, MEDIA_KINDS } from "@shared/media-kinds";
import { StudioTemplateLinkCard } from "@/components/studio/templates/StudioTemplateLinkCard";
import { StudioOpenCTA } from "@/components/studio/templates/StudioOpenCTA";
import { AUDIENCE_BY_ID, type Audience } from "@/components/studio/templates/audiences";
import { templatesForAudience } from "@/components/studio/templates/templates-by-audience";
import { audienceKeyFromSlug, taxonomyOf } from "@shared/audiences";
import { lifeStageAudienceMeta } from "@shared/audiences-registry";
import { LifeStageLandingPage } from "./LifeStageLandingPage";

export default function AudienceLandingPage(): JSX.Element {
  const { audience: slug = "" } = useParams<{ audience: string }>();

  // Resolve the slug across both taxonomies. The shared helper
  // (audienceKeyFromSlug) normalises kebab-case URL → snake_case enum and
  // checks both LIFE_STAGE_AUDIENCES and PROFESSION_AUDIENCES.
  const audienceKey = audienceKeyFromSlug(slug);
  const taxonomy = audienceKey ? taxonomyOf(audienceKey) : null;

  if (taxonomy === "life_stage") {
    const meta = lifeStageAudienceMeta(audienceKey as Parameters<typeof lifeStageAudienceMeta>[0]);
    if (!meta) return <Navigate to="/for" replace />;
    return <LifeStageLandingPage meta={meta} />;
  }

  // Fall through to the existing profession-audience surface (studio
  // templates grouped by media kind).
  return <ProfessionAudienceLandingPage slug={slug} />;
}

function ProfessionAudienceLandingPage({ slug }: { slug: string }): JSX.Element {
  const location = useLocation();
  const audience = slug && slug in AUDIENCE_BY_ID ? AUDIENCE_BY_ID[slug as Audience] : null;

  useDefaultBreadcrumbs();
  useSEO(
    location.pathname,
    audience
      ? {
          title: `${audience.label} — templates that promote your work · hired.video`,
          description: audience.blurb,
          ogTitle: `${audience.label} on hired.video — studio templates built for you`,
          ogDescription: audience.blurb,
        }
      : undefined,
  );

  if (!audience) return <Navigate to="/for" replace />;

  const templates = templatesForAudience(audience.id);
  if (templates.length === 0) return <Navigate to="/studio" replace />;

  const kindsCovered = MEDIA_KINDS.filter((k) => templates.some((t) => t.mediaKind === k));

  return (
    <AppShell bgClassName="bg-background">
      <div>
        <section className="px-4 py-20 text-center sm:px-6 lg:px-8 bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
          <div>
            <Badge variant="outline" className="mb-4">
              For {audience.label.toLowerCase()}
            </Badge>
            <h1 className="mb-4 text-5xl font-bold">{audience.label}</h1>
            <p className="mb-8 text-xl text-muted-foreground">{audience.blurb}</p>
            <StudioOpenCTA withArrow />
          </div>
        </section>

        {kindsCovered.length > 1 && (
          <section className="border-y bg-muted/30 px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="text-sm text-muted-foreground">You can build:</span>
              {kindsCovered.map((kind) => (
                <Badge key={kind} variant="secondary" className="text-sm">
                  {MEDIA_KIND_UI[kind].badgeLabel}
                </Badge>
              ))}
            </div>
          </section>
        )}

        <section className="px-4 py-12 sm:px-6 lg:px-8">
          <div className="space-y-12">
            {kindsCovered.map((kind) => {
              const inKind = templates.filter((t) => t.mediaKind === kind);
              return (
                <div key={kind}>
                  <h2 className="mb-6 text-2xl font-bold">
                    {MEDIA_KIND_UI[kind].badgeLabel} templates
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({inKind.length})
                    </span>
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {inKind.map((t) => (
                      <StudioTemplateLinkCard key={t.id} template={t} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-gradient-to-br from-brand-purple/5 to-brand-blue/5 px-4 py-16 text-center sm:px-6 lg:px-8">
          <div>
            <h2 className="mb-4 text-3xl font-bold">Make something great</h2>
            <p className="mb-6 text-lg text-muted-foreground">
              {templates.length} template{templates.length === 1 ? "" : "s"} built for {audience.label.toLowerCase()}. Pick one,
              fill the prompt, and the studio renders it in your browser.
            </p>
            <StudioOpenCTA />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
