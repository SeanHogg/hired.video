// CandidateScreening — candidate-facing magic-link screening portal mounted at
// /screening/:token. Token is the bearer of authorization (the route is
// optional-auth), so this works for anonymous candidates; a signed-in candidate
// is "claimed" on load so items they already have on file (résumé, completed
// assessments, references) are pulled in automatically (pull-don't-ask).
//
// Inline completion is implemented for the two always-present item types —
// contact confirmation and application questions (work auth / sponsorship / EEO
// / custom). Items completed in other flows (assessments, competency tests,
// résumé) are detected on "Refresh status" via the claim re-resolve. Richer
// per-item launchers (video interview, competency launcher, references intake,
// tool-run, inline résumé upload) + the recruiter results dashboard are tracked
// in the Consolidated Gap Register.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Circle, Clock, ExternalLink, Loader2 } from "lucide-react";
import { useSEO } from "@/lib/seo";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  screeningService,
  type PortalView,
  type PortalItem,
} from "@/lib/services/screening-service";

/** Item types whose completion happens in another flow — we deep-link there and
 *  detect completion on refresh rather than capturing it inline. */
const DEEP_LINK: Partial<Record<PortalItem["itemType"], { href: string; cta: string }>> = {
  resume: { href: "/resumes", cta: "Open résumé builder" },
  predictive_assessment: { href: "/tools/predictive-assessments", cta: "Take the assessment" },
};

function StatusIcon({ status }: { status: PortalItem["status"] }) {
  if (status === "satisfied") return <CheckCircle2 className="h-5 w-5 text-green-600" />;
  if (status === "skipped") return <Circle className="h-5 w-5 text-muted-foreground" />;
  return <Circle className="h-5 w-5 text-muted-foreground" />;
}

