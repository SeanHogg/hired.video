import { useState, useCallback } from "react";
import { Flame, Upload, Download, Loader2, Share2, Send, Mail, ArrowRight } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
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
  const location = useLocation();
  useSEO(location.pathname);
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  const [resumeText, setResumeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RoastResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [captureEmail, setCaptureEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

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
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://hired.video/resume-roast")}&summary=${encodeURIComponent(post)}`;
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
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />

        <main className="max-w-3xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 mb-4">
              <Flame className="w-7 h-7 text-orange-500" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">AI Resume Roast</h1>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              Paste your resume. Get a brutally honest score, roast, and actionable fixes in seconds.
              Download a shareable score card for LinkedIn.
            </p>
          </div>

          {/* Input */}
          {!result && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Paste or upload your resume</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  onChange={(e) => setResumeText(e.target.value)}
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
              <RoastResultView result={result} />

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
        </main>
        <Footer />
      </div>
    </div>
  );
}
