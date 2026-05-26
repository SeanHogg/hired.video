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

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Copy,
  Loader2,
  MessageSquare,
  Mic,
  Save,
  Sparkles,
  Star,
  Video,
} from "lucide-react";
import { ToolShell } from "@/components/tools/ToolShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  generatePitchScript,
  getPitchProfile,
  setPitchProfile,
} from "@/lib/services/video-pitch-service";
import WebcamRecorderWithUpload from "@/components/studio/WebcamRecorderWithUpload";
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
  const { isAuthenticated } = useAuth();
  const [length, setLength] = useState<Length>(60);
  const [tone, setTone] = useState<Tone>("professional");
  const [resumeId, setResumeId] = useState<string>("");
  const [script, setScript] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState<"setup" | "record" | "review">("setup");
  const [recording, setRecording] = useState<{ url: string; durationSec: number } | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [authMessage, setAuthMessage] = useState(
    "Sign in to draft, record, and save your video pitch — we'll keep your script.",
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
  // Saved profile pitch URL (#1237). Hydrated from the API on mount so a
  // returning user sees "your current pitch" rather than starting fresh.
  const [savedPitchUrl, setSavedPitchUrl] = useState<string | null>(null);
  const [savingPitch, setSavingPitch] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    getPitchProfile()
      .then((p) => {
        if (!cancelled) setSavedPitchUrl(p.videoPitchUrl);
      })
      .catch(() => {
        /* silent — feature still works without the saved one */
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  async function handleSaveAsProfilePitch() {
    if (!recording?.url) return;
    setSavingPitch(true);
    try {
      const next = await setPitchProfile(recording.url);
      setSavedPitchUrl(next.videoPitchUrl);
      clear();
      toast.success("Saved as your profile pitch — recruiters will see it on your profile");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSavingPitch(false);
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
      setAuthMessage(
        "Sign in to let AI draft your pitch script — we'll keep the length and tone you picked.",
      );
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
      toast.error(err instanceof Error ? err.message : "Could not generate a script");
    } finally {
      setGenerating(false);
    }
  }

  function handleContinueToRecord() {
    if (!isAuthenticated) {
      snapshot(currentDraft());
      setAuthMessage(
        "Sign in to record your pitch — we'll keep your script ready to go.",
      );
      setShowAuthOverlay(true);
      return;
    }
    setStep("record");
  }

  function handleCopyUrl() {
    if (!recording?.url) return;
    void navigator.clipboard.writeText(recording.url).then(
      () => toast.success("Pitch URL copied"),
      () => toast.error("Could not copy"),
    );
  }

  function aiCoachReviewHref(): string {
    const prompt = `Please give me feedback on this elevator pitch I wrote (target length ${length}s, tone ${tone}). Score it 0–10 on hook, clarity, value-proposition, and call to action, then suggest a punchier rewrite.\n\nPitch:\n${script}`;
    return `/ai-coach?q=${encodeURIComponent(prompt)}`;
  }

  return (
    <ToolShell
      toolId="video-pitch-lab"
      header={{
        icon: <Video className="h-6 w-6 text-brand-purple" />,
        iconBgClassName: "bg-purple-100",
        title: "Video Pitch Lab",
        description:
          "Workshop the one-minute 'tell me about yourself' video pitch every recruiter asks for. AI-drafted script, prep timer, retake, AI feedback — then a portable URL you can paste into any application.",
        tier: "free",
      }}
      authOverlay={{
        show: showAuthOverlay,
        message: authMessage,
      }}
    >
      <div className="space-y-6 mt-4">
        {step === "setup" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">1. Pick length and tone</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Length</Label>
                  <Select value={String(length)} onValueChange={(v) => setLength(Number(v) as Length)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 seconds (hook only)</SelectItem>
                      <SelectItem value="60">60 seconds (recommended)</SelectItem>
                      <SelectItem value="90">90 seconds (in-depth)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tone</Label>
                  <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Based on resume (optional)</Label>
                  <Select value={resumeId} onValueChange={setResumeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a resume" />
                    </SelectTrigger>
                    <SelectContent>
                      {resumes.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.title ?? "Untitled resume"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">2. Draft your script</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleGenerateScript} disabled={generating} className="gap-1">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {script ? "Re-draft with AI" : "Draft with AI"}
                </Button>
                <Textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={6}
                  placeholder="Type or paste your pitch here, or let AI draft a starter from your resume."
                />
                <div className="flex justify-end">
                  <Button
                    onClick={handleContinueToRecord}
                    disabled={script.trim().length < 20}
                    className="gap-1"
                  >
                    <Mic className="h-4 w-4" />
                    Continue to record
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
                <span>3. Record your pitch</span>
                <div className="flex gap-2">
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" />
                    Max {length}s
                  </Badge>
                  <Badge variant="outline">{tone}</Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert>
                <AlertDescription className="text-xs">
                  The teleprompter shows your script as you record. Aim for eye contact, not reading word-for-word.
                </AlertDescription>
              </Alert>
              <WebcamRecorderWithUpload
                mode="webcam"
                maxDurationSec={length}
                teleprompterText={script}
                onCaptured={(url, durationSec) => {
                  setRecording({ url, durationSec });
                  setStep("review");
                }}
              />
              <Button variant="ghost" onClick={() => setStep("setup")}>
                Back to script
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "review" && recording && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. Review and share</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <video
                src={recording.url}
                controls
                className="w-full max-w-2xl rounded-md"
                preload="metadata"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleSaveAsProfilePitch}
                  disabled={savingPitch || savedPitchUrl === recording.url}
                  className="gap-1"
                >
                  {savingPitch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {savedPitchUrl === recording.url
                    ? "Saved as your profile pitch"
                    : savedPitchUrl
                      ? "Replace profile pitch with this one"
                      : "Save as my profile pitch"}
                </Button>
                <Button onClick={handleCopyUrl} variant="outline" className="gap-1">
                  <Copy className="h-3.5 w-3.5" />
                  Copy pitch URL
                </Button>
                <Button asChild variant="outline" className="gap-1">
                  <a href={aiCoachReviewHref()}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    Get AI feedback on script
                  </a>
                </Button>
                <Button onClick={() => setStep("record")} variant="ghost">
                  Re-record
                </Button>
                <Button asChild variant="ghost" className="ml-auto">
                  <Link to="/interview-assignments">View interview assignments</Link>
                </Button>
              </div>
              {savedPitchUrl && savedPitchUrl !== recording.url && (
                <Alert>
                  <AlertDescription className="text-xs flex items-center gap-2">
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                    You already have a profile pitch saved. Saving this one replaces it.
                  </AlertDescription>
                </Alert>
              )}
              <Alert>
                <AlertDescription className="text-xs">
                  Paste the URL above into any job application, your public profile, or a recruiter
                  message. The pitch is hosted on hired.video — no re-upload needed for each application.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
      </div>
    </ToolShell>
  );
}
