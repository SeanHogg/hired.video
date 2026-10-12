// /tools/video-pitch-lab
//
// Candidate-side workshop for the 30–90-second "tell me about yourself"
// pitch. Doesn't replace the AI studio editor — this is a focused recorder
// + script + AI feedback loop so a job seeker can author one portable pitch
// they can attach to any application or paste into a public profile.
//
// Flow:
//   1. Pick a length (30s / 60s / 90s) + tone (casual / professional /
//      enthusiastic).
//   2. AI generates a starter script tailored to the user's saved resume
//      (master, by default; user can switch).
//   3. Prep timer (10s) → record with countdown → review → optionally
//      hand off to AI Coach for written feedback against the same rubric
//      the recruiter sees.
//   4. Each take is recorded into a studio project with `purpose: "pitch"`
//      (usePitchProject); "Save as my profile pitch" makes it the one pitch
//      recruiters and visitors see (#1237 / #2133).

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Copy,
  Loader2,
  MessageSquare,
  Mic,
  Sparkles,
  Star,
  Video,
} from "lucide-react";
import { ToolShell } from "@/components/tools/ToolShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { resumeService } from "@/lib/services/resume-service";
import { generatePitchScript } from "@/lib/services/video-pitch-service";
import { usePitchProject } from "@/hooks/use-pitch-project";
import PitchSaveControls from "@/components/tools/video-pitch/PitchSaveControls";
import WebcamRecorderWithUpload from "@/components/studio/WebcamRecorderWithUpload";
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
import { toast } from "sonner";

type Length = 30 | 60 | 90;
type Tone = "casual" | "professional" | "enthusiastic";

interface PitchDraft {
  length: Length;
  tone: Tone;
  resumeId: string;
  script: string;
}

