// TakeHomeDeliveryPage — candidate-facing magic-link surface for #1438.
//
// Mounted at `/take-home/:token`. Resolves the invite via the public
// route, renders the prompt + a delivery form whose shape switches on
// the assignment's `deliveryFormat`, and POSTs the candidate's
// submission back through the same magic-link endpoint.
//
// Three states are surfaced inline:
//   • expired   — token has elapsed and no delivery was recorded
//   • submitted — candidate already submitted (idempotent landing)
//   • open      — render the delivery form

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Github,
  Link as LinkIcon,
  Send,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  scorecardsService,
  type TakeHomeInviteView,
} from "@/lib/services/scorecards-service";

const FORMAT_META: Record<
  TakeHomeInviteView["assignment"]["deliveryFormat"],
  { label: string; icon: typeof Github; hint: string }
> = {
  github_url: {
    label: "GitHub URL",
    icon: Github,
    hint: "Paste the repository or PR URL containing your work.",
  },
  doc_link: {
    label: "Shared document link",
    icon: LinkIcon,
    hint: "Paste a public or sharable URL to your document.",
  },
  code_paste: {
    label: "Code paste",
    icon: FileText,
    hint: "Paste your solution directly. Markdown is fine.",
  },
  file_upload: {
    label: "File upload",
    icon: FileText,
    hint: "Drop in your files (PDF, ZIP, etc.).",
  },
};

export default function TakeHomeDeliveryPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<TakeHomeInviteView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [textResponse, setTextResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const v = await scorecardsService.getTakeHomeInvite(token);
        if (!cancelled) setView(v);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Invite not found");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit() {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await scorecardsService.submitTakeHomeByToken(token, {
        deliveryUrl: deliveryUrl.trim() || undefined,
        textResponse: textResponse.trim() || undefined,
      });
      setView((prev) => (prev ? { ...prev, submission: updated, alreadySubmitted: true } : prev));
    } catch (e: any) {
      setError(e?.message ?? "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-4 sm:px-6 lg:px-8 pb-12">
        <div className="max-w-2xl mx-auto pt-8 space-y-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading invite…</p>
          ) : error || !view ? (
            <Card>
              <CardContent className="py-10 text-center space-y-2">
                <AlertTriangle className="h-8 w-8 mx-auto text-amber-500" />
                <p className="text-sm">{error ?? "We couldn't find this invite."}</p>
              </CardContent>
            </Card>
          ) : view.expired ? (
            <Card>
              <CardContent className="py-10 text-center space-y-2">
                <Clock className="h-8 w-8 mx-auto text-amber-500" />
                <p className="text-sm">
                  This invite has expired. Reach out to your recruiter for a new
                  link.
                </p>
              </CardContent>
            </Card>
          ) : view.alreadySubmitted ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" /> Already
                  submitted
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Your delivery was recorded
                  {view.submission.submittedAt &&
                    ` on ${new Date(view.submission.submittedAt).toLocaleString()}`}
                  . The team will be in touch.
                </p>
              </CardContent>
            </Card>
          ) : (
            <DeliveryForm
              view={view}
              deliveryUrl={deliveryUrl}
              setDeliveryUrl={setDeliveryUrl}
              textResponse={textResponse}
              setTextResponse={setTextResponse}
              error={error}
              submitting={submitting}
              onSubmit={submit}
            />
          )}
        </div>
      </main>
    </AppShell>
  );
}

function DeliveryForm({
  view,
  deliveryUrl,
  setDeliveryUrl,
  textResponse,
  setTextResponse,
  error,
  submitting,
  onSubmit,
}: {
  view: TakeHomeInviteView;
  deliveryUrl: string;
  setDeliveryUrl: (v: string) => void;
  textResponse: string;
  setTextResponse: (v: string) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const fmt = FORMAT_META[view.assignment.deliveryFormat];
  const Icon = fmt.icon;
  const needsUrl =
    view.assignment.deliveryFormat === "github_url" ||
    view.assignment.deliveryFormat === "doc_link";
  const needsText = view.assignment.deliveryFormat === "code_paste";
  const filesOnly = view.assignment.deliveryFormat === "file_upload";
  const dueAt =
    view.submission.tokenExpiresAt &&
    new Date(view.submission.tokenExpiresAt);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{view.stage.name}</CardTitle>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">
              <Icon className="mr-1 h-3 w-3" /> {fmt.label}
            </Badge>
            {dueAt && (
              <Badge variant="outline">
                <Clock className="mr-1 h-3 w-3" /> Due{" "}
                {dueAt.toLocaleString()}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap">
            {view.assignment.prompt}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your delivery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {needsUrl && (
            <div>
              <Label>{fmt.label}</Label>
              <Input
                type="url"
                placeholder="https://…"
                value={deliveryUrl}
                onChange={(e) => setDeliveryUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">{fmt.hint}</p>
            </div>
          )}
          {needsText && (
            <div>
              <Label>Your solution</Label>
              <Textarea
                rows={12}
                placeholder="Paste your code or written response here."
                value={textResponse}
                onChange={(e) => setTextResponse(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">{fmt.hint}</p>
            </div>
          )}
          {filesOnly && (
            <Alert>
              <AlertDescription>
                File-upload delivery isn't supported in this build — please
                paste a shared link in the URL field below or contact your
                recruiter.
              </AlertDescription>
            </Alert>
          )}
          {filesOnly && (
            <div>
              <Label>Shared link</Label>
              <Input
                type="url"
                placeholder="https://drive.google.com/…"
                value={deliveryUrl}
                onChange={(e) => setDeliveryUrl(e.target.value)}
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button
              onClick={onSubmit}
              disabled={
                submitting ||
                (needsUrl && !deliveryUrl.trim()) ||
                (needsText && !textResponse.trim()) ||
                (filesOnly && !deliveryUrl.trim())
              }
            >
              <Send className="mr-2 h-4 w-4" />
              {submitting ? "Submitting…" : "Submit delivery"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
