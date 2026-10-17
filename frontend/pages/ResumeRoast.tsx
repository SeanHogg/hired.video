import { useState, useCallback, useEffect, useRef } from "react";
import { Flame, Download, Loader2, Share2, Send, Mail, ArrowRight, FileText, ArrowLeft, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { gtmEvent } from "@/lib/gtm";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import RoastResultView from "@/components/RoastResult";
import type { RoastResult } from "@/components/RoastResult";
import { scoreCardToBlob } from "@/components/ScoreCard";
import { useToast } from "@/hooks/use-toast";
import { RESUME_TEXT_FILE_ACCEPT, getResumeTextFromFile } from "@/lib/services/resume-text";
import FileUploadInput from "@/components/FileUploadInput";
import { ToolShell } from "@/components/tools/ToolShell";
import MonoChip from "@/components/templates/MonoChip";
import { readResumeContent } from "@/lib/tools/resume-content";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { resumeToPlainText } from "@/lib/resume-exporters";
import { useUserResumes } from "@/hooks/queries/use-resumes";

// ─── API schema ───────────────────────────────────────────────────────────────

const RoastResponseSchema = z.object({
  score: z.number(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  roast: z.string(),
  fixes: z.array(z.string()),
  improvedExamples: z.array(z.object({ original: z.string(), improved: z.string() })),
});


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ResumeRoast() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  // Fetch user's resumes if authenticated
  const { data: resumes = [] } = useUserResumes();

  const [resumeText, setResumeText] = useState("");
  // Tracks the saved-resume the input text came from. Set when the user
  // picks from the dropdown; cleared when they paste/upload/edit so we
  // never apply rewrites against an unrelated resume.
  const [sourceResumeId, setSourceResumeId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RoastResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [captureEmail, setCaptureEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // Reads through the résumé port, so embedded in the kit workspace it roasts the draft
  // on screen (and an applied rewrite lands there as an Undo step).
  const handleExistingResumeSelect = useCallback(async (resumeId: string) => {
    try {
      const data = await readResumeContent(resumeId);
      const text = data ? resumeToPlainText(data).trim() : "";
      if (!text) {
        toast({ title: t("resumeRoast.toast.loadFailed"), variant: "destructive" });
        return;
      }
      setResumeText(text);
      setSourceResumeId(resumeId);
    } catch {
      toast({ title: t("resumeRoast.toast.loadFailed"), variant: "destructive" });
    }
  }, [toast, t]);

  // A linked résumé (the one open in the kit workspace when embedded) is loaded up front.
  const { resumeId: deepLinkResumeId } = useToolEntityParams();
  const loadedLinkRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!deepLinkResumeId || loadedLinkRef.current === deepLinkResumeId) return;
    loadedLinkRef.current = deepLinkResumeId;
    void handleExistingResumeSelect(deepLinkResumeId);
  }, [deepLinkResumeId, handleExistingResumeSelect]);

  const handleFileChange = useCallback(async (file: File) => {
    try {
      const text = await getResumeTextFromFile(file);
      if (!text.trim()) {
        toast({
          title: t("resumeRoast.toast.extractFailed.title"),
          description: t("resumeRoast.toast.extractFailed.description"),
          variant: "destructive",
        });
        return;
      }
      setResumeText(text);
      // Uploaded text isn't bound to any saved resume — clear the link
      // so the apply-rewrite UI hides instead of writing to the previously
      // selected dropdown resume.
      setSourceResumeId(undefined);
    } catch {
      toast({
        title: t("resumeRoast.toast.readFailed.title"),
        description: t("resumeRoast.toast.readFailed.description"),
        variant: "destructive",
      });
    }
  }, [toast, t]);

  const handleRoast = useCallback(async () => {
    if (resumeText.trim().length < 20) {
      toast({ title: t("resumeRoast.toast.tooShort.title"), description: t("resumeRoast.toast.tooShort.description"), variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await apiClient.post("/api/resume/roast", { resumeText }, RoastResponseSchema);
      setResult(res.data);
      gtmEvent("resume_roast_completed", { score: res.data.score });
    } catch {
      toast({ title: t("resumeRoast.toast.roastFailed.title"), description: t("resumeRoast.toast.roastFailed.description"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [resumeText, toast, t]);

  const handleShareToFeed = useCallback(async () => {
    if (!result || !isAuthenticated) return;
    setSharing(true);
    try {
      const grade = result.score >= 80 ? "A" : result.score >= 65 ? "B" : result.score >= 50 ? "C" : "D";
      const content = `🔥 I just got my resume roasted by AI!\n\nScore: ${result.score}/100 (${grade})\n\n💪 Top strength: ${result.strengths[0] ?? "solid experience"}\n⚡ Biggest fix: ${result.fixes[0] ?? "add more metrics"}\n\n#ResumeRoast #CareerTips #JobSearch\n\nTry it free at hired.video → Resume Roast`;
      await apiClient.post("/api/feed/posts", { content, privacy: "Public" }, null as any);
      toast({ title: t("resumeRoast.toast.shared.title"), description: t("resumeRoast.toast.shared.description") });
    } catch {
      toast({ title: t("resumeRoast.toast.shareFailed.title"), description: t("resumeRoast.toast.shareFailed.description"), variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }, [result, isAuthenticated, toast, t]);

  const handleShareToLinkedIn = useCallback(() => {
    if (!result) return;
    const grade = result.score >= 80 ? "A" : result.score >= 65 ? "B" : result.score >= 50 ? "C" : "D";
    const post = `🔥 I just got my resume brutally roasted by AI — and it was humbling.\n\nScore: ${result.score}/100 (${grade})\n\n✅ Biggest strength: ${result.strengths[0] ?? "strong experience section"}\n🔧 Top fix: ${result.fixes[0] ?? "add more quantified achievements"}\n\nHonestly, every job seeker should try this. It took 30 seconds and I already know exactly what to improve.\n\nTry Resume Roast free → hired.video\n\n#ResumeRoast #CareerAdvice #JobSearch #AI`;
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://hired.video/tools/resume-roast")}&summary=${encodeURIComponent(post)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=500");
  }, [result]);

  const handleSaveEmail = useCallback(async () => {
    if (!captureEmail.includes("@") || !result) return;
    setSavingEmail(true);
    try {
      await apiClient.post("/api/marketing/leads", { email: captureEmail, source: "resume_roast", notes: `Score: ${result.score}` }, null as any);
      gtmEvent("roast_email_capture", { score: result.score });
      setEmailSaved(true);
    } catch {
      // still show success to avoid blocking UX
      setEmailSaved(true);
    } finally {
      setSavingEmail(false);
    }
  }, [captureEmail, result]);

  const handleDownloadCard = useCallback(async () => {
    if (!result) return;
    setDownloading(true);
    try {
      const blob = await scoreCardToBlob({
        score: result.score,
        roast: result.roast,
        strengths: result.strengths,
        fixes: result.fixes,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resume-score-card.png";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: t("resumeRoast.toast.downloadFailed"), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }, [result, toast, t]);

  return (
    <ToolShell
      toolId="resume-roast"
      header={{
        icon: <Flame className="h-6 w-6" />,
        title: t("resumeRoast.title"),
        description: t("resumeRoast.description"),
        tier: "free",
      }}
    >
      {/* Input card */}
      {!result && (
        <Card>
          <CardHeader className="gap-2">
            <MonoChip className="w-fit">{t("resumeRoast.input.chip")}</MonoChip>
            <CardTitle className="text-xl">{t("resumeRoast.input.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Existing resume selector for authenticated users */}
            {isAuthenticated && resumes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="resume-select" className="text-sm">
                  {t("resumeRoast.input.selectExisting")}
                </Label>
                <Select value={sourceResumeId ?? ""} onValueChange={handleExistingResumeSelect}>
                  <SelectTrigger id="resume-select" className="min-h-[44px]">
                    <SelectValue placeholder={t("resumeRoast.input.choosePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {resumes.filter((r) => (r as any).Id || r.id).map((r) => (
                      <SelectItem key={((r as any).Id || r.id)!} value={((r as any).Id || r.id)!}>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          {r.title || t("labels.untitledResume")}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <FileUploadInput
              label={<Label className="sr-only">{t("resumeRoast.input.uploadLabel")}</Label>}
              buttonText={t("resumeRoast.input.uploadButton")}
              accept={RESUME_TEXT_FILE_ACCEPT}
              onFileSelected={handleFileChange}
            />
            <Textarea
              aria-label={t("resumeRoast.input.pasteLabel")}
              placeholder={t("resumeRoast.input.pastePlaceholder")}
              value={resumeText}
              onChange={(e) => {
                setResumeText(e.target.value);
                // Hand-edited text shouldn't be written back to whatever
                // resume populated the textarea — break the link.
                setSourceResumeId(undefined);
              }}
              rows={12}
              className="resize-y font-mono text-sm"
            />
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={handleRoast}
              disabled={loading || resumeText.trim().length < 20}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("resumeRoast.action.roasting")}</>
              ) : (
                <><Flame className="h-4 w-4" aria-hidden="true" /> {t("resumeRoast.action.roast")}</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Result card */}
      {result && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-border bg-card p-3">
            <Button variant="ghost" className="min-h-[44px] gap-2" onClick={() => { setResult(null); }}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("actions.tryAgainCapital")}
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="min-h-[44px] gap-2"
                onClick={handleDownloadCard}
                disabled={downloading}
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                {t("resumeRoast.result.downloadCard")}
              </Button>
              <Button
                variant="outline"
                className="min-h-[44px] gap-2"
                onClick={handleShareToLinkedIn}
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                {t("resumeRoast.result.shareLinkedIn")}
              </Button>
              {isAuthenticated && (
                <Button
                  variant="outline"
                  className="min-h-[44px] gap-2"
                  onClick={handleShareToFeed}
                  disabled={sharing}
                >
                  {sharing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                  {t("resumeRoast.result.postToFeed")}
                </Button>
              )}
            </div>
          </div>
          <RoastResultView result={result} resumeId={sourceResumeId} />

          {/* Email capture for guests */}
          {!isAuthenticated && (
            <Card className="bg-accent">
              <CardContent className="pt-6">
                {emailSaved ? (
                  <p className="flex items-center justify-center gap-2 text-center text-sm font-medium text-foreground">
                    <Check className="h-4 w-4 shrink-0 text-brand-green-text" aria-hidden="true" />
                    {t("resumeRoast.email.saved", { email: captureEmail })}
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <p className="text-sm font-semibold text-accent-foreground">{t("resumeRoast.email.prompt")}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        type="email"
                        aria-label={t("resumeRoast.email.label")}
                        placeholder={t("resumeRoast.email.placeholder")}
                        value={captureEmail}
                        onChange={(e) => setCaptureEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveEmail()}
                        className="min-h-[44px] min-w-0 flex-[1_1_200px] text-sm"
                      />
                      <Button
                        className="min-h-[44px] shrink-0 gap-1.5"
                        onClick={handleSaveEmail}
                        disabled={savingEmail || !captureEmail.includes("@")}
                      >
                        {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                        {t("actions.save")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("resumeRoast.email.noSpam")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </ToolShell>
  );
}
