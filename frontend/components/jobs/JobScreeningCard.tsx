/**
 * JobScreeningCard — owner-facing UI on /jobs/edit/:id to attach (or
 * detach) a reusable interview question set as a screening interview on
 * the job. When attached + requirement is 'required' the apply flow blocks
 * the candidate from submitting without entering the screening; when
 * 'optional' the candidate is invited but can defer.
 *
 * Self-contained — the card decides its own visibility based on the
 * passed job (owner check happens at the route layer; we only mount this
 * inside an owner-only page) and self-fetches the current screening config.
 *
 * The reusable question-set library is the SoT for sets — the card just
 * picks one. To author a new set, the user goes to /tools/interview-templates.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Sparkles, Video } from "lucide-react";
import { toast } from "sonner";
import {
  getJobScreening,
  listQuestionSets,
  setJobScreening,
  type InterviewQuestionSet,
  type JobScreeningConfig,
  type ScreeningRequirement,
} from "@/lib/services/interview-question-sets-service";

interface JobScreeningCardProps {
  jobId: string;
  /** Optional job title — used to render a friendlier "Attach screening to
   *  Senior Backend Engineer" label. */
  jobTitle?: string;
}

export function JobScreeningCard({ jobId, jobTitle }: JobScreeningCardProps) {
  const [config, setConfig] = useState<JobScreeningConfig | null>(null);
  const [sets, setSets] = useState<InterviewQuestionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState<string>("");
  const [requirement, setRequirement] = useState<ScreeningRequirement>("none");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getJobScreening(jobId).catch(() => null), listQuestionSets().catch(() => [])])
      .then(([screeningData, setsData]) => {
        if (cancelled) return;
        setConfig(screeningData);
        setSets(setsData);
        if (screeningData) {
          setSelectedSetId(screeningData.questionSetId ?? "");
          setRequirement(screeningData.screeningRequired);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function handleSave() {
    setSaving(true);
    try {
      // Coerce "none" → null question set to keep the route happy.
      const questionSetId = requirement === "none" ? null : selectedSetId || null;
      if (requirement !== "none" && !questionSetId) {
        toast.error("Pick a question set before marking screening optional/required");
        setSaving(false);
        return;
      }
      const next = await setJobScreening(jobId, {
        questionSetId,
        screeningRequired: requirement,
      });
      setConfig(next);
      toast.success(
        requirement === "none"
          ? "Screening detached from this job"
          : "Screening saved — applicants will be routed automatically",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const dirty =
    requirement !== (config?.screeningRequired ?? "none") ||
    (selectedSetId || null) !== (config?.questionSetId ?? null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="h-5 w-5 text-brand-purple" />
          Video screening{jobTitle ? ` for ${jobTitle}` : ""}
        </CardTitle>
        <CardDescription>
          Attach a reusable question set to this job. Applicants are routed into the screening
          interview the moment they hit Apply — text or video, with proctoring and AI scoring.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sets.length === 0 && (
          <Alert>
            <AlertDescription className="text-sm">
              You don't have any question sets yet. Build one from the{" "}
              <Link to="/tools/interview-templates" className="underline font-medium">
                Interview Templates tool
              </Link>{" "}
              or quickly generate one in the{" "}
              <Link to="/tools/interview-questions" className="underline font-medium">
                Interview Questions tool
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label>Requirement</Label>
          <Select value={requirement} onValueChange={(v) => setRequirement(v as ScreeningRequirement)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None — no screening interview</SelectItem>
              <SelectItem value="optional">Optional — invite the candidate after they apply</SelectItem>
              <SelectItem value="required">Required — applications without screening are flagged</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {requirement !== "none" && (
          <div className="space-y-1.5">
            <Label>Question set</Label>
            <Select value={selectedSetId} onValueChange={setSelectedSetId} disabled={sets.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a question set" />
              </SelectTrigger>
              <SelectContent>
                {sets.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} ({Array.isArray(s.questions) ? s.questions.length : 0} questions)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSetId && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="outline" className="text-[10px]">
                  {sets.find((s) => s.id === selectedSetId)?.style ?? "mixed"}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {sets.find((s) => s.id === selectedSetId)?.prepTimeSec ?? 10}s prep
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {sets.find((s) => s.id === selectedSetId)?.maxRetakes ?? 1} retakes
                </Badge>
                {sets.find((s) => s.id === selectedSetId)?.proctoringOn && (
                  <Badge variant="outline" className="text-[10px]">
                    <Sparkles className="h-2.5 w-2.5 mr-1" />
                    Proctored
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-center pt-2">
          <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2">
            <Link to="/tools/interview-templates">
              <Plus className="h-3.5 w-3.5" />
              Manage templates
            </Link>
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save screening
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
