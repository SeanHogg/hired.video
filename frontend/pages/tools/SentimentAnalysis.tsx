import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Upload,
  Loader2,
  X,
  AlertTriangle,
  Heart,
  FileText,
  Lightbulb,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SentimentScoreDisplay from "@/components/tools/SentimentScoreDisplay";
import SentimentRecommendations from "@/components/tools/SentimentRecommendations";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useAuth } from "@/lib/auth";
import { sentimentService } from "@/lib/services/sentiment-service";
import { RESUME_TEXT_FILE_ACCEPT, isResumeTextFile } from "@/lib/services/resume-text";
import { appendDiagnosticReference } from "@/lib/llm-diagnostic";
import { useToolRunRecorder } from "@/lib/tools/use-tool-run-recorder";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { ToolShell } from "@/components/tools/ToolShell";
import ResumeSelectItem from "@/components/tools/ResumeSelectItem";
import { useUserResumes } from "@/hooks/queries/use-resumes";
import { useSavedJobs } from "@/hooks/queries/use-jobs";

export default function SentimentAnalysis() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();

  // State for file upload
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [sentimentScore, setSentimentScore] = useState<number | null>(null);

  // State for existing resume selection — preselected from a deep-link
  // when the user clicked "Run Tool" on a resume's action menu.
  const { resumeId: deepLinkResumeId } = useToolEntityParams();
  const [selectedResumeId, setSelectedResumeId] = useState<string>(deepLinkResumeId ?? "");
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  const { recordRun } = useToolRunRecorder("sentiment-analysis");

  // Single source of truth for what we persist on a sentiment run. The
  // three handler paths (file / saved job / saved resume) all pipe their
  // raw 0-100 score through this so the history sheet, Copy Report, and
  // sparkline see a consistent shape — and so the registry's `runSentiment`
  // and this page can't drift apart.
  const recordSentimentRun = (score: number, refs: { resumeId?: string; jobId?: string }) => {
    const interpretation = sentimentService.interpretSentiment(score);
    void recordRun({
      score,
      result: {
        overallScore: score,
        grade: interpretation.label,
        summary: interpretation.description,
        recommendations: interpretation.recommendations.map((title) => ({ title })),
        raw: { score, interpretation },
      },
      summary: t("messages.sentiment.runSummary", {
        score: Math.round(score),
        label: interpretation.label,
      }),
      ...refs,
    });
  };

  // Persist the selected resume across the anonymous → authenticated bounce so
  // the user doesn't have to re-pick after signing in. File objects can't be
  // serialized, so only the resume selection is snapshotted.
  const { restored, snapshot, clear } = usePendingToolInput<{
    selectedResumeId?: string;
  }>();

  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    if (restored.selectedResumeId) setSelectedResumeId(restored.selectedResumeId);
  }, [restored, isAuthenticated]);

  // Fetch user's resumes if authenticated
  const { data: resumes = [] } = useUserResumes();

  // Fetch user's saved jobs for the "Saved Jobs" tab.
  const { data: savedJobs = [] } = useSavedJobs();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setError(null);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && isResumeTextFile(droppedFile)) {
        setFile(droppedFile);
      } else {
        setError(t("errors.uploadResumeFile"));
      }
    },
    [t],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setError(null);

    if (selectedFile && isResumeTextFile(selectedFile)) {
      setFile(selectedFile);
    } else {
      setError(t("errors.uploadResumeFile"));
    }
  };

  const handleFileAnalysis = async () => {
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
    setSentimentScore(null);

    try {
      const score = await sentimentService.analyzeFileSentiment(file);
      setSentimentScore(score);
      recordSentimentRun(score, {});
      clear();
    } catch (err) {
      console.error("Sentiment analysis failed:", err);
      setError(appendDiagnosticReference(t("errors.sentiment.analyzeFailed"), err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleJobAnalysis = async () => {
    if (!selectedJobId) return;

    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setSentimentScore(null);

    try {
      const score = await sentimentService.analyzeJobSentiment(selectedJobId);
      setSentimentScore(score);
      recordSentimentRun(score, { jobId: selectedJobId });
    } catch (err) {
      console.error("Job sentiment analysis failed:", err);
      setError(appendDiagnosticReference(t("errors.sentiment.analyzeJobFailed"), err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleResumeAnalysis = async () => {
    if (!selectedResumeId) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      snapshot({ selectedResumeId });
      setShowAuthOverlay(true);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setSentimentScore(null);

    try {
      const score =
        await sentimentService.analyzeResumeSentiment(selectedResumeId);
      setSentimentScore(score);
      recordSentimentRun(score, { resumeId: selectedResumeId });
      clear();
    } catch (err) {
      console.error("Resume sentiment analysis failed:", err);
      setError(appendDiagnosticReference(t("errors.sentiment.analyzeResumeFailed"), err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    setSentimentScore(null);
  };

  const resetAnalysis = () => {
    setFile(null);
    setSelectedResumeId("");
    setError(null);
    setSentimentScore(null);
  };

  const getFileIcon = (file: File) => {
    if (file.type.includes("pdf")) return "📄";
    if (file.type.includes("word")) return "📝";
    if (file.type.includes("text")) return "📄";
    return "📄";
  };

  return (
    <ToolShell
      toolId="sentiment-analysis"
      header={{
        icon: <Heart className="h-6 w-6" />,
        title: t("headings.sentiment.toolTitle"),
        description: t("messages.sentiment.toolDescription"),
      }}
      authOverlay={{
        show: showAuthOverlay,
        message: t("messages.signInToRunToolKeepInputs"),
      }}
      breadcrumbLabel={t("headings.sentiment.breadcrumb")}
    >
            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column - Analysis Tool */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      {t("headings.sentiment.cardTitle")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs
                      defaultValue={isAuthenticated ? "existing" : "upload"}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="upload">{t("labels.uploadFile")}</TabsTrigger>
                        <TabsTrigger
                          value="existing"
                          disabled={!isAuthenticated}
                        >
                          {t("headings.myResumes")} {!isAuthenticated && t("labels.loginRequiredParen")}
                        </TabsTrigger>
                        <TabsTrigger
                          value="job"
                          disabled={!isAuthenticated}
                        >
                          {t("labels.sentiment.savedJobsTab")} {!isAuthenticated && t("labels.loginRequiredParen")}
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="upload" className="space-y-4">
                        {!file ? (
                          <div
                            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                              isDragging
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            }`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                          >
                            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                            <p className="text-lg font-medium mb-2">
                              {t("messages.sentiment.dropResume")}
                            </p>
                            <p className="text-sm text-muted-foreground mb-4">
                              {t("messages.sentiment.supportedFormats")}
                            </p>
                            <Input
                              type="file"
                              accept={RESUME_TEXT_FILE_ACCEPT}
                              onChange={handleFileSelect}
                              className="hidden"
                              id="file-upload"
                            />
                            <Button variant="outline" asChild>
                              <label
                                htmlFor="file-upload"
                                className="cursor-pointer"
                              >
                                {t("actions.chooseFile")}
                              </label>
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="border rounded-lg p-4 bg-muted/30">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl">
                                    {getFileIcon(file)}
                                  </span>
                                  <div>
                                    <p className="font-medium">{file.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {(file.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={removeFile}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <Button
                              onClick={handleFileAnalysis}
                              disabled={isAnalyzing}
                              className="w-full"
                            >
                              {isAnalyzing ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  {t("status.analyzing")}
                                </>
                              ) : (
                                <>
                                  <Heart className="mr-2 h-4 w-4" />
                                  {t("actions.sentiment.analyze")}
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="existing" className="space-y-4">
                        {isAuthenticated ? (
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="resume-select">
                                {t("headings.selectResume")}
                              </Label>
                              <Select
                                value={selectedResumeId}
                                onValueChange={setSelectedResumeId}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder={t("fields.sentiment.resumeSelect.placeholder")} />
                                </SelectTrigger>
                                <SelectContent>
                                  {resumes.filter((resume) => resume.Id || resume.id).map((resume) => (
                                    <ResumeSelectItem
                                      key={(resume.id as string | undefined)!}
                                      resume={resume as any}
                                    />
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              onClick={handleResumeAnalysis}
                              disabled={!selectedResumeId || isAnalyzing}
                              className="w-full"
                            >
                              {isAnalyzing ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  {t("status.analyzing")}
                                </>
                              ) : (
                                <>
                                  <Heart className="mr-2 h-4 w-4" />
                                  {t("actions.sentiment.analyze")}
                                </>
                              )}
                            </Button>
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <p className="text-muted-foreground mb-4">
                              {t("messages.sentiment.loginToAnalyzeResumes")}
                            </p>
                            <Link to="/login">
                              <Button>{t("actions.logIn")}</Button>
                            </Link>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="job" className="space-y-4">
                        {isAuthenticated ? (
                          savedJobs.length === 0 ? (
                            <div className="text-center py-8">
                              <p className="text-muted-foreground">
                                {t("messages.sentiment.noSavedJobs")}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="job-select">{t("fields.selectJob.label")}</Label>
                                <Select
                                  value={selectedJobId}
                                  onValueChange={setSelectedJobId}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder={t("fields.sentiment.jobSelect.placeholder")} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {savedJobs.map((job: any) => (
                                      <SelectItem key={job.id} value={job.id}>
                                        {job.title}
                                        {job.company ? ` — ${job.company}` : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                onClick={handleJobAnalysis}
                                disabled={!selectedJobId || isAnalyzing}
                                className="w-full"
                              >
                                {isAnalyzing ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t("status.analyzing")}
                                  </>
                                ) : (
                                  <>
                                    <Heart className="mr-2 h-4 w-4" />
                                    {t("actions.sentiment.analyze")}
                                  </>
                                )}
                              </Button>
                            </div>
                          )
                        ) : (
                          <div className="text-center py-8">
                            <p className="text-muted-foreground mb-4">
                              {t("messages.sentiment.loginToAnalyzeJobs")}
                            </p>
                            <Link to="/login">
                              <Button>{t("actions.logIn")}</Button>
                            </Link>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>

                    {/* Error Display */}
                    {error && (
                      <Alert variant="destructive" className="mt-4">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Results */}
              <div className="space-y-6">
                {sentimentScore !== null ? (
                  <>
                    <SentimentScoreDisplay score={sentimentScore} />
                    <SentimentRecommendations score={sentimentScore} />
                    <div className="flex gap-3">
                      <Button
                        onClick={resetAnalysis}
                        variant="outline"
                        className="flex-1"
                      >
                        {t("actions.sentiment.analyzeAnother")}
                      </Button>
                      {isAuthenticated && (
                        <Link to="/resumes" className="flex-1">
                          <Button className="w-full">{t("actions.viewMyResumes")}</Button>
                        </Link>
                      )}
                    </div>
                  </>
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">
                        {t("headings.sentiment.readyToAnalyze")}
                      </h3>
                      <p className="text-muted-foreground">
                        {t("messages.sentiment.readyToAnalyzeBody")}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* SEO Content Section */}
            <div className="space-y-12 mt-16">
              {/* What is Resume Sentiment Analysis */}
              <section className="space-y-6">
                <h2 className="text-3xl font-bold text-center">
                  {t("headings.sentiment.whatIs")}
                </h2>
                <div className="prose prose-lg max-w-none text-muted-foreground">
                  <p className="text-center text-xl leading-relaxed">
                    {t("messages.sentiment.whatIsBody")}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                  <Card className="text-center">
                    <CardContent className="p-6">
                      <div className="w-12 h-12 bg-accent rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Heart className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-2">
                        {t("headings.aiPoweredAnalysis")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("messages.sentiment.feature.aiPoweredBody")}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="text-center">
                    <CardContent className="p-6">
                      <div className="w-12 h-12 bg-brand-green/15 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <FileText className="h-6 w-6 text-brand-green-text" />
                      </div>
                      <h3 className="font-semibold mb-2">{t("headings.sentiment.instantResults")}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t("messages.sentiment.feature.instantResultsBody")}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="text-center">
                    <CardContent className="p-6">
                      <div className="w-12 h-12 bg-accent rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Lightbulb className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-2">
                        {t("headings.actionableInsights")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("messages.sentiment.feature.actionableBody")}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* Why Resume Sentiment Matters */}
              <section className="space-y-6">
                <h2 className="text-3xl font-bold text-center">
                  {t("headings.sentiment.whyMatters")}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold">
                      {t("headings.sentiment.firstImpressions")}
                    </h3>
                    <p className="text-muted-foreground">
                      {t("messages.sentiment.firstImpressionsBody")}
                    </p>

                    <h3 className="text-xl font-semibold">
                      {t("headings.sentiment.standOut")}
                    </h3>
                    <p className="text-muted-foreground">
                      {t("messages.sentiment.standOutBody")}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold">
                      {t("headings.sentiment.psychologicalImpact")}
                    </h3>
                    <p className="text-muted-foreground">
                      {t("messages.sentiment.psychologicalImpactBody")}
                    </p>

                    <h3 className="text-xl font-semibold">{t("headings.sentiment.atsOptimization")}</h3>
                    <p className="text-muted-foreground">
                      {t("messages.sentiment.atsOptimizationBody")}
                    </p>
                  </div>
                </div>
              </section>

              {/* How It Works */}
              <section className="space-y-6">
                <h2 className="text-3xl font-bold text-center">
                  {t("headings.sentiment.howItWorks")}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl font-bold text-primary">1</span>
                    </div>
                    <h3 className="font-semibold mb-2">{t("actions.uploadResumeAction")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("messages.sentiment.step.uploadBody")}
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl font-bold text-primary">2</span>
                    </div>
                    <h3 className="font-semibold mb-2">{t("headings.sentiment.step.aiProcessing")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("messages.sentiment.step.aiProcessingBody")}
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl font-bold text-primary">3</span>
                    </div>
                    <h3 className="font-semibold mb-2">{t("headings.sentiment.step.scoreGeneration")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("messages.sentiment.step.scoreGenerationBody")}
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl font-bold text-primary">4</span>
                    </div>
                    <h3 className="font-semibold mb-2">{t("headings.sentiment.step.getRecommendations")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("messages.sentiment.step.getRecommendationsBody")}
                    </p>
                  </div>
                </div>
              </section>

              {/* Benefits Section */}
              <section className="space-y-6">
                <h2 className="text-3xl font-bold text-center">
                  {t("headings.sentiment.benefits")}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3 text-brand-green-text">
                        {t("headings.sentiment.benefit.interviewChances")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("messages.sentiment.benefit.interviewChancesBody")}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3 text-primary">
                        {t("headings.sentiment.benefit.atsRankings")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("messages.sentiment.benefit.atsRankingsBody")}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3 text-primary">
                        {t("headings.sentiment.benefit.buildConfidence")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("messages.sentiment.benefit.buildConfidenceBody")}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3 text-amber-600">
                        {t("headings.sentiment.benefit.saveTime")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("messages.sentiment.benefit.saveTimeBody")}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3 text-destructive">
                        {t("headings.sentiment.benefit.competitiveAdvantage")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("messages.sentiment.benefit.competitiveAdvantageBody")}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3 text-primary">
                        {t("headings.sentiment.benefit.dataDriven")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("messages.sentiment.benefit.dataDrivenBody")}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* FAQ Section */}
              <section className="space-y-6">
                <h2 className="text-3xl font-bold text-center">
                  {t("headings.faq")}
                </h2>
                <div className="space-y-4">
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-2">
                        {t("headings.sentiment.faq.goodScore")}
                      </h3>
                      <p className="text-muted-foreground">
                        {t("messages.sentiment.faq.goodScoreBody")}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-2">
                        {t("headings.sentiment.faq.accuracy")}
                      </h3>
                      <p className="text-muted-foreground">
                        {t("messages.sentiment.faq.accuracyBody")}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-2">
                        {t("headings.sentiment.faq.multipleResumes")}
                      </h3>
                      <p className="text-muted-foreground">
                        {t("messages.sentiment.faq.multipleResumesBody")}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-2">
                        {t("headings.sentiment.faq.fileFormats")}
                      </h3>
                      <p className="text-muted-foreground">
                        {t("messages.sentiment.faq.fileFormatsBody")}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-2">
                        {t("headings.sentiment.faq.dataSecure")}
                      </h3>
                      <p className="text-muted-foreground">
                        {t("messages.sentiment.faq.dataSecureBody")}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* Call to Action */}
              <section className="text-center space-y-6 p-8 rounded-2xl bg-accent/50">
                <h2 className="text-3xl font-bold">
                  {t("headings.sentiment.ctaTitle")}
                </h2>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                  {t("messages.sentiment.ctaBody")}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button
                    size="lg"
                    onClick={() =>
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }
                  >
                    <Heart className="mr-2 h-5 w-5" />
                    {t("actions.sentiment.analyzeNow")}
                  </Button>
                  <Link to="/signup">
                    <Button size="lg" variant="outline">
                      {t("actions.createFreeAccount")}
                    </Button>
                  </Link>
                </div>
              </section>
            </div>
    </ToolShell>
  );
}
