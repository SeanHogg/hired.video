/**
 * AudienceHero — the top section of every /for/[audience] life-stage
 * page. Reads ENTIRELY from the registry — no per-page copy lives here.
 * Add a new audience to LIFE_STAGE_AUDIENCE_REGISTRY and the hero
 * renders automatically. Layout comes from the shared SeoHero.
 *
 * The primary button is the audience's create-intent start (#2364), the
 * same link the page's closing upload step uses, so the hero and the close
 * never point at two different starts.
 */
import { useTranslation } from "react-i18next";
import type { LifeStageAudienceMeta } from "@shared/audiences-registry";
import { startIntentForAudience } from "@/lib/studio/create-intent";
import { SeoHero } from "./SeoHero";
import { useIntentCta } from "./AudienceUploadStep";
import { audienceLabel, audienceThesis, audienceCtaSecondaryLabel } from "./localize-audience";

export interface AudienceHeroProps {
  meta: LifeStageAudienceMeta;
}

export function AudienceHero({ meta }: AudienceHeroProps): JSX.Element {
  const { t } = useTranslation();
  const label = audienceLabel(t, meta);
  const startCta = useIntentCta(startIntentForAudience(meta.key));
  return (
    <SeoHero
      eyebrow={t("audiences.forBadge", { defaultValue: "For {{label}}", label })}
      title={label}
      lede={audienceThesis(t, meta)}
      primary={startCta}
      secondary={{ to: meta.ctaSecondary.href, label: audienceCtaSecondaryLabel(t, meta) }}
    />
  );
}
