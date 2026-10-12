import { useState, useCallback } from "react";
import {
  Upload,
  FileText,
  AlertTriangle,
  Loader2,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { SelectedFileRow } from "@/components/tools/resume-analysis/SelectedFileRow";
import { RESUME_TEXT_FILE_ACCEPT, getResumeTextFromFile, isResumeTextFile } from "@/lib/services/resume-text";
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
import { resumeService, type ResumeSummary } from "@/lib/services/resume-service";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";

interface ResumeSelectionStepProps {
  onResumeSelected: (resumeData: {
    resumeId?: string;
    resumeContent?: string;
    source: "existing" | "paste" | "file";
  }) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function ResumeSelectionStep({
  onResumeSelected,
  isLoading = false,
  error,
}: ResumeSelectionStepProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  // State for different input methods
  const [resumeContent, setResumeContent] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Fetch user's resumes if authenticated
  const { data: resumes = [] } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated,
  });

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
      if (droppedFile && isResumeTextFile(droppedFile)) {
        setFile(droppedFile);
      }
    },
    [],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && isResumeTextFile(selectedFile)) {
      setFile(selectedFile);
    }
  };

  const handleFileUpload = async () => {
    if (!file) return;

    try {
      const text = await getResumeTextFromFile(file);
      onResumeSelected({
        resumeContent: text,
        source: "file",
      });
    } catch (err) {
      console.error("Failed to process resume file:", err);
    }
  };

  // Content handling
  const handleContentSubmit = () => {
    if (!resumeContent.trim()) return;

    onResumeSelected({
      resumeContent: resumeContent.trim(),
      source: "paste",
    });
  };

  // Existing resume handling
  const handleExistingResumeSelect = () => {
    if (!selectedResumeId) return;

    onResumeSelected({
      resumeId: selectedResumeId,
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
          <User className="h-5 w-5 text-primary" aria-hidden="true" />
          {t("toolSteps.resume.stepTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs
          defaultValue={isAuthenticated ? "existing" : "paste"}
          className="w-full"
        >
          <TabsList className="grid h-auto w-full grid-cols-3">
            <TabsTrigger value="existing" className="min-h-11" disabled={!isAuthenticated}>
              {t("labels.myResumes")} {!isAuthenticated && t("labels.loginRequiredSuffix")}
            </TabsTrigger>
            <TabsTrigger value="paste" className="min-h-11">
              {t("toolSteps.job.tabPaste")}
            </TabsTrigger>
            <TabsTrigger value="upload" className="min-h-11">
              {t("labels.uploadFile")}
            </TabsTrigger>
          </TabsList>

          {/* Existing Resumes Tab */}
          <TabsContent value="existing" className="space-y-4">
            {isAuthenticated ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="resume-select">{t("labels.selectResume")}</Label>
                  <Select
                    value={selectedResumeId}
                    onValueChange={setSelectedResumeId}
                  >
                    <SelectTrigger id="resume-select" className="mt-2">
                      <SelectValue placeholder={t("toolSteps.resume.selectPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {resumes.filter((resume) => resume.id || (resume as any).Id).map((resume) => (
                        <SelectItem key={(resume.id || (resume as any).Id)!} value={(resume.id || (resume as any).Id)!}>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" aria-hidden="true" />
                            <div className="flex flex-col">
                              <span>{resume.title || t("labels.untitledResume")}</span>
                              {resume.description && (
                                <span className="text-xs text-muted-foreground">
                                  {resume.description}
                                </span>
                              )}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {resumes.length === 0 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("toolSteps.resume.noneFound")}
                    </p>
                  )}
                </div>
                <Button
                  onClick={handleExistingResumeSelect}
                  disabled={!selectedResumeId || isLoading}
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
                      {t("toolSteps.resume.useSelected")}
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  {t("toolSteps.resume.loginToSelect")}
                </p>
              </div>
            )}
          </TabsContent>

          {/* Copy & Paste Tab */}
          <TabsContent value="paste" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="resume-content">{t("toolSteps.resume.contentLabel")}</Label>
                <Textarea
                  id="resume-content"
                  placeholder={t("toolSteps.resume.contentPlaceholder")}
                  value={resumeContent}
                  onChange={(e) => setResumeContent(e.target.value)}
                  rows={10}
                  disabled={isLoading}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  {t("toolSteps.resume.contentHelp")}
                </p>
              </div>
              <Button
                onClick={handleContentSubmit}
                disabled={!resumeContent.trim() || isLoading}
                size="lg"
                className="w-full"
              >
                {t("toolSteps.resume.useContent")}
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
                  {t("toolSteps.resume.dropHere")}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("toolSteps.resume.fileTypes")}
                </p>
                <Input
                  type="file"
                  accept={RESUME_TEXT_FILE_ACCEPT}
                  onChange={handleFileSelect}
                  className="hidden"
                  id="resume-file-upload"
                  disabled={isLoading}
                />
                <Button variant="outline" className="min-h-11" asChild>
                  <label
                    htmlFor="resume-file-upload"
                    className="cursor-pointer"
                  >
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
                      {t("toolSteps.resume.useFile")}
                    </>
                  )}
                </Button>
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
