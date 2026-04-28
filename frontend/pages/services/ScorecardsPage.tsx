// ScorecardsPage — recruiter hub for managing scorecard templates and
// interview kits. Slots into My Services as `/services/scorecards`.

import { useLocation } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSEO } from "@/lib/seo";
import { useSidebar } from "@/hooks/use-sidebar";
import { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import ServicesNav from "@/components/services/ServicesNav";
import { Card, CardContent } from "@/components/ui/card";
import { ScorecardTemplateEditor } from "@/components/scorecards/ScorecardTemplateEditor";
import { InterviewKitEditor } from "@/components/scorecards/InterviewKitEditor";

export default function ScorecardsPage() {
  const location = useLocation();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { companyId, loading, hasNoCompany } = useCurrentCompanyScope();

  useSEO(location.pathname, {
    title: "Scorecards & Interview Kits — Hired.Video",
    description:
      "Structured-hiring scorecards, multi-evaluator debriefs, and interview kits for your team.",
  });

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        <main className="pt-16 px-4 sm:px-6 lg:px-8 pb-12">
          <div className="max-w-4xl mx-auto pt-6 space-y-6">
            <ServicesNav hasCompanyAccess={!hasNoCompany} />

            <div>
              <h1 className="text-2xl font-bold">Scorecards & Interview Kits</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Reusable rating rubrics + stage-by-stage interview plans. Each
                stage carries its own scorecard so evaluators can rate
                candidates consistently.
              </p>
            </div>

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
                </TabsList>
                <TabsContent value="templates" className="mt-4">
                  <ScorecardTemplateEditor companyId={companyId} />
                </TabsContent>
                <TabsContent value="kits" className="mt-4">
                  <InterviewKitEditor companyId={companyId} />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
