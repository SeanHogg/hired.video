import { useEffect, useState } from "react";
import { FileText, Loader2, Upload, Sparkles } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ToolFooterSEO from "@/components/ToolFooterSEO";
import AuthOverlay from "@/components/AuthOverlay";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useAuth } from "@/lib/auth";
import { resumeService } from "@/lib/services/resume-service";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { extractTextFromFile } from "@/lib/extract-text";
import { useToolRunRecorder } from "@/lib/tools/use-tool-run-recorder";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { ToolPageHeader } from "@/components/tools/ToolPageHeader";
import ResumeSelectItem from "@/components/tools/ResumeSelectItem";
import { AppShell } from "@/components/AppShell";

export default function SummarizeResume() {
  const { t } = useTranslation();
  const location = useLocation();  const { isAuthenticated, user } = useAuth();

  // SEO for summarize resume page
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: t("labels.aiTools"), url: "/tools" },
    { name: t("tools.summarizeResume.title"), url: "/tools/summarize-resume" },
  ]);

  const { resumeId: deepLinkResumeId } = useToolEntityParams();

  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState(deepLinkResumeId ?? "");
  const [summary, setSummary] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  const { recordRun } = useToolRunRecorder("summarize-resume");

  // Persist the pasted resume text across the anonymous → authenticated bounce
  // so the user doesn't have to re-paste after signing in.
  const { restored, snapshot, clear } = usePendingToolInput<{
    resumeText?: string;
    selectedResumeId?: string;
  }>();

  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    if (restored.resumeText) setResumeText(restored.resumeText);
    if (restored.selectedResumeId) setSelectedResumeId(restored.selectedResumeId);
  }, [restored, isAuthenticated]);

  // Fetch user's resumes if authenticated
  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated,
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "application/json",
        "application/ld+json",
      ];

      if (!allowedTypes.includes(selectedFile.type)) {
        setError(t("errors.uploadResumeFile"));
        return;
      }

      // Validate file size (10MB limit)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError(t("errors.fileSizeMax10Mb"));
        return;
      }

      setFile(selectedFile);
      setError(null);
      setSummary(null);
    }
  };

  const handleTextSummarization = async () => {
    if (!resumeText.trim()) {
      setError(t("errors.enterResumeTextSummarize"));
      return;
    }

    // Check authentication before proceeding
    if (!isAuthenticated) {
      snapshot({ resumeText });
      setShowAuthOverlay(true);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setSummary(null);

    try {
      // Call the summarization API with resume text
      const response = await apiClient.post("/api/Resume/Summarize", {
        resumeText: resumeText,
      });

      const data: any = response.data;
      const summaryText: string = typeof data === "string" ? data : (data?.result ?? "");
      setSummary(summaryText || data);
      void recordRun({
        score: null,
        result: (typeof data === "object" && data !== null
          ? (data as Record<string, unknown>)
          : { result: summaryText }) as Record<string, unknown>,
        summary: summaryText
          ? `Summary generated (${summaryText.length} chars)`
          : "Resume summary generated",
      });
      clear();
    } catch (err) {
      console.error("Summarization failed:", err);
      setError(t("errors.summarizeResumeFailed"));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileSummarization = async () => {
    if (!file) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      // File objects can't be snapshotted; the file input will re-render
      // empty after login but the user has the original file locally.
      snapshot({});
      setShowAuthOverlay(true);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setSummary(null);

    try {
      // Extract text client-side (pdfjs-dist for PDF, jszip for DOCX)
      const extractedText = await extractTextFromFile(file);
      if (!extractedText.trim()) {
        setError(t("errors.couldNotExtractText"));
        setIsAnalyzing(false);
        return;
      }

      // Parse extracted text into structured JSON via AI
      const { data: parseResult } = await apiClient.requestRaw<any>(
        "/api/resume/parse",
        {
          method: "POST",
          body: JSON.stringify({ content: extractedText }),
          headers: { "Content-Type": "application/json" },
        },
      );
      const resumeContent = parseResult.result || parseResult;

      // Now summarize the parsed content
      const summaryResponse = await apiClient.post("/api/Resume/Summarize", {
        resumeText: resumeContent,
      });

      const data: any = summaryResponse.data;
      const summaryText: string = typeof data === "string" ? data : (data?.result ?? "");
      setSummary(summaryText || data);
      void recordRun({
        score: null,
        result: (typeof data === "object" && data !== null
          ? (data as Record<string, unknown>)
          : { result: summaryText }) as Record<string, unknown>,
        summary: summaryText
          ? `Summary generated (${summaryText.length} chars)`
          : "Resume summary generated",
      });
      clear();
    } catch (err) {
      console.error("File summarization failed:", err);
      setError(t("errors.summarizeResumeFileFailed"));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleResumeSummarization = async () => {
    if (!selectedResumeId) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      snapshot({ selectedResumeId });
      setShowAuthOverlay(true);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setSummary(null);

    try {
      // Pass the resume ID to the API - it will fetch and use the SerializedResume property
      const response = await apiClient.post("/api/Resume/Summarize", {
        resumeId: selectedResumeId,
      });

      const data: any = response.data;
      const summaryText: string = typeof data === "string" ? data : (data?.result ?? "");
      setSummary(summaryText || data);
      void recordRun({
        score: null,
        result: (typeof data === "object" && data !== null
          ? (data as Record<string, unknown>)
          : { result: summaryText }) as Record<string, unknown>,
        summary: summaryText
          ? `Summary generated (${summaryText.length} chars)`
          : "Resume summary generated",
        resumeId: selectedResumeId,
      });
      clear();
    } catch (err) {
      console.error("Resume summarization failed:", err);
      setError(t("errors.summarizeResumeFailed"));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    setSummary(null);
  };

  const resetAnalysis = () => {
    setFile(null);
    setResumeText("");
    setSelectedResumeId("");
    setError(null);
    setSummary(null);
  };

  const getFileIcon = (file: File) => {
    if (file.type.includes("pdf")) return "📄";
    if (file.type.includes("word")) return "📝";
    if (file.type.includes("text")) return "📄";
    return "📄";
  };

  return (
    <AppShell bgClassName="bg-background">
<div className={showAuthOverlay ? "relative" : undefined}>
          {showAuthOverlay && (
            <AuthOverlay
              contentType="tool"
              title={t("tools.summarizeResume.heading")}
              message={t("messages.signInToRunToolKeepInputs")}
            />
          )}

          <div className="max-w-6xl mx-auto p-6">
            <ToolPageHeader
              toolId="summarize-resume"
              icon={<Sparkles className="h-6 w-6 text-brand-green" />}
              iconBgClassName="bg-brand-green/10"
              title={t("tools.summarizeResume.heading")}
              description={t("tools.summarizeResume.subtitle")}
            />

            {/* Main Content */}
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Left Column - Summarization Tool */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      {t("actions.summarizeResume")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs
                      defaultValue={isAuthenticated ? "existing" : "text"}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="text">{t("labels.pasteText")}</TabsTrigger>
                        <TabsTrigger value="upload">{t("labels.uploadFile")}</TabsTrigger>
                        <TabsTrigger
                          value="existing"
                          disabled={!isAuthenticated}
                        >
                          {t("labels.myResumes")} {!isAuthenticated && t("labels.loginRequiredParen")}
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="text" className="space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            {t("fields.resumeText.label")}
                          </label>
                          <Textarea
                            placeholder={t("fields.resumeText.placeholder")}
                            value={resumeText}
                            onChange={(e) => setResumeText(e.target.value)}
                            className="min-h-[200px]"
                          />
                        </div>
                        <Button
                          onClick={handleTextSummarization}
                          disabled={isAnalyzing || !resumeText.trim()}
                          className="w-full"
                        >
                          {isAnalyzing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {t("status.summarizing")}
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              {t("actions.summarizeResume")}
                            </>
                          )}
                        </Button>
                      </TabsContent>

                      <TabsContent value="upload" className="space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            {t("labels.uploadResumeFile")}
                          </label>
                          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                            <input
                              type="file"
                              onChange={handleFileChange}
                              accept=".pdf,.doc,.docx,.txt,.md,.json"
                              className="hidden"
                              id="resume-upload"
                            />
                            <label
                              htmlFor="resume-upload"
                              className="cursor-pointer"
                            >
                              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                              <p className="text-sm text-muted-foreground">
                                {t("messages.clickOrDragAndDrop")}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {t("messages.supportedFilesMax10Mb")}
                              </p>
                            </label>
                          </div>
                        </div>

                        {file && (
                          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {getFileIcon(file)}
                              </span>
                              <span className="text-sm font-medium">
                                {file.name}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={removeFile}
                            >
                              {t("actions.remove")}
                            </Button>
                          </div>
                        )}

                        <Button
                          onClick={handleFileSummarization}
                          disabled={isAnalyzing || !file}
                          className="w-full"
                        >
                          {isAnalyzing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {t("status.summarizing")}
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              {t("actions.summarizeResume")}
                            </>
                          )}
                        </Button>
                      </TabsContent>

                      <TabsContent value="existing" className="space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            {t("labels.selectResume")}
                          </label>
                          <Select
                            value={selectedResumeId}
                            onValueChange={setSelectedResumeId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t("fields.resumeSelect.placeholderSummarize")} />
                            </SelectTrigger>
                            <SelectContent>
                              {resumes?.filter((resume) => resume.Id || resume.id).map((resume) => (
                                <ResumeSelectItem
                                  key={(resume.id as string | undefined)!}
                                  resume={resume as any}
                                />
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <Button
                          onClick={handleResumeSummarization}
                          disabled={isAnalyzing || !selectedResumeId}
                          className="w-full"
                        >
                          {isAnalyzing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {t("status.summarizing")}
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              {t("actions.summarizeResume")}
                            </>
                          )}
                        </Button>
                      </TabsContent>
                    </Tabs>

                    {error && (
                      <Alert className="mt-4">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Results */}
              <div className="space-y-6">
                {summary && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        {t("headings.resumeSummary")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm max-w-none">
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          {summary}
                        </div>
                      </div>

                      <div className="flex gap-2 mt-6">
                        <Button variant="outline" onClick={resetAnalysis}>
                          {t("actions.summarizeAnother")}
                        </Button>
                        <Button
                          onClick={() => navigator.clipboard.writeText(summary)}
                          variant="outline"
                        >
                          {t("actions.copySummary")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!summary && !isAnalyzing && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-semibold mb-2">{t("headings.readyToSummarize")}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t("messages.readyToSummarizeBody")}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
          <ToolFooterSEO />
</div>
</AppShell>
  );
}
