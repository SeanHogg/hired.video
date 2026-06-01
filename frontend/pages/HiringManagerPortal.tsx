// eslint-page-chrome: skip - authed app surface - chrome via AppShell; no public SEO/breadcrumbs needed (pre-existing; #1869).
// HiringManagerPortal — public read-only kanban accessed via shareToken.
// Hiring managers / clients view candidate progression without an account;
// PII (email + phone) is redacted server-side.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Briefcase } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { initials } from "@/lib/utils/initials";
import {
  jobPipelineService,
  type PublicPipeline,
} from "@/lib/services/job-pipeline-service";

export default function HiringManagerPortal() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicPipeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    jobPipelineService
      .getPublicPipeline(token)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error)?.message ?? "Could not load pipeline");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading pipeline…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <h1 className="text-lg font-semibold mb-2">Link unavailable</h1>
            <p className="text-sm text-muted-foreground">
              {error ?? "This share link may have expired or been revoked. Ask the recruiting team for a fresh link."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const visibleStages = data.stages.filter((g) => g.stage !== "rejected" || g.count > 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Briefcase className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-lg font-bold">{data.job.title}</h1>
              {data.job.company && (
                <p className="text-xs text-muted-foreground">{data.job.company}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{data.label ?? "Read-only candidate pipeline"}</p>
            <p className="text-xs font-semibold">{data.total} candidates</p>
          </div>
        </div>
      </header>

      <main className="p-6">
        <div className="flex gap-3 overflow-x-auto pb-4">
          {visibleStages.map((g) => (
            <div key={g.stage} className="flex-shrink-0 w-[280px]">
              <div className="font-semibold text-sm mb-2">
                {g.label} <span className="text-muted-foreground">({g.count})</span>
              </div>
              <div className="space-y-2">
                {g.entries.map((e) => (
                  <div key={e.id} className="rounded-lg border bg-card p-3 flex items-start gap-2">
                    <Avatar className="w-9 h-9">
                      {e.candidateAvatarUrl && <AvatarImage src={e.candidateAvatarUrl} alt={e.candidateName} />}
                      <AvatarFallback className="text-xs">{initials(e.candidateName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{e.candidateName}</p>
                      {e.candidateLocation && (
                        <p className="text-xs text-muted-foreground truncate">{e.candidateLocation}</p>
                      )}
                      {e.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {e.tags.slice(0, 3).map((t) => (
                            <span key={t} className="text-[10px] uppercase bg-muted px-1.5 py-0.5 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {g.entries.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded">
                    Empty
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground mt-6 text-center">
          Read-only view · Contact details redacted · Powered by hired.video
        </p>
      </main>
    </div>
  );
}
