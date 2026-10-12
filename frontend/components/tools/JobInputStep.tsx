import { useState, useCallback, useMemo } from "react";
import {
  Upload,
  Link as LinkIcon,
  FileText,
  X,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { jobService, type JobSummary } from "@/lib/services/job-service";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SelectedFileRow } from "@/components/tools/resume-analysis/SelectedFileRow";

interface JobInputStepProps {
  onJobSelected: (jobData: {
    jobId?: string;
    jobContent?: string;
    source: "url" | "paste" | "file" | "existing";
  }) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function JobInputStep({
  onJobSelected,
  isLoading = false,
  error,
}: JobInputStepProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  // State for different input methods
  const [jobUrl, setJobUrl] = useState("");
  const [jobContent, setJobContent] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [showIframe, setShowIframe] = useState(false);

  // Fetch user's jobs if authenticated
  const { data: userJobs = [] } = useQuery({
    queryKey: ["user-jobs"],
    queryFn: () => jobService.getUserJobs(),
    enabled: isAuthenticated,
  });

  const allowedTypes = useMemo(
    () => [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ],
    [],
  );

  // URL handling
  const handleUrlLoad = async () => {
    if (!jobUrl.trim()) return;

    setIsLoadingUrl(true);
    setUrlError(null);

    try {
      // Try to extract job from URL
      const job = await jobService.extractJobFromUrl(jobUrl);
      onJobSelected({
        jobContent: job.description || JSON.stringify(job),
        source: "url",
      });
    } catch (err) {
      console.error("Failed to extract job from URL:", err);
      setUrlError(t("toolSteps.job.urlExtractFailed"));
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const handlePreviewUrl = () => {
    if (!jobUrl.trim()) return;
    setShowIframe(true);
    setUrlError(null);
  };

  const handleUseIframeContent = () => {
    // For iframe content, we'll still use the URL extraction API
    // since we can't directly access iframe content due to CORS
    handleUrlLoad();
  };

  // File handling
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

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && allowedTypes.includes(droppedFile.type)) {
        setFile(droppedFile);
      }
    },
    [allowedTypes],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && allowedTypes.includes(selectedFile.type)) {
      setFile(selectedFile);
    }
  };

  const handleFileUpload = async () => {
    if (!file) return;

    try {
      const job = await jobService.createJobFromFile(file);
      onJobSelected({
        jobContent: job.description || JSON.stringify(job),
        source: "file",
      });
    } catch (err) {
      console.error("Failed to process job file:", err);
    }
  };

  // Content handling
  const handleContentSubmit = () => {
    if (!jobContent.trim()) return;

    onJobSelected({
      jobContent: jobContent.trim(),
      source: "paste",
    });
  };

  // Existing job handling
  const handleExistingJobSelect = () => {
    if (!selectedJobId) return;

    onJobSelected({
      jobId: selectedJobId,
      source: "existing",
    });
  };

  const removeFile = () => {
    setFile(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
          {t("toolSteps.job.stepTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="url" className="w-full">
          <div className="w-full overflow-x-auto">
            <TabsList className="inline-flex h-auto w-max gap-1 sm:grid sm:w-full sm:grid-cols-4">
              <TabsTrigger value="url" className="min-h-11">
                {t("toolSteps.job.tabUrl")}
              </TabsTrigger>
              <TabsTrigger value="paste" className="min-h-11">
                {t("toolSteps.job.tabPaste")}
              </TabsTrigger>
              <TabsTrigger value="upload" className="min-h-11">
                {t("labels.uploadFile")}
              </TabsTrigger>
              <TabsTrigger value="existing" className="min-h-11" disabled={!isAuthenticated}>
                {t("toolSteps.job.tabMyJobs")} {!isAuthenticated && t("labels.loginRequiredSuffix")}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* URL Tab */}
          <TabsContent value="url" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="job-url">{t("toolSteps.job.urlLabel")}</Label>
                <div className="mt-2 flex flex-wrap gap-2 sm:flex-nowrap">
                  <Input
                    id="job-url"
                    type="url"
                    placeholder={t("toolSteps.job.urlPlaceholder")}
                    value={jobUrl}
                    onChange={(e) => {
                      setJobUrl(e.target.value);
                      setShowIframe(false);
                    }}
                    disabled={isLoading || isLoadingUrl}
                  />
                  <Button
                    onClick={handlePreviewUrl}
                    disabled={!jobUrl.trim() || isLoading || isLoadingUrl}
                    variant="outline"
                    className="min-h-11"
                  >
                    {t("actions.preview")}
                  </Button>
                  <Button
                    onClick={handleUrlLoad}
                    disabled={!jobUrl.trim() || isLoading || isLoadingUrl}
                    className="min-h-11 min-w-11"
                    aria-label={t("toolSteps.job.extractDetails")}
                  >
                    {isLoadingUrl ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <LinkIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("toolSteps.job.urlHelp")}
                </p>
              </div>

              {/* Iframe Preview */}
              {showIframe && jobUrl && (
                <div className="space-y-4">
                  <div className="border border-border rounded-xl overflow-hidden">
                    <div className="bg-muted p-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {t("toolSteps.job.previewTitle")}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="min-h-11"
                          onClick={handleUseIframeContent}
                          disabled={isLoading || isLoadingUrl}
                        >
                          {isLoadingUrl ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" aria-hidden="true" />
                          ) : null}
                          {t("toolSteps.job.extractDetails")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11 min-w-11"
                          onClick={() => setShowIframe(false)}
                          aria-label={t("toolSteps.job.closePreview")}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    <iframe
                      src={jobUrl}
                      className="w-full h-96 border-0"
                      title={t("toolSteps.job.previewTitle")}
                      sandbox="allow-same-origin allow-scripts"
                    />
                  </div>
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {t("toolSteps.job.previewHelp")}
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {urlError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{urlError}</AlertDescription>
                </Alert>
              )}
            </div>
          </TabsContent>

          {/* Copy & Paste Tab */}
          <TabsContent value="paste" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="job-content">{t("headings.jobDescription")}</Label>
                <Textarea
                  id="job-content"
                  placeholder={t("toolSteps.job.pastePlaceholder")}
                  value={jobContent}
                  onChange={(e) => setJobContent(e.target.value)}
                  rows={8}
                  disabled={isLoading}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  {t("toolSteps.job.pasteHelp")}
                </p>
              </div>
              <Button
                onClick={handleContentSubmit}
                disabled={!jobContent.trim() || isLoading}
                size="lg"
                className="w-full"
              >
                {t("toolSteps.job.useDescription")}
              </Button>
            </div>
          </TabsContent>

          {/* File Upload Tab */}
          <TabsContent value="upload" className="space-y-4">
            {!file ? (
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  isDragging
                    ? "border-primary bg-accent"
                    : "border-border bg-muted/40 hover:border-primary/50"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="h-12 w-12 mx-auto text-primary mb-4" aria-hidden="true" />
                <p className="text-lg font-medium mb-2">
                  {t("toolSteps.job.dropHere")}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("toolSteps.job.fileTypes")}
                </p>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="job-file-upload"
                  disabled={isLoading}
                />
                <Button variant="outline" className="min-h-11" asChild>
                  <label htmlFor="job-file-upload" className="cursor-pointer">
                    {t("actions.chooseFile")}
                  </label>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <SelectedFileRow file={file} onRemove={removeFile} disabled={isLoading} />
                <Button
                  onClick={handleFileUpload}
                  disabled={isLoading}
                  size="lg"
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      {t("toolSteps.common.processing")}
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                      {t("toolSteps.job.useFile")}
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Existing Jobs Tab */}
          <TabsContent value="existing" className="space-y-4">
            {isAuthenticated ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="job-select">{t("fields.selectJob.label")}</Label>
                  <Select
                    value={selectedJobId}
                    onValueChange={setSelectedJobId}
                  >
                    <SelectTrigger id="job-select" className="mt-2">
                      <SelectValue placeholder={t("toolSteps.job.selectPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {userJobs.filter((job) => job.id || (job as any).Id).map((job) => (
                        <SelectItem key={(job.id || (job as any).Id)!} value={(job.id || (job as any).Id)!}>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" aria-hidden="true" />
                            {job.title || t("toolSteps.job.untitled")} - {job.company}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleExistingJobSelect}
                  disabled={!selectedJobId || isLoading}
                  size="lg"
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      {t("status.loading")}
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                      {t("toolSteps.job.useSelected")}
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  {t("toolSteps.job.loginToSelect")}
                </p>
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
  );
}
