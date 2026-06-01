// eslint-page-chrome: skip - authed app surface - chrome via AppShell; no public SEO/breadcrumbs needed (pre-existing; #1869).
/**
 * /network/warm-intros — find 1st/2nd-degree connections at a target
 * company who could introduce you (#1678). Authed surface.
 */
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSEO } from "@/lib/seo";
import { apiClient } from "@/lib/api-client";

interface FirstDegree { userId: string; name: string; title: string | null; company: string | null }
interface SecondDegree extends FirstDegree { connectorId: string; connectorName: string }
interface WarmIntroResult { company: string; firstDegree: FirstDegree[]; secondDegree: SecondDegree[] }

export default function WarmIntros(): JSX.Element {
  const location = useLocation();
  useSEO(location.pathname, {
    title: "Warm Intros · hired.video",
    description: "Find connections at a target company who can introduce you.",
  });

  const [company, setCompany] = useState("");
  const [result, setResult] = useState<WarmIntroResult | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!company.trim()) return;
    setLoading(true);
    try {
      const res = await apiClient.get<WarmIntroResult>(
        `/api/network/warm-intros?company=${encodeURIComponent(company.trim())}`,
        undefined,
        { suppressErrorEvent: true },
      );
      setResult(res.data ?? { company, firstDegree: [], secondDegree: [] });
    } catch {
      setResult({ company, firstDegree: [], secondDegree: [] });
    } finally {
      setLoading(false);
    }
  };

  const empty = result && result.firstDegree.length === 0 && result.secondDegree.length === 0;

  return (
    <AppShell bgClassName="bg-background">
      <div className="px-4 py-12 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Warm intros</h1>
        <p className="text-muted-foreground mb-6">
          Most senior roles fill through network, not cold applications. Enter a target company to
          see who in your network could introduce you.
        </p>
        <div className="flex gap-2 mb-8">
          <Input
            placeholder="Company name…"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <Button onClick={search} disabled={loading || !company.trim()}>
            {loading ? "…" : "Find"}
          </Button>
        </div>

        {result && (
          <div className="space-y-8">
            {empty ? (
              <p className="text-muted-foreground">
                No connections found at "{result.company}". As your network grows, more paths open up.
              </p>
            ) : null}

            {result.firstDegree.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-3">Direct connections there</h2>
                <div className="space-y-2">
                  {result.firstDegree.map((p) => (
                    <Card key={p.userId}><CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{p.name}{p.title ? `, ${p.title}` : ""}</p>
                        <p className="text-sm text-muted-foreground">{p.company}</p>
                      </div>
                      <Badge>1st degree</Badge>
                    </CardContent></Card>
                  ))}
                </div>
              </div>
            )}

            {result.secondDegree.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-3">People you can be introduced to</h2>
                <div className="space-y-2">
                  {result.secondDegree.map((p) => (
                    <Card key={p.userId}><CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{p.name}{p.title ? `, ${p.title}` : ""}</p>
                          <p className="text-sm text-muted-foreground">{p.company}</p>
                        </div>
                        <Badge variant="secondary">2nd degree</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Ask <span className="font-medium text-foreground">{p.connectorName}</span> for an intro.
                      </p>
                    </CardContent></Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
