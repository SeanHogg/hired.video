import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { teamHealthApi, type TeamHealth } from "@/lib/people-ops/api";
import { HUB_LINKS } from "@/lib/people-ops/surfaces";
import { Users } from "lucide-react";

export default function PeopleOpsHub() {
  useSEO("/people");
  useBreadcrumbs([{ name: "People Operations", url: "/people" }]);
  const [health, setHealth] = useState<TeamHealth | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  useEffect(() => {
    teamHealthApi.get().then(setHealth).catch((e) => {
      if (/paid|upgrade/i.test(e instanceof Error ? e.message : "")) setUpgrade(true);
    });
  }, []);

  if (upgrade) {
    return (
      <AppShell bgClassName="bg-background">
        <main className="px-6 py-16 max-w-2xl mx-auto text-center space-y-6">
          <Users className="h-12 w-12 mx-auto text-primary" />
          <h1 className="text-3xl font-bold">People Operations is a paid employer feature</h1>
          <p className="text-muted-foreground">Upgrade your company plan to run your whole team from here.</p>
          <Link to="/people-operations" className="text-primary underline">See plans &amp; features</Link>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">People Operations</h1>
          <p className="text-muted-foreground">Run your whole team — roster, cadence, performance, and cost.</p>
        </div>

        {health && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Team Health</CardTitle>
              <CardDescription>Composite score across engagement, performance, alignment, reviews, and communication.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4">
                <div className="text-5xl font-bold">{health.score}<span className="text-lg text-muted-foreground">/100</span></div>
                <Link to="/people/team-health" className="text-sm text-primary underline mb-2">View breakdown</Link>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {HUB_LINKS.map((l) => (
            <Link key={l.href} to={l.href}>
              <Card className="h-full hover:border-primary transition-colors">
                <CardHeader>
                  <CardTitle className="text-base">{l.title}</CardTitle>
                  <CardDescription>{l.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
