import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { teamHealthApi, type TeamHealth } from "@/lib/people-ops/api";

const LABELS: Record<string, string> = {
  engagement: "Engagement", performance: "Performance", goalAlignment: "Goal alignment",
  reviewHealth: "Review health", communication: "Communication",
};

export default function PeopleTeamHealth() {
  useSEO("/people/team-health");
  useBreadcrumbs([
    { name: "People Operations", url: "/people-ops" },
    { name: "Team Health", url: "/people/team-health" },
  ]);
  const [h, setH] = useState<TeamHealth | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  useEffect(() => {
    teamHealthApi.get().then(setH).catch((e) => {
      const m = e instanceof Error ? e.message : "Failed to load";
      if (/paid|upgrade/i.test(m)) setUpgrade(true); else setErr(m);
    });
  }, []);

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-6 py-8 space-y-6 max-w-3xl">
        <div>
          <Link to="/people-ops" className="text-sm text-muted-foreground hover:underline">← People Operations</Link>
          <h1 className="text-3xl font-bold tracking-tight">Team Health</h1>
          <p className="text-muted-foreground">A composite score recomputed from live roster, performance, goals, reviews, and engagement data.</p>
        </div>
        {upgrade ? (
          <p className="text-muted-foreground">This is a paid employer feature. <Link to="/people-operations" className="underline">See plans</Link>.</p>
        ) : err ? <p className="text-red-600">{err}</p>
        : !h ? <p className="text-muted-foreground">Loading…</p>
        : (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="text-6xl font-bold">{h.score}<span className="text-xl text-muted-foreground">/100</span></div>
                <p className="text-sm text-muted-foreground mt-1">{h.headcount} active team members</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Dimensions</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(h.dimensions).map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{LABELS[k] ?? k} <span className="text-muted-foreground">({Math.round((h.weights[k] ?? 0) * 100)}% weight)</span></span>
                      <span className="tabular-nums">{v}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-2 bg-primary" style={{ width: `${v}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </AppShell>
  );
}