export default function CandidateScreening() {
  useSEO("/screening");
  const { token = "" } = useParams();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<PortalView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Signed-in candidates get claimed (binds identity + pull-don't-ask);
      // anonymous candidates just read the portal.
      const next = isAuthenticated
        ? await screeningService.claimPortal(token)
        : await screeningService.getPortal(token);
      setView(next);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [token, isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const requiredOutstanding = useMemo(
    () => (view?.items ?? []).filter((i) => i.isRequired && i.status === "outstanding").length,
    [view],
  );

  async function satisfy(itemId: string, resultRef?: Record<string, unknown>) {
    setBusyItemId(itemId);
    try {
      const next = await screeningService.satisfyItem(token, itemId, resultRef);
      setView(next);
    } catch {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    } finally {
      setBusyItemId(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !view) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Link unavailable</CardTitle>
            <CardDescription>
              This screening link is invalid or has expired. Please ask the recruiter to resend it.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isExpired = view.status === "expired";
  const isComplete = view.status === "completed";

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Complete your application screening</h1>
          <p className="text-muted-foreground">
            {view.candidateName ? `Hi ${view.candidateName}, ` : ""}
            finish the steps below to move your application forward. We only ask for what we don't
            already have on file.
          </p>
          {view.message ? (
            <p className="rounded-md bg-background border p-3 text-sm">{view.message}</p>
          ) : null}
        </header>

        {isExpired ? (
          <Card>
            <CardHeader>
              <CardTitle>This screening has expired</CardTitle>
              <CardDescription>Ask the recruiter to resend the link to continue.</CardDescription>
            </CardHeader>
          </Card>
        ) : isComplete ? (
          <Card className="border-green-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" /> All set — screening complete
              </CardTitle>
              <CardDescription>
                Thanks! Your responses have been shared with the hiring team.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {requiredOutstanding === 0
                  ? "All required steps done — you can submit."
                  : `${requiredOutstanding} required step${requiredOutstanding === 1 ? "" : "s"} remaining`}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void load()}>
                Refresh status
              </Button>
            </div>

            <div className="space-y-4">
              {view.items.map((item) => (
                <ScreeningItemCard
                  key={item.id}
                  item={item}
                  busy={busyItemId === item.id}
                  candidateEmail={view.candidateEmail}
                  onSatisfy={(ref) => satisfy(item.id, ref)}
                />
              ))}
            </div>
          </>
        )}

        {!isAuthenticated && !isExpired && !isComplete ? (
          <p className="text-center text-xs text-muted-foreground">
            Have an account?{" "}
            <Link
              to={`/login?redirect=${encodeURIComponent(`/screening/${token}`)}`}
              className="text-primary underline"
            >
              Sign in
            </Link>{" "}
            to auto-fill steps you've already completed.
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ── Per-item card ─────────────────────────────────────────────────────────────

interface ApplicationQuestion {
  id: string;
  prompt: string;
  kind: string;
  answerType: "text" | "boolean" | "single_select" | "multi_select";
  options?: string[];
  required?: boolean;
}

function ScreeningItemCard({
  item,
  busy,
  candidateEmail,
  onSatisfy,
}: {
  item: PortalItem;
  busy: boolean;
  candidateEmail: string;
  onSatisfy: (resultRef?: Record<string, unknown>) => void;
}) {
  const satisfied = item.status === "satisfied";
  const deepLink = DEEP_LINK[item.itemType];

  return (
    <Card className={satisfied ? "border-green-200" : undefined}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <StatusIcon status={item.status} />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              {item.title}
              {item.isRequired ? (
                <span className="text-xs font-normal text-red-600">Required</span>
              ) : (
                <span className="text-xs font-normal text-muted-foreground">Optional</span>
              )}
            </CardTitle>
            <CardDescription>{item.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      {!satisfied ? (
        <CardContent>
          {item.itemType === "contact_info" ? (
            <ContactConfirm defaultEmail={candidateEmail} busy={busy} onSubmit={onSatisfy} />
          ) : item.itemType === "application_questions" ? (
            <ApplicationQuestions item={item} busy={busy} onSubmit={onSatisfy} />
          ) : deepLink ? (
            <div className="flex items-center gap-3">
              <Button asChild variant="outline" size="sm">
                <Link to={deepLink.href} target="_blank" rel="noreferrer">
                  {deepLink.cta} <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                Complete it, then tap “Refresh status”.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Your recruiter will share how to complete this step.
            </div>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

function ContactConfirm({
  defaultEmail,
  busy,
  onSubmit,
}: {
  defaultEmail: string;
  busy: boolean;
  onSubmit: (resultRef: Record<string, unknown>) => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState("");
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="sc-email">Email</Label>
        <Input id="sc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sc-phone">Phone</Label>
        <Input id="sc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <Button
        size="sm"
        disabled={busy || !email}
        onClick={() => onSubmit({ email, phone, confirmedAt: new Date().toISOString() })}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm contact details"}
      </Button>
    </div>
  );
}

function ApplicationQuestions({
  item,
  busy,
  onSubmit,
}: {
  item: PortalItem;
  busy: boolean;
  onSubmit: (resultRef: Record<string, unknown>) => void;
}) {
  const questions = (item.config?.questions as ApplicationQuestion[] | undefined) ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const allRequiredAnswered = questions
    .filter((q) => q.required !== false)
    .every((q) => (answers[q.id] ?? "").trim().length > 0);

  return (
    <div className="space-y-4">
      {questions.map((q) => (
        <div key={q.id} className="space-y-1.5">
          <Label htmlFor={`q-${q.id}`}>
            {q.prompt}
            {q.required !== false ? <span className="text-red-600"> *</span> : null}
          </Label>
          {q.answerType === "boolean" ? (
            <div className="flex gap-2">
              {["Yes", "No"].map((opt) => (
                <Button
                  key={opt}
                  type="button"
                  size="sm"
                  variant={answers[q.id] === opt ? "default" : "outline"}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                >
                  {opt}
                </Button>
              ))}
            </div>
          ) : q.answerType === "single_select" && q.options ? (
            <div className="flex flex-wrap gap-2">
              {q.options.map((opt) => (
                <Button
                  key={opt}
                  type="button"
                  size="sm"
                  variant={answers[q.id] === opt ? "default" : "outline"}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                >
                  {opt}
                </Button>
              ))}
            </div>
          ) : (
            <Textarea
              id={`q-${q.id}`}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <Button
        size="sm"
        disabled={busy || !allRequiredAnswered}
        onClick={() => onSubmit({ answers })}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit answers"}
      </Button>
    </div>
  );
}
