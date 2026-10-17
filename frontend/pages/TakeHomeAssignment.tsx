/**
 * #1386 — Public take-home assignment landing page (candidate-facing
 * magic-link delivery). Mirrors LiveScreenInvite — fetches the invite
 * by token, surfaces the assignment prompt, accepts the submission.
 *
 * URL: `/take-home/:token`
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";

interface InviteResponse {
  invite: {
    id: string;
    stageId: string;
    candidateEmail: string;
    candidateName: string | null;
    status: "pending" | "started" | "submitted" | "expired";
    expiresAt: string;
  };
  assignment?: {
    title?: string;
    prompt?: string;
    timeLimitMinutes?: number;
  };
}

export default function TakeHomeAssignment() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<InviteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiClient
      .fetchData<InviteResponse | null>(`/api/take-home-invites/by-token/${encodeURIComponent(token)}`)
      .then((payload) => {
        if (cancelled) return;
        setData(payload ?? null);
        // Auto-mark started on first view so the recruiter knows the candidate opened it.
        apiClient
          .post(`/api/take-home-invites/by-token/${encodeURIComponent(token)}/start`, {})
          .catch(() => undefined);
      })
      .catch((err) => {
        if (!cancelled) setErrorMsg(err instanceof Error ? err.message : "Invite not found");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [token]);

  const submit = async () => {
    if (!token || !body.trim()) return;
    setSubmitting(true);
    try {
      await apiClient.post(`/api/take-home-invites/by-token/${encodeURIComponent(token)}/submit`, {
        body: body.trim(),
      });
      setSubmitted(true);
      toast.success("Submitted — thanks!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (errorMsg || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <XCircle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold mt-3">Invite not found</h1>
          <p className="text-sm text-muted-foreground mt-2">{errorMsg ?? "This invite link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }
  if (submitted || data.invite.status === "submitted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
          <h1 className="text-xl font-semibold mt-3">Submitted</h1>
          <p className="text-sm text-muted-foreground mt-2">The hiring team will review and reach out.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-2xl w-full rounded-xl border shadow-sm bg-card p-6 space-y-5">
        <header>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Take-home assignment</p>
          <h1 className="text-2xl font-semibold mt-1">
            {data.assignment?.title ?? "Your take-home"}
          </h1>
          {data.assignment?.timeLimitMinutes && (
            <p className="text-xs text-muted-foreground mt-1">
              Suggested time: {data.assignment.timeLimitMinutes} min
            </p>
          )}
        </header>

        {data.assignment?.prompt && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-line">
            {data.assignment.prompt}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="body" className="text-sm font-medium">Your response</label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder="Paste your write-up, code, or link to a hosted artifact (Gist, repo, doc)…"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={submit} disabled={submitting || !body.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
