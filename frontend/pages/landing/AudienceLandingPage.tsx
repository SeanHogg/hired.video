// /for/:audience — dispatcher across the two audience taxonomies.
//
//   - Life-stage  → renders <LifeStageLandingPage /> (#1629, Resource Maps)
//   - Profession  → renders <ProfessionLandingPage /> (#900, rich marketing
//                   page: hero → benefits → how-it-works → templates →
//                   geo/hiring CTA → FAQ → related → final CTA)
//
// Single route entry point per the DRY rule — both taxonomies share the
// /for URL space; dispatch happens here so consumers don't fork by
// taxonomy at routing time.
//
// Slug shape: kebab-case in URL, snake_case in the enum (e.g.
// `/for/recent-graduates` ↔ `recent_graduates`); `audienceKeyFromSlug`
// in shared/audiences.ts owns the conversion.

import { useParams, Navigate, useLocation } from "react-router-dom";
import { AUDIENCE_BY_ID, type Audience } from "@/components/studio/templates/audiences";
import { audienceKeyFromSlug, taxonomyOf } from "@shared/audiences";
import { lifeStageAudienceMeta } from "@shared/audiences-registry";
import { LifeStageLandingPage } from "./LifeStageLandingPage";
import { ProfessionLandingPage } from "./ProfessionLandingPage";

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
  if (!audience) return <Navigate to="/for" replace />;
  return (
    <ProfessionLandingPage audience={audience} slug={slug} pathname={location.pathname} />
  );
}
