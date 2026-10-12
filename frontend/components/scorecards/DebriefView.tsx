// DebriefView — aggregate roll-up across all submitted scorecards for an
// application. Recommendation breakdown, average score, per-attribute
// averages, and the option to record a final hiring decision.

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Clock, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  scorecardsService,
  type DebriefAggregate,
  type Decision,
  type HiringDecisionRecord,
  type Recommendation,
} from "@/lib/services/scorecards-service";

interface Props {
  companyId: string;
  applicationId: string;
  jobId?: string;
  candidateUserId?: string;
}

const REC_LABELS: Record<Recommendation, string> = {
  strong_yes: "Strong yes",
  yes: "Yes",
  no: "No",
  strong_no: "Strong no",
};

const REC_COLOR: Record<Recommendation, string> = {
  strong_yes: "bg-green-600",
  yes: "bg-green-400",
  no: "bg-red-400",
  strong_no: "bg-red-600",
};

const DECISION_META: Record<Decision, { label: string; icon: typeof CheckCircle2; className: string }> = {
  approve: { label: "Approve", icon: CheckCircle2, className: "bg-green-600 text-white" },
  reject: { label: "Reject", icon: XCircle, className: "bg-red-600 text-white" },
  hold: { label: "Hold", icon: Clock, className: "bg-amber-500 text-white" },
  withdraw: { label: "Withdraw", icon: Ban, className: "bg-muted-foreground text-white" },
};

export function DebriefView({ companyId, applicationId, jobId, candidateUserId }: Props) {
  const [debrief, setDebrief] = useState<DebriefAggregate | null>(null);
  const [decisions, setDecisions] = useState<HiringDecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [d, dec] = await Promise.all([
        scorecardsService.getDebrief(applicationId),
        scorecardsService.listDecisions(applicationId),
      ]);
      setDebrief(d);
      setDecisions(dec);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [applicationId]);

  async function record(decision: Decision) {
    setError(null);
    setRecording(true);
    try {
      await scorecardsService.createDecision({
        companyId,
        applicationId,
        jobId,
        candidateUserId,
        decision,
        reason: reason.trim() || undefined,
      });
      setReason("");
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed to record decision");
    } finally {
      setRecording(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading debrief…</p>;
  if (!debrief) return null;

  const totalRecommendations = Object.values(debrief.recommendations).reduce(
    (a: number, b: number | undefined) => a + (b ?? 0),
    0,
  );
  const latestDecision = decisions[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Aggregate debrief</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {debrief.submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No submitted scorecards yet for this application.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Stat label="Submissions" value={String(debrief.submissions.length)} />
                <Stat
                  label="Average score"
                  value={debrief.avgScore !== null ? `${debrief.avgScore} / 100` : "—"}
                />
                <Stat label="Recommendations" value={String(totalRecommendations)} />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Recommendation breakdown</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(Object.keys(REC_LABELS) as Recommendation[]).map((r) => {
                    const count = debrief.recommendations[r] ?? 0;
                    if (count === 0) return null;
                    return (
                      <Badge key={r} className={`${REC_COLOR[r]} text-white`}>
                        {REC_LABELS[r]} · {count}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              {debrief.attributes.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Per-attribute averages</Label>
                  <div className="space-y-1 mt-1">
                    {debrief.attributes.map((a) => (
                      <div key={a.attributeId} className="flex items-center justify-between text-sm">
                        <span>{a.name}</span>
                        <span className="text-muted-foreground">
                          {a.avg !== null ? `${a.avg.toFixed(1)} (${a.samples} ratings)` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hiring decision</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {latestDecision && (
            <div className="rounded border p-3 space-y-1">
              <div className="flex items-center gap-2">
                {(() => {
                  const meta = DECISION_META[latestDecision.decision];
                  const I = meta.icon;
                  return (
                    <Badge className={meta.className}>
                      <I className="mr-1 h-3 w-3" /> {meta.label}
                    </Badge>
                  );
                })()}
                <span className="text-xs text-muted-foreground">
                  {new Date(latestDecision.decidedAt).toLocaleString()}
                </span>
              </div>
              {latestDecision.reason && (
                <p className="text-sm">{latestDecision.reason}</p>
              )}
            </div>
          )}

          <div>
            <Label>Reason / notes</Label>
            <Textarea
              rows={2}
              placeholder="Why this decision?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap gap-2">
            {(Object.keys(DECISION_META) as Decision[]).map((d) => {
              const meta = DECISION_META[d];
              const I = meta.icon;
              return (
                <Button
                  key={d}
                  variant="outline"
                  onClick={() => record(d)}
                  disabled={recording}
                >
                  <I className="mr-2 h-4 w-4" />
                  Record {meta.label.toLowerCase()}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
