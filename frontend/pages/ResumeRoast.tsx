import { useState, useCallback } from "react";
import { Flame, Upload, Download, Loader2 } from "lucide-react";
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
import { z } from "zod";
import RoastResultView from "@/components/RoastResult";
import type { RoastResult } from "@/components/RoastResult";
import { scoreCardToBlob } from "@/components/ScoreCard";
import { useToast } from "@/hooks/use-toast";

// ─── API schema ───────────────────────────────────────────────────────────────

const RoastResponseSchema = z.object({
  score: z.number(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  roast: z.string(),
  fixes: z.array(z.string()),
  improvedExamples: z.array(z.object({ original: z.string(), improved: z.string() })),
});

// ─── DOCX text extraction helper ─────────────────────────────────────────────

async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
    return file.text();
  }
  if (file.name.endsWith(".docx") || file.type.includes("wordprocessingml")) {
    // Dynamically import JSZip (only when needed)
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xmlFile = zip.file("word/document.xml");
    if (xmlFile) {
      const xml = await xmlFile.async("text");
      return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  }
  return file.text();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ResumeRoast() {
  const location = useLocation();
  useSEO(location.pathname);
  const { toast } = useToast();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  const [resumeText, setResumeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RoastResult | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await extractTextFromFile(file);
      setResumeText(text);
    } catch {
      toast({ title: "Could not read file", description: "Please paste your resume text instead", variant: "destructive" });
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
    } catch {
      toast({ title: "Roast failed", description: "Please try again in a moment", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [resumeText, toast]);

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
                  <Label htmlFor="resume-upload" className="sr-only">Upload file</Label>
                  <label
                    htmlFor="resume-upload"
                    className="flex items-center gap-2 cursor-pointer w-fit text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Upload .txt / .md / .docx
                    <input
                      id="resume-upload"
                      type="file"
                      accept=".txt,.md,.docx,text/plain"
                      className="sr-only"
                      onChange={handleFileChange}
                    />
                  </label>
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
              <div className="flex items-center justify-between">
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
                  Download Score Card
                </Button>
              </div>
              <RoastResultView result={result} />
            </div>
          )}
        </main>
        <Footer />
      </div>
    </div>
  );
}
