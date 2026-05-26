import { useState, useCallback } from "react";
import { Flame, Download, Loader2, Share2, Send, Mail, ArrowRight, FileText } from "lucide-react";
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
import { extractTextFromFile } from "@/lib/extract-text";
import FileUploadInput from "@/components/FileUploadInput";
import { ToolShell } from "@/components/tools/ToolShell";
import { resumeService } from "@/lib/services/resume-service";
import { useQuery } from "@tanstack/react-query";

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
  const { isAuthenticated } = useAuth();
  // Fetch user's resumes if authenticated
  const { data: resumes = [] } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated,
  });

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

  const handleExistingResumeSelect = useCallback(async (resumeId: string) => {
    try {
      const resume = await resumeService.getResumeById(resumeId);
      const data = resume?.content;
      if (!data) {
        toast({ title: "Could not load resume", variant: "destructive" });
        return;
      }
      // Convert structured resume to readable text for the roast
      const parts: string[] = [];
      if (data.basics?.name) parts.push(data.basics.name);
      if (data.basics?.label) parts.push(data.basics.label);
      if (data.basics?.summary) parts.push(`\nSummary\n${data.basics.summary}`);
      if (data.work?.length) {
        parts.push("\nExperience");
        for (const w of data.work) {
          parts.push(`${w.position} at ${w.name} (${w.startDate} - ${w.endDate || "Present"})`);
          if (w.summary) parts.push(w.summary);
          if (w.highlights?.length) parts.push(w.highlights.map((h) => `- ${h}`).join("\n"));
        }
      }
      if (data.education?.length) {
        parts.push("\nEducation");
        for (const e of data.education) {
          parts.push(`${e.studyType || ""} ${e.area || ""} at ${e.institution} (${e.startDate} - ${e.endDate || ""})`);
        }
      }
      if (data.skills?.length) {
        parts.push(`\nSkills: ${data.skills.map((s) => s.name + (s.keywords?.length ? ` (${s.keywords.join(", ")})` : "")).join(", ")}`);
      }
      setResumeText(parts.join("\n"));
      setSourceResumeId(resumeId);
    } catch {
      toast({ title: "Could not load resume", variant: "destructive" });
    }
  }, [toast]);

  const handleFileChange = useCallback(async (file: File) => {
    try {
      const text = await extractTextFromFile(file);
      if (!text.trim()) {
        toast({
          title: "Could not extract text",
          description: "This file type isn't supported or contains no selectable text. Please paste your resume instead.",
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
        title: "Could not read file",
        description: "Please paste your resume text instead.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleRoast = useCallback(async () => {
    if (resumeText.trim().length < 20) {
      toast({ title: "Resume too short", description: "Paste at least a few lines of your resume", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await apiClient.post("/api/resume/roast", { resumeText }, RoastResponseSchema);
      setResult(res.data);
      gtmEvent("resume_roast_completed", { score: res.data.score });
    } catch {
      toast({ title: "Roast failed", description: "Please try again in a moment", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [resumeText, toast]);

  const handleShareToFeed = useCallback(async () => {
    if (!result || !isAuthenticated) return;
    setSharing(true);
    try {
      const grade = result.score >= 80 ? "A" : result.score >= 65 ? "B" : result.score >= 50 ? "C" : "D";
      const content = `🔥 I just got my resume roasted by AI!\n\nScore: ${result.score}/100 (${grade})\n\n💪 Top strength: ${result.strengths[0] ?? "solid experience"}\n⚡ Biggest fix: ${result.fixes[0] ?? "add more metrics"}\n\n#ResumeRoast #CareerTips #JobSearch\n\nTry it free at hired.video → Resume Roast`;
      await apiClient.post("/api/feed/posts", { content, privacy: "Public" }, null as any);
      toast({ title: "Shared to Feed!", description: "Your roast score is now on the Feed." });
    } catch {
      toast({ title: "Share failed", description: "Please try again", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }, [result, isAuthenticated, toast]);

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
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }, [result, toast]);

  return (
    <ToolShell
      toolId="resume-roast"
      header={{
        icon: <Flame className="h-6 w-6 text-red-500" />,
        iconBgClassName: "bg-red-100 dark:bg-red-900/30",
        title: "AI Resume Roast",
        description: "Brutally honest AI feedback on your resume",
        tier: "free",
      }}
    >
          {/* Input */}
          {!result && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Select, paste, or upload your resume</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Existing resume selector for authenticated users */}
                {isAuthenticated && resumes.length > 0 && (
                  <div>
                    <Label htmlFor="resume-select" className="text-sm mb-1.5 block">Select an existing resume</Label>
                    <Select onValueChange={handleExistingResumeSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a resume..." />
                      </SelectTrigger>
                      <SelectContent>
                        {resumes.filter((r) => (r as any).Id || r.id).map((r) => (
                          <SelectItem key={((r as any).Id || r.id)!} value={((r as any).Id || r.id)!}>
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              {r.title || "Untitled Resume"}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <FileUploadInput
                    label={<Label className="sr-only">Upload file</Label>}
                    buttonText="Upload Resume"
                    accept=".pdf,.doc,.docx,.txt,.md,.json,text/plain"
                    onFileSelected={handleFileChange}
                  />
                </div>
                <Textarea
                  placeholder="Or paste your resume text here…"
                  value={resumeText}
                  onChange={(e) => {
                    setResumeText(e.target.value);
                    // Hand-edited text shouldn't be written back to whatever
                    // resume populated the textarea — break the link.
                    setSourceResumeId(undefined);
                  }}
                  rows={12}
                  className="font-mono text-sm resize-y"
                />
                <Button
                  size="lg"
                  className="w-full gap-2"
                  onClick={handleRoast}
                  disabled={loading || resumeText.trim().length < 20}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Roasting…</>
                  ) : (
                    <><Flame className="w-4 h-4 text-orange-400" /> Roast My Resume</>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setResult(null); }}>
                  ← Try Again
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleDownloadCard}
                  disabled={downloading}
                >
                  {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Download Card
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleShareToLinkedIn}
                >
                  <Share2 className="w-3 h-3" />
                  Share on LinkedIn
                </Button>
                {isAuthenticated && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleShareToFeed}
                    disabled={sharing}
                  >
                    {sharing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Post to Feed
                  </Button>
                )}
              </div>
              <RoastResultView result={result} resumeId={sourceResumeId} />

              {/* Email capture for guests */}
              {!isAuthenticated && (
                <Card className="border-primary/30 bg-primary/5 mt-4">
                  <CardContent className="pt-5">
                    {emailSaved ? (
                      <p className="text-sm text-center font-medium text-primary">
                        ✓ Got it — we'll send your full report and job matches to {captureEmail}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-primary flex-shrink-0" />
                          <p className="text-sm font-medium">Save your roast report + get matched jobs</p>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            type="email"
                            placeholder="your@email.com"
                            value={captureEmail}
                            onChange={(e) => setCaptureEmail(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveEmail()}
                            className="flex-1 h-9 text-sm"
                          />
                          <Button
                            size="sm"
                            className="gap-1.5 flex-shrink-0"
                            onClick={handleSaveEmail}
                            disabled={savingEmail || !captureEmail.includes("@")}
                          >
                            {savingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                            Save
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">No spam. Unsubscribe any time.</p>
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
