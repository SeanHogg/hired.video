/**
 * RelatedAudiences — chip strip at the bottom of /for/[audience] linking
 * sibling life-stage audiences. Reads directly from the registry so a new
 * audience auto-surfaces here without per-page wiring.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LIFE_STAGE_AUDIENCE_REGISTRY,
  type LifeStageAudienceMeta,
} from "@shared/audiences-registry";
import { audienceSlug } from "@shared/audiences";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { audienceLabel } from "./localize-audience";
import { PILL_LINK_CLASS } from "./LinkTile";

export interface RelatedAudiencesProps {
  /** Current audience key — used to omit self from the chip strip. */
  current: LifeStageAudienceMeta["key"];
  tone?: "page" | "card";
}

export function RelatedAudiences({ current, tone = "page" }: RelatedAudiencesProps): JSX.Element {
  const { t } = useTranslation();
  const others = LIFE_STAGE_AUDIENCE_REGISTRY.filter((a) => a.key !== current);
  return (
    <MarketingBand tone={tone} labelledBy="related-audiences-title" className="flex flex-col gap-8">
      <MarketingSectionIntro
        id="related-audiences-title"
        title={t("audiences.related.heading", { defaultValue: "Other paths" })}
        subtitle={t("audiences.related.subhead", { defaultValue: "Same platform, different starting point." })}
      />
      <ul className="flex flex-wrap gap-2.5">
        {others.map((a) => (
          <li key={a.key}>
            <Link to={`/for/${audienceSlug(a.key)}`} className={PILL_LINK_CLASS}>
              {audienceLabel(t, a)}
            </Link>
          </li>
        ))}
      </ul>
    </MarketingBand>
  );
}
