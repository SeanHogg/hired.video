// Per-template landing page (#901) at `/templates/:slug`.
//
// Public SEO surface for the built-in catalog — hero, "best for" audience
// chips that link to #900 audience pages, OutputProfilePanel ("Exports as
// / Publishes to" reads `mediaKind` from `@shared/media-kinds.ts`), 3-step
// "how it works", related-template grid, and the conversion CTA into
// `/studio?template=:id` (the deep-link pattern already wired in
// StudioLayout + StudioEditorV2).

import { useParams, Navigate, Link, useLocation } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useSEO } from "@/lib/seo";
import { MEDIA_KIND_UI } from "@shared/media-kinds";
import { TEMPLATE_CATALOG } from "@/components/studio/templates/catalog";
import { OutputProfilePanel } from "@/components/studio/templates/OutputProfilePanel";
import { StudioTemplateLinkCard } from "@/components/studio/templates/StudioTemplateLinkCard";
import { getAudience } from "@/components/studio/templates/audiences";

export default function TemplateLandingPage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const template = TEMPLATE_CATALOG.find((t) => t.id === slug);

  // Hooks must run unconditionally — feed empty customSEO when template is
  // missing; the Navigate below will redirect before render anyway.
  useSEO(
    location.pathname,
    template
      ? {
          title: `${template.label} — make one in the hired.video Studio`,
          description: template.desc,
          ogTitle: `${template.label} template — hired.video Studio`,
          ogDescription: template.desc,
        }
      : undefined,
  );

  if (!template) return <Navigate to="/studio" replace />;

  const Icon = template.icon;
  const ui = MEDIA_KIND_UI[template.mediaKind];
  const audienceDefs = template.audiences.map(getAudience);

  // Related = templates sharing any audience, excluding self. First 4 win.
  const related = TEMPLATE_CATALOG.filter(
    (t) => t.id !== template.id && t.audiences.some((a) => template.audiences.includes(a)),
  ).slice(0, 4);

  return (
    <AppShell bgClassName="bg-background">
      <div className="pt-16">
        {/* Hero */}
        <section className="px-4 py-16 sm:px-6 lg:px-8 bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
          <div className="mx-auto max-w-5xl">
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Link to="/studio" className="hover:underline">Studio</Link>
              <span>·</span>
              <span>{ui.badgeLabel} template</span>
            </div>
            <div className="flex flex-col items-start gap-6 sm:flex-row">
              <div className="shrink-0 rounded-xl bg-primary/10 p-4">
                <Icon className="h-12 w-12 text-primary" />
              </div>
              <div className="flex-1">
                <h1 className="mb-3 text-4xl font-bold">{template.label}</h1>
                <p className="mb-6 text-lg text-muted-foreground">{template.desc}</p>
                <Button asChild size="lg">
                  <Link to={`/studio?template=${template.id}`}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Open in studio
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Best for + Output panel — side-by-side on desktop */}
        <section className="px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
            {audienceDefs.length > 0 && (
              <Card>
                <CardContent className="space-y-3 p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Best for
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {audienceDefs.map((a) => (
                      <Link key={a.id} to={`/for/${a.id}`}>
                        <Badge
                          variant="secondary"
                          className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                        >
                          {a.label}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">{audienceDefs[0].blurb}</p>
                </CardContent>
              </Card>
            )}
            <OutputProfilePanel mediaKind={template.mediaKind} />
          </div>
        </section>

        {/* How it works */}
        <section className="bg-muted/30 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-8 text-center text-2xl font-bold">How it works</h2>
            <div className="grid gap-6 md:grid-cols-3">
              <Step
                n={1}
                title="Open the template"
                body={`Click "Open in studio" — the editor opens pre-loaded with the ${template.label} layout.`}
              />
              <Step
                n={2}
                title="Fill the prompt + drop media"
                body="Tell the AI what you want. Drop clips or audio. The studio assembles the project in your browser."
              />
              <Step
                n={3}
                title={`Export your ${ui.badgeLabel.toLowerCase()}`}
                body={`${ui.exportVerb} in one click — the publish menu lights up only the destinations that fit this kind.`}
              />
            </div>
          </div>
        </section>

        {/* Related templates */}
        {related.length > 0 && (
          <section className="px-4 py-12 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
              <h2 className="mb-6 text-2xl font-bold">
                More for {audienceDefs[0]?.label.toLowerCase() ?? "you"}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {related.map((t) => (
                  <StudioTemplateLinkCard key={t.id} template={t} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Final CTA */}
        <section className="bg-gradient-to-br from-brand-purple/5 to-brand-blue/5 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-3xl font-bold">Make your {template.label.toLowerCase()}</h2>
            <p className="mb-6 text-lg text-muted-foreground">{template.desc}</p>
            <Button asChild size="lg">
              <Link to={`/studio?template=${template.id}`}>
                <Sparkles className="mr-2 h-4 w-4" />
                Open in studio
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }): JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-2 p-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {n}
        </div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
