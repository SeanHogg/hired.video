/**
 * #412 — Public job embed renderer. Mirrors the resume-embed page so
 * `JobActionsMenu`'s Embed entry can point at `/jobs/embed/:id` and
 * iframe-friendly hosts can embed the job card without auth.
 *
 * URL: `/jobs/embed/:id`
 *
 * Reads `/api/jobs/:id` directly (the route already returns the public-
 * facing shape for owner-published jobs). Renders the job card via the
 * shared `JobCard` component for visual parity with the main listing.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";

interface PublicJob {
  id: string;
  title: string;
  companyName: string | null;
  location: string | null;
  description: string;
  applyUrl: string | null;
  heroImageUrl: string | null;
  videoProjectId: string | null;
  postedAt: string | null;
}

export default function JobEmbed() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    apiClient
      .get(`/api/jobs/${encodeURIComponent(id)}`)
      .then((res) => {
        if (cancelled) return;
        const body = (res as any).data?.data ?? (res as any).data ?? null;
        setJob(body as PublicJob);
      })
      .catch((err) => {
        if (!cancelled) setErrorMsg(err instanceof Error ? err.message : "Job not found");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[200px] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (errorMsg || !job) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {errorMsg ?? "This job is no longer available."}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto rounded-xl border bg-card shadow-sm overflow-hidden">
        {job.heroImageUrl && (
          <img
            src={job.heroImageUrl}
            alt=""
            className="w-full h-48 object-cover"
            loading="lazy"
          />
        )}
        <div className="p-5 space-y-3">
          <header>
            <h1 className="text-xl font-semibold">{job.title}</h1>
            {(job.companyName || job.location) && (
              <p className="text-sm text-muted-foreground mt-1">
                {[job.companyName, job.location].filter(Boolean).join(" · ")}
              </p>
            )}
          </header>
          <p className="text-sm whitespace-pre-line">{job.description}</p>
          {job.applyUrl && (
            <a
              href={job.applyUrl}
              target="_top"
              rel="noopener noreferrer"
              className="inline-block rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              Apply now
            </a>
          )}
        </div>
      </div>
      <div className="text-center text-xs text-muted-foreground mt-3">
        Embedded from{" "}
        <a
          href={`/jobs/${job.id}`}
          target="_top"
          rel="noopener noreferrer"
          className="underline"
        >
          hired.video
        </a>
      </div>
    </div>
  );
}