export default function VideoPitchLab() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [length, setLength] = useState<Length>(60);
  const [tone, setTone] = useState<Tone>("professional");
  const { resumeId: deepLinkResumeId } = useToolEntityParams();
  const [resumeId, setResumeId] = useState<string>(deepLinkResumeId ?? "");
  const [script, setScript] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState<"setup" | "record" | "review">("setup");
  const [recording, setRecording] = useState<{ url: string; durationSec: number } | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [authMessage, setAuthMessage] = useState(() =>
    t("messages.videoPitch.signInDefault"),
  );

  const { restored, snapshot, clear } = usePendingToolInput<PitchDraft>();
  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    setLength(restored.length);
    setTone(restored.tone);
    setResumeId(restored.resumeId);
    setScript(restored.script);
  }, [restored, isAuthenticated]);

  const currentDraft = (): PitchDraft => ({ length, tone, resumeId, script });
  // The pitch is a studio project (`purpose: "pitch"`); the hook owns the
  // project this session records into + the user's current pitch pointer.
  const pitch = usePitchProject({
    enabled: isAuthenticated,
    projectName: t("tools.videoPitchLab.projectName"),
  });
  const [preparingTake, setPreparingTake] = useState(false);

  /** Every take records into a pitch project — make sure one exists before
   *  the recorder mounts so the upload is linked to it. */
  async function goToRecord() {
    setPreparingTake(true);
    try {
      await pitch.prepareTake(script);
      setStep("record");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.couldNotSave"));
    } finally {
      setPreparingTake(false);
    }
  }

  const { data: resumes = [] } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated,
  });

  async function handleGenerateScript() {
    if (!isAuthenticated) {
      snapshot(currentDraft());
      setAuthMessage(t("messages.videoPitch.signInDraftScript"));
      setShowAuthOverlay(true);
      return;
    }
    setGenerating(true);
    try {
      const result = await generatePitchScript({
        resumeId: resumeId || undefined,
        length,
        tone,
      });
      setScript(result.script);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.couldNotGenerateScript"));
    } finally {
      setGenerating(false);
    }
  }

  function handleContinueToRecord() {
    if (!isAuthenticated) {
      snapshot(currentDraft());
      setAuthMessage(t("messages.videoPitch.signInRecord"));
      setShowAuthOverlay(true);
      return;
    }
    void goToRecord();
  }

  function handleCopyUrl() {
    if (!recording?.url) return;
    void navigator.clipboard.writeText(recording.url).then(
      () => toast.success(t("tools.videoPitchLab.toastUrlCopied")),
      () => toast.error(t("tools.videoPitchLab.toastCopyFail")),
    );
  }

  function aiCoachReviewHref(): string {
    const prompt = t("tools.videoPitchLab.aiCoachPrompt", { length, tone, script });
    return `/ai-coach?q=${encodeURIComponent(prompt)}`;
  }

  return (
    <ToolShell
      toolId="video-pitch-lab"
      header={{
        icon: <Video className="h-6 w-6" />,
        title: t("tools.card.video-pitch-lab.title"),
        description: t("tools.videoPitchLab.description"),
        tier: "free",
      }}
      authOverlay={{
        show: showAuthOverlay,
        message: authMessage,
      }}
    >
      <div className="space-y-6 mt-4">
        {/* Always-visible journey so a first-time visitor sees this is a
            guided Script → Record → Review flow, not a one-off form. */}
        <Stepper
          current={step}
          steps={[
            { key: "setup", label: t("tools.videoPitchLab.stepScript") },
            { key: "record", label: t("tools.videoPitchLab.stepRecord") },
            { key: "review", label: t("tools.videoPitchLab.stepReview") },
          ]}
        />

        {step === "setup" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("tools.videoPitchLab.section1")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("tools.videoPitchLab.lengthLabel")}</Label>
                  <Select value={String(length)} onValueChange={(v) => setLength(Number(v) as Length)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">{t("tools.videoPitchLab.len30")}</SelectItem>
                      <SelectItem value="60">{t("tools.videoPitchLab.len60")}</SelectItem>
                      <SelectItem value="90">{t("tools.videoPitchLab.len90")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("tools.videoPitchLab.toneLabel")}</Label>
                  <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">{t("tools.videoPitchLab.toneCasual")}</SelectItem>
                      <SelectItem value="professional">{t("tools.videoPitchLab.toneProfessional")}</SelectItem>
                      <SelectItem value="enthusiastic">{t("tools.videoPitchLab.toneEnthusiastic")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("tools.videoPitchLab.basedOnResume")}</Label>
                  <Select value={resumeId} onValueChange={setResumeId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("tools.videoPitchLab.pickResume")} />
                    </SelectTrigger>
                    <SelectContent>
                      {resumes.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.title ?? t("tools.videoPitchLab.untitledResume")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("tools.videoPitchLab.section2")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleGenerateScript} disabled={generating} className="gap-1">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {script ? t("tools.videoPitchLab.redraft") : t("tools.videoPitchLab.draft")}
                </Button>
                <Textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={6}
                  placeholder={t("tools.videoPitchLab.pitchPlaceholder")}
                />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {script.trim().length < 20 && (
                    <span className="text-xs text-muted-foreground mr-auto">
                      {t("tools.videoPitchLab.scriptHint")}
                    </span>
                  )}
                  <Button
                    onClick={handleContinueToRecord}
                    disabled={script.trim().length < 20 || preparingTake}
                    className="gap-1"
                  >
                    {preparingTake ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                    {t("tools.videoPitchLab.continueToRecord")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {step === "record" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
                <span>{t("tools.videoPitchLab.section3")}</span>
                <div className="flex gap-2">
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {t("tools.videoPitchLab.maxSeconds", { length })}
                  </Badge>
                  <Badge variant="outline">{tone}</Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert>
                <AlertDescription className="text-xs">
                  {t("tools.videoPitchLab.teleprompterTip")}
                </AlertDescription>
              </Alert>
              <WebcamRecorderWithUpload
                mode="webcam"
                projectId={pitch.projectId ?? undefined}
                maxDurationSec={length}
                teleprompterText={script}
                onCaptured={(url, durationSec) => {
                  setRecording({ url, durationSec });
                  setStep("review");
                }}
              />
              <Button variant="ghost" onClick={() => setStep("setup")}>
                {t("tools.videoPitchLab.backToScript")}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "review" && recording && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("tools.videoPitchLab.section4")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StudioVideoSurface
                mode="flat"
                source={{ kind: "url", url: recording.url }}
                className="w-full max-w-2xl"
                title={t("tools.card.video-pitch-lab.title")}
              />
              <div className="flex flex-wrap gap-2">
                <PitchSaveControls pitch={pitch} onSaved={clear} />
                <Button onClick={handleCopyUrl} variant="outline" className="gap-1">
                  <Copy className="h-3.5 w-3.5" />
                  {t("tools.videoPitchLab.copyPitchUrl")}
                </Button>
                <Button asChild variant="outline" className="gap-1">
                  <a href={aiCoachReviewHref()}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    {t("tools.videoPitchLab.getAiFeedback")}
                  </a>
                </Button>
                <Button onClick={() => void goToRecord()} disabled={preparingTake} variant="ghost">
                  {t("tools.videoPitchLab.reRecord")}
                </Button>
                <Button asChild variant="ghost" className="ml-auto">
                  <Link to="/interview-assignments">{t("tools.videoPitchLab.viewAssignments")}</Link>
                </Button>
              </div>
              {pitch.currentPitch && !pitch.isCurrent && (
                <Alert>
                  <AlertDescription className="text-xs flex items-center gap-2">
                    <Star className="h-3.5 w-3.5 text-primary" />
                    {t("tools.videoPitchLab.alreadyHavePitch")}
                  </AlertDescription>
                </Alert>
              )}
              <Alert>
                <AlertDescription className="text-xs">
                  {t("tools.videoPitchLab.shareHint")}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
      </div>
    </ToolShell>
  );
}
