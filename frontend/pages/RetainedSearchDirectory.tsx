// eslint-page-chrome: skip - authed app surface - chrome via AppShell; no public SEO/breadcrumbs needed (pre-existing; #1869).
/**
 * /retained-search — public directory of retained executive-search firms
 * (#1675). Senior-exec audience surface: browse retained firms (distinct
 * from contingent recruiters), filter by tier, link out to engage.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "lucide-react";
import { useSEO } from "@/lib/seo";
import MarketingFAQ from "@/components/MarketingFAQ";
import {
  retainedSearchService,
  type RetainedSearchFirm,
} from "@/lib/services/retained-search-service";

const TIER_LABEL: Record<string, string> = {
  global: "Global firms",
  boutique: "Boutique / specialist",
  regional: "Regional",
};
const TIER_ORDER = ["global", "boutique", "regional"];

export default function RetainedSearchDirectory(): JSX.Element {
  const location = useLocation();
  const [firms, setFirms] = useState<RetainedSearchFirm[] | null>(null);

  useSEO(location.pathname, {
    title: "Retained Executive Search Firm Directory · hired.video",
    description:
      "Browse leading retained executive-search firms for C-suite and board roles — global firms and specialist boutiques. Built for senior executives.",
    ogTitle: "Retained Executive Search Directory",
    ogDescription:
      "The retained search firms that place C-suite and board leaders, by tier and specialty.",
  });

  useEffect(() => {
    let cancelled = false;
    void retainedSearchService.listFirms().then((rows) => {
      if (!cancelled) setFirms(rows);
    });
    return () => { cancelled = true; };
  }, []);

  const byTier = useMemo(() => {
    const groups: Record<string, RetainedSearchFirm[]> = {};
    for (const f of firms ?? []) {
      (groups[f.tier] ??= []).push(f);
    }
    return groups;
  }, [firms]);

  return (
    <AppShell bgClassName="bg-background">
      <section className="px-4 py-16 text-center sm:px-6 lg:px-8 bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <div className="max-w-3xl mx-auto">
          <Badge variant="outline" className="mb-4">For senior executives</Badge>
          <h1 className="mb-4 text-4xl font-bold sm:text-5xl">Retained search firms</h1>
          <p className="text-xl text-muted-foreground">
            Retained search — paid upfront, exclusive engagement — is how C-suite and board roles get
            filled. Distinct from contingent recruiters. Here are the firms that run those mandates.
          </p>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-12">
        {firms === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
          </div>
        ) : firms.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Directory is being curated. Check back soon.</p>
        ) : (
          TIER_ORDER.filter((t) => byTier[t]?.length).map((tier) => (
            <div key={tier}>
              <h2 className="mb-6 text-2xl font-bold">{TIER_LABEL[tier] ?? tier}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {byTier[tier].map((f) => (
                  <Card key={f.id} className="h-full">
                    <CardContent className="flex h-full flex-col gap-3 p-5">
                      <h3 className="text-lg font-semibold">{f.name}</h3>
                      {f.description ? (
                        <p className="flex-1 text-sm text-muted-foreground line-clamp-4">{f.description}</p>
                      ) : <div className="flex-1" />}
                      {f.specialties && f.specialties.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {f.specialties.slice(0, 4).map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs">{s.replace(/-/g, " ")}</Badge>
                          ))}
                        </div>
                      ) : null}
                      {f.website ? (
                        <Button asChild variant="ghost" size="sm" className="self-start px-0">
                          <a href={f.website} target="_blank" rel="noopener noreferrer nofollow">
                            Visit firm
                            <ExternalLink className="ml-1 h-3.5 w-3.5" />
                          </a>
                        </Button>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <MarketingFAQ
        schemaId="retained-search-faq"
        items={[
          { question: "What's the difference between retained and contingent search?", answer: "Retained firms are paid an upfront fee for an exclusive mandate — they work the search to completion. Contingent recruiters are only paid on placement and often work the same role in parallel. C-suite and board roles almost always go through retained firms." },
          { question: "Does hired.video place me with these firms?", answer: "This is a reference directory — we link you to each firm to engage directly. We don't take a cut of retained placements; the directory exists so senior execs can find the right firm fast." },
          { question: "How do firms get listed?", answer: "The directory is editorially curated, starting with the most established global firms and specialist boutiques. Firms are added over time; it isn't pay-to-list." },
        ]}
      />
    </AppShell>
  );
}
