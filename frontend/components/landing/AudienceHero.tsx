/**
 * AudienceHero — the top section of every /for/[audience] life-stage
 * page. Reads ENTIRELY from the registry — no per-page copy lives here.
 * Add a new audience to LIFE_STAGE_AUDIENCE_REGISTRY and the hero
 * renders automatically.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LifeStageAudienceMeta } from "@shared/audiences-registry";
import {
  audienceLabel,
  audienceThesis,
  audienceCtaPrimaryLabel,
  audienceCtaSecondaryLabel,
} from "./localize-audience";

export interface AudienceHeroProps {
  meta: LifeStageAudienceMeta;
}

export function AudienceHero({ meta }: AudienceHeroProps): JSX.Element {
  const { t } = useTranslation();
  const label = audienceLabel(t, meta);
  return (
    <section className="px-4 py-20 text-center sm:px-6 lg:px-8 bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
      <div className="max-w-3xl mx-auto">
        <Badge variant="outline" className="mb-4">
          {t("audiences.forBadge", { defaultValue: "For {{label}}", label })}
        </Badge>
        <h1 className="mb-4 text-5xl font-bold">{label}</h1>
        <p className="mb-8 text-xl text-muted-foreground">{audienceThesis(t, meta)}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to={meta.ctaPrimary.href}>{audienceCtaPrimaryLabel(t, meta)}</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to={meta.ctaSecondary.href}>{audienceCtaSecondaryLabel(t, meta)}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
