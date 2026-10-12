// /vs-competitors. Job-seeker-only product (HIRING_PERSONAS_ENABLED off):
// a short job-seeker comparison. Hiring personas on: the recruiter / ATS
// vendor comparison (tables, per-competitor cards, recruiter FAQ).
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { buildComparisonStructuredData } from "@/components/CompetitorComparison";
import { AppShell } from "@/components/AppShell";
import RecruiterCompetitorsView from "@/components/competitors/RecruiterCompetitorsView";
import JobSeekerCompetitorsView from "@/components/competitors/JobSeekerCompetitorsView";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";

export default function Competitors() {
  const location = useLocation();
  const { t } = useTranslation();
  // Title / description / keywords come from the central PAGE_SEO entry
  // for /vs-competitors (gap #1968). The vendor-comparison structured data
  // only applies to the recruiter view.
  useSEO(
    location.pathname,
    HIRING_PERSONAS_ENABLED ? { structuredData: buildComparisonStructuredData() } : undefined,
  );
  useBreadcrumbs([{ name: t("competitorsPage.title"), url: "/vs-competitors" }]);

  return (
    <AppShell bgClassName="bg-background">
      <main>{HIRING_PERSONAS_ENABLED ? <RecruiterCompetitorsView /> : <JobSeekerCompetitorsView />}</main>
    </AppShell>
  );
}
