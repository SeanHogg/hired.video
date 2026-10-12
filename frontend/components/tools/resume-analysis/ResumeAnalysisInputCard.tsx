// Input card for ResumeAnalysisToolPage: Paste Text / Upload File /
// My Resumes tabs, optional Job Description field, submit button and
// error alert. Presentational — all state lives in the page.

import type { ChangeEvent } from "react";
import { Loader2, Upload, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import ResumeSelectItem from "@/components/tools/ResumeSelectItem";
import type { ResumeSummary } from "@/lib/services/resume-service";
import { RESUME_TEXT_FILE_ACCEPT } from "@/lib/services/resume-text";

interface ResumeAnalysisInputCardProps {
  title: string;
  isAuthenticated: boolean;
  isRunning: boolean;
  submit: { label: string; loadingLabel: string; icon: LucideIcon };
  error: string | null;
  resumes: ResumeSummary[] | undefined;
  resumeText: string;
  onResumeTextChange: (value: string) => void;
  file: File | null;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: () => void;
  selectedResumeId: string;
  onSelectedResumeIdChange: (value: string) => void;
  showJobDescription?: boolean;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  onTextSubmit: () => void;
  onFileSubmit: () => void;
  onResumeSubmit: () => void;
}

export function ResumeAnalysisInputCard({
  title,
  isAuthenticated,
  isRunning,
  submit,
  error,
  resumes,
  resumeText,
  onResumeTextChange,
  file,
  onFileChange,
  onRemoveFile,
  selectedResumeId,
  onSelectedResumeIdChange,
  showJobDescription,
  jobDescription,
  onJobDescriptionChange,
  onTextSubmit,
  onFileSubmit,
  onResumeSubmit,
}: ResumeAnalysisInputCardProps) {
  const { t } = useTranslation();

  const submitButton = (onClick: () => void, disabled: boolean) => (
    <Button onClick={onClick} disabled={disabled} size="lg" className="w-full">
      {isRunning ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
          {submit.loadingLabel}
        </>
      ) : (
        <>
          <submit.icon className="h-4 w-4 mr-2" aria-hidden="true" />
          {submit.label}
        </>
      )}
    </Button>
  );

  const jobDescriptionField = showJobDescription ? (
    <div>
      <label htmlFor="resume-analysis-jd" className="text-sm font-medium mb-2 block">
        {t("fields.jobDescriptionOptional.label")}
      </label>
      <Textarea
        id="resume-analysis-jd"
        placeholder={t("toolSteps.analysis.jobDescriptionPlaceholder")}
        value={jobDescription}
        onChange={(e) => onJobDescriptionChange(e.target.value)}
        className="min-h-[100px]"
      />
    </div>
  ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={isAuthenticated ? "existing" : "text"} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="text" className="min-h-11">
              {t("labels.pasteText")}
            </TabsTrigger>
            <TabsTrigger value="upload" className="min-h-11">
              {t("labels.uploadFile")}
            </TabsTrigger>
            <TabsTrigger value="existing" className="min-h-11" disabled={!isAuthenticated}>
              {t("labels.myResumes")} {!isAuthenticated && t("labels.loginRequiredSuffix")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="space-y-4">
            <div>
              <label htmlFor="resume-analysis-text" className="text-sm font-medium mb-2 block">
                {t("fields.resumeText.label")}
              </label>
              <Textarea
                id="resume-analysis-text"
                placeholder={t("fields.resumeText.placeholder")}
                value={resumeText}
                onChange={(e) => onResumeTextChange(e.target.value)}
                className="min-h-[150px]"
              />
            </div>
            {jobDescriptionField}
            {submitButton(onTextSubmit, isRunning || !resumeText.trim())}
          </TabsContent>

          <TabsContent value="upload" className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">{t("labels.uploadResumeFile")}</p>
              <div className="border-2 border-dashed border-border bg-muted/40 rounded-xl p-6 text-center">
                <input
                  type="file"
                  onChange={onFileChange}
                  accept={RESUME_TEXT_FILE_ACCEPT}
                  className="hidden"
                  id="resume-upload"
                />
                <label htmlFor="resume-upload" className="cursor-pointer block">
                  <Upload className="h-8 w-8 mx-auto text-primary mb-2" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">{t("messages.clickToUpload")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("messages.uploadFileHelpExtended")}
                  </p>
                </label>
              </div>
            </div>

            {file && (
              <div className="flex items-center justify-between gap-2 p-3 bg-muted rounded-xl">
                <span className="text-sm font-medium truncate">{file.name}</span>
                <Button variant="ghost" size="sm" className="min-h-11" onClick={onRemoveFile}>
                  {t("actions.remove")}
                </Button>
              </div>
            )}

            {jobDescriptionField}
            {submitButton(onFileSubmit, isRunning || !file)}
          </TabsContent>

          <TabsContent value="existing" className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">{t("labels.selectResume")}</p>
              <Select value={selectedResumeId} onValueChange={onSelectedResumeIdChange}>
                <SelectTrigger aria-label={t("labels.selectResume")}>
                  <SelectValue placeholder={t("fields.interviewQuestions.chooseResume")} />
                </SelectTrigger>
                <SelectContent>
                  {resumes
                    ?.filter((r) => r.Id || r.id)
                    .map((r) => (
                      <ResumeSelectItem
                        key={(r.id as string | undefined)!}
                        resume={r as any}
                      />
                    ))}
                </SelectContent>
              </Select>
            </div>

            {jobDescriptionField}
            {submitButton(onResumeSubmit, isRunning || !selectedResumeId)}
          </TabsContent>
        </Tabs>

        {error && (
          <Alert className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
