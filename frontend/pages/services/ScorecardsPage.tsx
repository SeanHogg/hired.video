// ScorecardsPage — recruiter hub for managing scorecard templates and
// interview kits. Lives at /people/scorecards alongside the rest of the
// People surfaces.

import { useLocation } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSEO } from "@/lib/seo";
import { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";
import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { usePeopleTabs } from "@/hooks/use-people-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ScorecardTemplateEditor } from "@/components/scorecards/ScorecardTemplateEditor";
import { InterviewKitEditor } from "@/components/scorecards/InterviewKitEditor";
import { CompetencyLibraryEditor } from "@/components/scorecards/CompetencyLibraryEditor";
import { InterviewerReliabilityPanel } from "@/components/scorecards/InterviewerReliabilityPanel";
import { CalibrationManager } from "@/components/scorecards/CalibrationManager";
import ScorecardVisibilityPanel from "@/components/scorecards/ScorecardVisibilityPanel";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";

export default function ScorecardsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const { companyId, loading, hasNoCompany } = useCurrentCompanyScope();
  const peopleTabs = usePeopleTabs();
  const { user } = useAuth();

  useSEO(location.pathname, {
    title: "Scorecards & Interview Kits — Hired.Video",
    description:
      "Structured-hiring scorecards, multi-evaluator debriefs, and interview kits for your team.",
  });

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-4 md:px-6 pt-4 md:pt-6 pb-12">
        <div className="space-y-6">
          <PageHeader tabs={peopleTabs} activeTabKey="scorecards" sticky />

          <div>
            <h1 className="text-2xl font-bold">Scorecards & Interview Kits</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Reusable rating rubrics + stage-by-stage interview plans. Each
              stage carries its own scorecard so evaluators can rate
              candidates consistently.
            </p>
          </div>

          {user?.id && <InterviewerReliabilityPanel userId={user.id} />}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : hasNoCompany || !companyId ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Create a company first — scorecards live under a company
                workspace.
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="templates">
              <TabsList>
                <TabsTrigger value="templates">Templates</TabsTrigger>
                <TabsTrigger value="kits">Interview kits</TabsTrigger>
                <TabsTrigger value="competencies">Competency library</TabsTrigger>
                <TabsTrigger value="calibration">Calibration</TabsTrigger>
                <TabsTrigger value="visibility">{t("scorecardVisibility.tab")}</TabsTrigger>
              </TabsList>
              <TabsContent value="templates" className="mt-4">
                <ScorecardTemplateEditor companyId={companyId} />
              </TabsContent>
              <TabsContent value="kits" className="mt-4">
                <InterviewKitEditor companyId={companyId} />
              </TabsContent>
              <TabsContent value="competencies" className="mt-4">
                <CompetencyLibraryEditor companyId={companyId} />
              </TabsContent>
              <TabsContent value="calibration" className="mt-4">
                <CalibrationManager companyId={companyId} />
              </TabsContent>
              <TabsContent value="visibility" className="mt-4">
                <ScorecardVisibilityPanel scope="company" id={companyId} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>
    </AppShell>
  );
}
