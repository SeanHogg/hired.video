/**
 * /sectors — index of every AI-resilient sector, grouped by resilience
 * tier. Honest framing: physical/high-resilience first, mixed-resilience
 * second, AI-exposed (the tech "from" side) last.
 */

import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { allSectors, type AIResilience, type SectorMeta } from "@shared/sectors";

const RESILIENCE_LABEL: Record<AIResilience, string> = {
  high: "AI-resilient",
  medium: "Mixed",
  low: "AI-exposed",
};

function groupByResilience(): Record<AIResilience, SectorMeta[]> {
  const groups: Record<AIResilience, SectorMeta[]> = { high: [], medium: [], low: [] };
  for (const m of allSectors()) groups[m.aiResilience].push(m);
  return groups;
}

export default function SectorsIndex() {
  useSEO("/sectors");
  useBreadcrumbs([{ name: "Sectors", url: "/sectors" }]);
  const groups = groupByResilience();
  const order: AIResilience[] = ["high", "medium", "low"];

  return (
    <AppShell bgClassName="bg-background">
      <main className="pb-20 max-w-6xl mx-auto px-6">
        <section className="py-12 space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">AI-Resilient Sectors</h1>
          <p className="text-lg text-muted-foreground max-w-3xl">
            Browse hiring, articles, and pivot guidance by sector. We use{" "}
            <strong>AI-resilient</strong>, not "AI-proof" — some roles in
            every sector are exposed to automation. Each sector page calls
            out which roles are durable and which aren't.
          </p>
        </section>

        {order.map((tier) => (
          <section key={tier} className="py-6 space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              {RESILIENCE_LABEL[tier]}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups[tier].map((m) => (
                <Link key={m.slug} to={`/sectors/${m.slug}`}>
                  <Card className="h-full hover:border-primary/50 transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{m.label}</CardTitle>
                        {m.contentOnly && (
                          <Badge variant="outline" className="text-xs">Education</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {m.tagline}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </AppShell>
  );
}
