// TakeHomeInviteManager — recruiter surface for #1438.
//
// Self-gating: returns null unless the parent stage has a saved
// take-home assignment (rendering inline below TakeHomePromptEditor).
// Two affordances:
//   1. Mint a candidate magic-link invite for an applicationId.
//   2. List existing submissions with copy-link + "Review" CTA.
//
// "Review" hits POST /api/scorecards/take-home/start-review which
// lazy-creates a scorecard submission threaded to the take-home so the
// reviewer's scorecard fills end up linked back to the candidate work.

import { useEffect, useState } from "react";
import {
  Copy,
  ExternalLink,
  Send,
  CheckCircle2,
  Clock,
  FileText,
} from "lucide-react";
import { alertDialog } from "@/lib/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  scorecardsService,
  type StageKind,
  type TakeHomeSubmission,
  type ScorecardTemplate,
} from "@/lib/services/scorecards-service";

interface Props {
  stageId: string;
  stageKind: StageKind | undefined;
  companyId: string;
  /** Defaults to the stage's bound template, but the recruiter can override. */
  defaultTemplateId?: string | null;
}

function takeHomePublicUrl(token: string): string {
  if (typeof window === "undefined") return `/take-home/${token}`;
  return `${window.location.origin}/take-home/${token}`;
}

export function TakeHomeInviteManager({
  stageId,
  stageKind,
  companyId,
  defaultTemplateId,
}: Props) {
  const [submissions, setSubmissions] = useState<TakeHomeSubmission[]>([]);
  const [templates, setTemplates] = useState<ScorecardTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(
    defaultTemplateId ?? null,
  );
  const [applicationId, setApplicationId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (stageKind !== "take_home") return;
    let cancelled = false;
    (async () => {
      try {
        const [subs, tpls] = await Promise.all([
          scorecardsService.listTakeHomeSubmissions(stageId),
          scorecardsService.listTemplates(companyId),
        ]);
        if (!cancelled) {
          setSubmissions(subs);
          setTemplates(tpls);
          if (!templateId && tpls.length > 0) {
            setTemplateId(defaultTemplateId ?? tpls[0].id);
          }
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stageId, stageKind, companyId]);

  // Self-gate
  if (stageKind !== "take_home") return null;
  if (!loaded) return null;

  async function refresh() {
    setSubmissions(await scorecardsService.listTakeHomeSubmissions(stageId));
  }

  async function invite() {
    if (!applicationId.trim()) return;
    setInviting(true);
    try {
      await scorecardsService.createTakeHomeInvite(stageId, {
        applicationId: applicationId.trim(),
      });
      setApplicationId("");
      await refresh();
    } finally {
      setInviting(false);
    }
  }

  async function startReview(takeHomeSubmissionId: string) {
    if (!templateId) return;
    setReviewing(takeHomeSubmissionId);
    try {
      const { scorecardSubmissionId } = await scorecardsService.startTakeHomeReview({
        takeHomeSubmissionId,
        templateId,
      });
      await refresh();
      // Soft hand-off — give the reviewer a target id they can wire into the
      // scorecard form. The form opens on the existing scorecards surface
      // keyed by application; the link here is informative.
      if (typeof window !== "undefined") {
        await alertDialog({
          title: "Review ready",
          description: `Scorecard submission ${scorecardSubmissionId} ready to fill on the candidate's debrief page.`,
        });
      }
    } finally {
      setReviewing(null);
    }
  }

  return (
    <div className="rounded border border-dashed p-3 space-y-3">
      <Label className="text-xs flex items-center gap-1 text-muted-foreground">
        <Send className="h-3 w-3" /> Candidate invites + submissions
      </Label>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Application id"
          value={applicationId}
          onChange={(e) => setApplicationId(e.target.value)}
          className="flex-1 min-w-[160px] h-8"
        />
        <Button size="sm" onClick={invite} disabled={inviting || !applicationId.trim()}>
          <Send className="mr-1 h-4 w-4" />
          {inviting ? "Sending…" : "Mint invite"}
        </Button>
      </div>

      {templates.length > 0 && (
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Review scorecard</Label>
          <Select value={templateId ?? ""} onValueChange={(v) => setTemplateId(v)}>
            <SelectTrigger className="h-8 max-w-xs">
              <SelectValue placeholder="Pick template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {submissions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No invites yet.</p>
      ) : (
        <div className="space-y-1">
          {submissions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded border p-2 text-xs"
            >
              <code className="flex-1 truncate">{s.applicationId}</code>
              {s.submittedAt ? (
                <Badge variant="outline" className="border-green-500 text-green-700">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Submitted
                </Badge>
              ) : (
                <Badge variant="outline">
                  <Clock className="mr-1 h-3 w-3" /> Pending
                </Badge>
              )}
              {s.inviteToken && !s.submittedAt && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Copy invite link"
                    onClick={() =>
                      navigator.clipboard.writeText(takeHomePublicUrl(s.inviteToken!))
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Open invite"
                    onClick={() =>
                      window.open(takeHomePublicUrl(s.inviteToken!), "_blank")
                    }
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </>
              )}
              {s.submittedAt && !s.evaluatorScorecardSubmissionId && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!templateId || reviewing === s.id}
                  onClick={() => startReview(s.id)}
                >
                  <FileText className="mr-1 h-4 w-4" />
                  {reviewing === s.id ? "Linking…" : "Review"}
                </Button>
              )}
              {s.evaluatorScorecardSubmissionId && (
                <Badge variant="outline">Review linked</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
