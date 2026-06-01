/**
 * /for index — overview of every life-stage Resource Map. Lands here
 * from the footer "All resource maps →" link AND when the compact
 * footer's audience CTA fires.
 *
 * Single source of truth for layout: LIFE_STAGE_AUDIENCE_REGISTRY drives
 * the entire grid. New audiences land here with zero changes to the
 * page.
 */
import { Link, useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import {
  LIFE_STAGE_AUDIENCE_REGISTRY,
  type LifeStageAudienceMeta,
} from "@shared/audiences-registry";
import { audienceSlug } from "@shared/audiences";

const ROLE_KEYS: LifeStageAudienceMeta["key"][] = ["job_seekers", "employers", "recruiters"];

export default function ForIndex(): JSX.Element {
  const location = useLocation();
  useDefaultBreadcrumbs();
  useSEO(location.pathname, {
    title: "Resource maps — hired.video",
    description:
      "Tools, templates, articles, and jobs tailored to where you are in your career — new grad, returning to work, post-layoff, senior exec, and more.",
    ogTitle: "Hired.video Resource Maps",
    ogDescription:
      "Targeted landing pages for every situation: recent grads, job seekers, recruiters, employers, gig workers, veterans, and more.",
  });

  const roles = LIFE_STAGE_AUDIENCE_REGISTRY.filter((a) => ROLE_KEYS.includes(a.key));
  const situations = LIFE_STAGE_AUDIENCE_REGISTRY.filter((a) => !ROLE_KEYS.includes(a.key));

  return (
    <AppShell bgClassName="bg-background">
      <section className="px-4 py-16 text-center sm:px-6 lg:px-8 bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <div className="max-w-3xl mx-auto">
          <Badge variant="outline" className="mb-4">Resource maps</Badge>
          <h1 className="mb-4 text-4xl font-bold sm:text-5xl">Find your path</h1>
          <p className="text-xl text-muted-foreground">
            Same platform, different starting point. Pick the situation that fits — we'll show you the tools, content, and roles built for it.
          </p>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <h2 className="mb-6 text-2xl font-bold">By role</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {roles.map((a) => <AudienceCard key={a.key} meta={a} />)}
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <h2 className="mb-6 text-2xl font-bold">By situation</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {situations.map((a) => <AudienceCard key={a.key} meta={a} />)}
        </div>
      </section>
    </AppShell>
  );
}

function AudienceCard({ meta }: { meta: LifeStageAudienceMeta }): JSX.Element {
  return (
    <Link to={`/for/${audienceSlug(meta.key)}`} className="block">
      <Card className="h-full hover:shadow-md transition-shadow">
        <CardContent className="p-6">
          <h3 className="text-xl font-semibold mb-2">{meta.label}</h3>
          <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{meta.thesis}</p>
          <Button asChild variant="ghost" className="px-0">
            <span>
              Open map
              <ArrowRight className="ml-1 h-4 w-4" />
            </span>
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
}
