import MarketingFAQ from "@/components/MarketingFAQ";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useNavigate, Link } from "react-router-dom";
import {
  Users,
  GitBranch,
  CalendarCheck,
  Target,
  HeartPulse,
  Workflow,
  Code2,
  ShieldCheck,
} from "lucide-react";

export default function PeopleOperations() {
  useSEO("/people-operations");
  useBreadcrumbs([{ name: "People Operations", url: "/people-operations" }]);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const primaryCta = () => navigate(isAuthenticated ? "/people/roster" : "/signup?role=employer");

  return (
    <AppShell bgClassName="bg-background">
      <main>
        {/* Hero */}
        <section className="px-6 py-12">
          <div className="max-w-3xl space-y-6">
            <p className="text-sm font-medium text-primary uppercase tracking-wide">For employers</p>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              The CHRO suite, built into hired.video
            </h1>
            <p className="text-lg text-muted-foreground">
              Run your whole team from one place — roster &amp; org chart, 1:1s, performance, goals,
              team health, and the video-first hiring you already know. People Operations turns
              hired.video into your system of record for everything people &amp; talent, and embeds
              into the tools you already use.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={primaryCta}>
                {isAuthenticated ? "Open my roster" : "Get started"}
              </Button>
              <div className="flex items-center text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 mr-2" /> Segment-isolated, paid employer plan
              </div>
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section className="px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center"><Users className="h-5 w-5 mr-2" /> Roster &amp; org chart</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                A single source of truth for your team — directory, manager hierarchy, departments,
                employment type, and live headcount metrics.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center"><CalendarCheck className="h-5 w-5 mr-2" /> 1:1s &amp; action items</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                A recurring cadence with shared agendas and follow-up action items, so a manager
                never drops a 1:1 and nothing slips between meetings.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center"><GitBranch className="h-5 w-5 mr-2" /> Org hierarchy</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Build the org tree from manager relationships and see reporting lines at a glance.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center"><Target className="h-5 w-5 mr-2" /> Goals &amp; performance</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Goals/OKRs, review cycles, and ratings that roll up into team health. <span className="italic">Rolling out.</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center"><HeartPulse className="h-5 w-5 mr-2" /> Team health</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Pulse checks, check-ins, and a composite health score that surfaces people-risk
                before it becomes attrition. <span className="italic">Rolling out.</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center"><Workflow className="h-5 w-5 mr-2" /> Workflow automation</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Onboarding, offboarding, PTO, and promotions on autopilot with trigger-action
                workflows. <span className="italic">Rolling out.</span>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Embed story */}
        <section className="px-6 py-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center"><Code2 className="h-5 w-5 mr-2" /> Embed it anywhere</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                People Operations is multi-tenant by design. Every customer's data is isolated in
                its own segment, so the same product that powers your team can be embedded into
                another platform as a tenant — your roster, 1:1s, and hiring surfaces rendered
                inside their app, authenticated through their identity provider.
              </p>
              <p>One product, many front doors — owned end-to-end by hired.video.</p>
            </CardContent>
          </Card>
        </section>

        {/* FAQ */}
        <MarketingFAQ
          schemaId="people-operations"
          subheading="How People Operations works, what's included, and how billing and isolation work."
          items={[
            {
              question: "What is People Operations?",
              answer:
                "It's the CHRO suite inside hired.video — roster and org chart, 1:1s with shared agendas and action items, performance and goals, team health, and the video-first hiring tools already on the platform. It turns hired.video into your system of record for everything people and talent.",
            },
            {
              question: "Is it included in my plan?",
              answer:
                "People Operations is a paid employer feature. It unlocks on a paid company plan; once your company is on a paid plan, every authorized teammate can use it.",
            },
            {
              question: "How is my data kept separate from other companies?",
              answer:
                "Every record is scoped to your company's isolated segment. No query ever runs without that scope, so one company's roster, 1:1s, and hiring data can never be read by another.",
            },
            {
              question: "Can it be embedded into another application?",
              answer:
                "Yes. The product is built tenant→segment→entity from the ground up, so it can be embedded into a host application as a tenant, authenticated through that host's identity provider, while staying fully isolated.",
            },
            {
              question: "What's available today vs. rolling out?",
              answer:
                "Roster, org chart, and 1:1s with action items are available now. Goals/OKRs, performance reviews, pulse/team-health, weekly syncs, meeting intelligence, workflow automation, headcount planning, and PTO are rolling out — each ships behind the same paid employer plan.",
            },
          ]}
        />

        {/* Final CTA */}
        <section className="px-6 py-12">
          <div className="flex flex-col items-center text-center space-y-4">
            <h2 className="text-2xl font-semibold">Run your team from one place</h2>
            <p className="text-muted-foreground">
              Start with your roster and 1:1s — the rest of the CHRO suite is rolling out on the same plan.
            </p>
            <Button size="lg" onClick={primaryCta}>
              {isAuthenticated ? "Open my roster" : "Get started"}
            </Button>
            {!isAuthenticated && (
              <p className="text-xs text-muted-foreground">
                Already have an account? <Link to="/login" className="underline">Log in</Link>
              </p>
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
