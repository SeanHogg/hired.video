/**
 * AudienceHero — the top section of every /for/[audience] life-stage
 * page. Reads ENTIRELY from the registry — no per-page copy lives here.
 * Add a new audience to LIFE_STAGE_AUDIENCE_REGISTRY and the hero
 * renders automatically.
 */
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LifeStageAudienceMeta } from "@shared/audiences-registry";

export interface AudienceHeroProps {
  meta: LifeStageAudienceMeta;
}

export function AudienceHero({ meta }: AudienceHeroProps): JSX.Element {
  return (
    <section className="px-4 py-20 text-center sm:px-6 lg:px-8 bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
      <div className="max-w-3xl mx-auto">
        <Badge variant="outline" className="mb-4">
          For {meta.label}
        </Badge>
        <h1 className="mb-4 text-5xl font-bold">{meta.label}</h1>
        <p className="mb-8 text-xl text-muted-foreground">{meta.thesis}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to={meta.ctaPrimary.href}>{meta.ctaPrimary.label}</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to={meta.ctaSecondary.href}>{meta.ctaSecondary.label}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
