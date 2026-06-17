/**
 * AudienceLinks — shared link grid used by both Footer variants and the
 * /for index page. Splits the 14 life-stage audiences into a "By Role"
 * group (Job Seekers / Employers / Recruiters) and a "By Situation"
 * group (everything else).
 *
 * Self-gates by display mode — `variant="compact"` collapses the
 * situation list behind a "See all →" link; `variant="expanded"` shows
 * everything inline (the SEO-juice mode for the anonymous footer).
 *
 * Per DRY rule: ONE component, two layouts, fed from
 * LIFE_STAGE_AUDIENCE_REGISTRY so a new audience surfaces here without
 * touching either consumer.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LIFE_STAGE_AUDIENCE_REGISTRY,
  type LifeStageAudienceMeta,
} from "@shared/audiences-registry";
import { audienceSlug } from "@shared/audiences";
import { audienceLabel } from "./localize-audience";

const ROLE_KEYS: LifeStageAudienceMeta["key"][] = [
  "job_seekers",
  "employers",
  "recruiters",
];

export interface AudienceLinksProps {
  variant: "compact" | "expanded";
}

export function AudienceLinks({ variant }: AudienceLinksProps): JSX.Element {
  const { t } = useTranslation();
  const roleAudiences = LIFE_STAGE_AUDIENCE_REGISTRY.filter((a) =>
    ROLE_KEYS.includes(a.key),
  );
  const situationAudiences = LIFE_STAGE_AUDIENCE_REGISTRY.filter(
    (a) => !ROLE_KEYS.includes(a.key),
  );

  if (variant === "compact") {
    return (
      <div>
        <h3 className="font-semibold text-foreground mb-4">
          {t("resourceMaps.title")}
        </h3>
        <ul className="space-y-2">
          {roleAudiences.map((a) => (
            <li key={a.key}>
              <Link
                to={`/for/${audienceSlug(a.key)}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {audienceLabel(t, a)}
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/for"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("resourceMaps.all")}
            </Link>
          </li>
        </ul>
      </div>
    );
  }

  // Expanded — full grid for the anonymous-visitor footer.
  return (
    <div className="md:col-span-2">
      <h3 className="font-semibold text-foreground mb-4">
        {t("resourceMaps.bySituation")}
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {[...roleAudiences, ...situationAudiences].map((a) => (
          <Link
            key={a.key}
            to={`/for/${audienceSlug(a.key)}`}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {audienceLabel(t, a)}
          </Link>
        ))}
      </div>
    </div>
  );
}
