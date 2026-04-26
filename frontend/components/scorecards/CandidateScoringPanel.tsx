// CandidateScoringPanel — embeddable scoring widget. Drops onto any
// recruiter surface that has a candidate context (CandidateDetail,
// AsyncInterviewManager review pane, pipeline kanban detail).
//
// Shows three things:
//   • Existing submitted scorecards for this application (read-only list).
//   • Aggregate debrief (avg score + recommendation breakdown).
//   • A "Score this candidate" button that opens the submission form
//     against a chosen template.

import { useEffect, useState } from "react";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  scorecardsService,
  type ScorecardSubmission,
  type ScorecardTemplate,
} from "@/lib/services/scorecards-service";
import { ScorecardSubmissionForm } from "./ScorecardSubmissionForm";
import { DebriefView } from "./DebriefView";

interface Props {
  companyId: string;
  applicationId: string;
  candidateUserId?: string;
  jobId?: string;
  /** Optional binding to a scheduled interview if scoring from that flow. */
  interviewId?: string;
  kitStageId?: string;
}

export function CandidateScoringPanel({
  companyId,
  applicationId,
  candidateUserId,
  jobId,
  interviewId,
  kitStageId,
}: Props) {
  const [submissions, setSubmissions] = useState<ScorecardSubmission[]>([]);
  const [templates, setTemplates] = useState<ScorecardTemplate[]>([]);
  const [pickedTemplateId, setPickedTemplateId] = useState<string>("");
  const [scoring, setScoring] = useState(false);
  const [showDebrief, setShowDebrief] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, t] = await Promise.all([
        scorecardsService.listSubmissions({ applicationId }),
        scorecardsService.listTemplates(companyId),
      ]);
      if (!cancelled) {
        setSubmissions(s);
        setTemplates(t);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applicationId, companyId, refreshKey]);

  if (scoring && pickedTemplateId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Score this candidate</CardTitle>
        </CardHeader>
        <CardContent>
          <ScorecardSubmissionForm
            templateId={pickedTemplateId}
            applicationId={applicationId}
            candidateUserId={candidateUserId}
            interviewId={interviewId}
            kitStageId={kitStageId}
            onSubmitted={() => {
              setScoring(false);
              setPickedTemplateId("");
              setRefreshKey((k) => k + 1);
            }}
          />
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" onClick={() => setScoring(false)}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const submitted = submissions.filter((s) => s.status === "submitted");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Scoring & debrief</CardTitle>
        <div className="flex items-center gap-2">
          {templates.length > 0 ? (
            <>
              <Select value={pickedTemplateId} onValueChange={setPickedTemplateId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Pick template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!pickedTemplateId}
                onClick={() => setScoring(true)}
              >
                <Plus className="mr-1 h-4 w-4" /> Score
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" asChild>
              <a href="/services/scorecards">Create a template first</a>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {submitted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No scorecards submitted yet for this candidate.
          </p>
        ) : (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Submitted scorecards ({submitted.length})</Label>
            {submitted.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded border p-2 text-sm"
              >
                <span>
                  {s.overallRecommendation && (
                    <Badge className="mr-2" variant="secondary">
                      {s.overallRecommendation.replace("_", " ")}
                    </Badge>
                  )}
                  {s.summary?.slice(0, 90) ?? "(no summary)"}
                </span>
                {s.overallScore !== null && s.overallScore !== undefined && (
                  <span className="text-muted-foreground">{s.overallScore}/100</span>
                )}
              </div>
            ))}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDebrief((v) => !v)}
          className="w-full justify-between"
        >
          {showDebrief ? "Hide debrief" : "Show aggregate debrief"}
          {showDebrief ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        {showDebrief && (
          <DebriefView
            companyId={companyId}
            applicationId={applicationId}
            jobId={jobId}
            candidateUserId={candidateUserId}
          />
        )}
      </CardContent>
    </Card>
  );
}
