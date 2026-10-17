import { useEffect, useState } from "react";
import { Upload, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import { aiToolPath } from "@shared/ai-tools/tool-ids";
import { RESUME_TEXT_FILE_ACCEPT, getResumeTextFromFile, isResumeTextFile } from "@/lib/services/resume-text";
import { useToolRunRecorder } from "@/lib/tools/use-tool-run-recorder";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { ToolShell } from "@/components/tools/ToolShell";
import ResumeSelectItem from "@/components/tools/ResumeSelectItem";
import { useUserResumes } from "@/hooks/queries/use-resumes";
import { SummarizeButton, SummaryResultPanel } from "@/components/tools/summarize-resume/SummaryResultPanel";

export default function SummarizeResume() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();

  const { resumeId: deepLinkResumeId } = useToolEntityParams();

  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState(deepLinkResumeId ?? "");
  const [summary, setSummary] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  const { recordRun } = useToolRunRecorder("summarize-resume");

  // Single source of truth for what we persist on a summarize-resume run.
  // The three handler paths (paste / file upload / saved resume) all
  // pipe their API response through this so the history sheet, Copy
  // Report, and entity-history rollup see a consistent
  // NormalizedToolRunResult shape and the on-screen summary state stays
  // a plain string (never the full envelope object).
  const handleSummaryResponse = (data: any, refs: { resumeId?: string }) => {
    const summaryText: string = typeof data === "string" ? data : (data?.result ?? "");
    setSummary(summaryText);
    void recordRun({
      score: null,
      result: { summary: summaryText },
      summary: summaryText
        ? t("tools.summarizeResume.runSummary", { count: summaryText.length })
        : t("tools.summarizeResume.runSummaryEmpty"),
      ...refs,
    });
    clear();
  };

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
  const { data: resumes } = useUserResumes();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!isResumeTextFile(selectedFile)) {
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
      const response = await apiClient.post(aiToolPath("resume-summarize"), {
        resumeText: resumeText,
      });
      handleSummaryResponse(response.data, {});
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
      // Client-side read when it works; photos, scans and files the browser
      // can't read go to the server extractor / OCR (#2229).
      const extractedText = await getResumeTextFromFile(file);
      if (!extractedText.trim()) {
        setError(t("errors.couldNotExtractText"));
        setIsAnalyzing(false);
        return;
      }

      // Parse extracted text into structured JSON via AI
      const { data: parseResult } = await apiClient.requestRaw<any>(
        "/api/resumes/parse",
        {
          method: "POST",
          body: JSON.stringify({ content: extractedText }),
          headers: { "Content-Type": "application/json" },
        },
      );
      const resumeContent = parseResult.result || parseResult;

      // Now summarize the parsed content
      const summaryResponse = await apiClient.post(aiToolPath("resume-summarize"), {
        resumeText: resumeContent,
      });
      handleSummaryResponse(summaryResponse.data, {});
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
      const response = await apiClient.post(aiToolPath("resume-summarize"), {
        resumeId: selectedResumeId,
      });
      handleSummaryResponse(response.data, { resumeId: selectedResumeId });
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
    <ToolShell
      toolId="summarize-resume"
      header={{
        icon: <Sparkles className="h-6 w-6" />,
        title: t("tools.summarizeResume.heading"),
        description: t("tools.summarizeResume.subtitle"),
      }}
      authOverlay={{
        show: showAuthOverlay,
        message: t("messages.signInToRunToolKeepInputs"),
      }}
      breadcrumbLabel={t("tools.summarizeResume.title")}
    >
            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                        <SummarizeButton onClick={handleTextSummarization} disabled={isAnalyzing || !resumeText.trim()} busy={isAnalyzing} />
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
                              accept={RESUME_TEXT_FILE_ACCEPT}
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

                        <SummarizeButton onClick={handleFileSummarization} disabled={isAnalyzing || !file} busy={isAnalyzing} />
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

                        <SummarizeButton onClick={handleResumeSummarization} disabled={isAnalyzing || !selectedResumeId} busy={isAnalyzing} />
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
                <SummaryResultPanel summary={summary} busy={isAnalyzing} onReset={resetAnalysis} />
              </div>
            </div>
    </ToolShell>
  );
}
