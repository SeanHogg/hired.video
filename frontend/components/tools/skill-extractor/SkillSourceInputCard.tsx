// Left-hand input card for /tools/skill-extractor: job/resume source
// toggle, Saved / Paste / Upload tabs, and the error alert.
// Presentational — all state lives in useSkillExtractor.

import type { ChangeEvent } from "react";
import { Briefcase, FileText, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { SkillSourceType } from "@/components/SkillExtractionResults";
import type { ResumeSummary } from "@/lib/services/resume-service";
import type { JobSummary } from "@/lib/services/job-service";
import { RESUME_TEXT_FILE_ACCEPT } from "@/lib/services/resume-text";
import { ExtractSkillsButton } from "./ExtractSkillsButton";
import { SkillSavedSourcePicker } from "./SkillSavedSourcePicker";

interface SkillSourceInputCardProps {
  isAuthenticated: boolean;
  isExtracting: boolean;
  error: string | null;
  sourceType: SkillSourceType;
  onSourceTypeChange: (next: SkillSourceType) => void;
  savedSearch: string;
  onSavedSearchChange: (value: string) => void;
  selectedResumeId: string;
  onSelectedResumeIdChange: (value: string) => void;
  selectedJobId: string;
  onSelectedJobIdChange: (value: string) => void;
  filteredResumes: ResumeSummary[];
  filteredJobs: JobSummary[];
  pastedText: string;
  onPastedTextChange: (value: string) => void;
  file: File | null;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: () => void;
  onSavedSubmit: () => void;
  onTextSubmit: () => void;
  onFileSubmit: () => void;
}

export function SkillSourceInputCard({
  isAuthenticated,
  isExtracting,
  error,
  sourceType,
  onSourceTypeChange,
  savedSearch,
  onSavedSearchChange,
  selectedResumeId,
  onSelectedResumeIdChange,
  selectedJobId,
  onSelectedJobIdChange,
  filteredResumes,
  filteredJobs,
  pastedText,
  onPastedTextChange,
  file,
  onFileChange,
  onRemoveFile,
  onSavedSubmit,
  onTextSubmit,
  onFileSubmit,
}: SkillSourceInputCardProps) {
  const { t } = useTranslation();
  const isJob = sourceType === "job";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" aria-hidden="true" />
          {t("skillExtractor.sourceTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium mb-2">
            {t("skillExtractor.whatAnalyzing")}
          </p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("skillExtractor.whatAnalyzing")}>
            <Button
              type="button"
              variant={isJob ? "default" : "outline"}
              onClick={() => onSourceTypeChange("job")}
              aria-pressed={isJob}
              className="min-h-11 justify-start"
            >
              <Briefcase className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("headings.jobDescription")}
            </Button>
            <Button
              type="button"
              variant={sourceType === "resume" ? "default" : "outline"}
              onClick={() => onSourceTypeChange("resume")}
              aria-pressed={sourceType === "resume"}
              className="min-h-11 justify-start"
            >
              <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("labels.resume")}
            </Button>
          </div>
        </div>

        <Tabs
          defaultValue={isAuthenticated ? "saved" : "text"}
          className="w-full"
        >
          <TabsList className="grid h-auto w-full grid-cols-3">
            <TabsTrigger value="saved" className="min-h-11" disabled={!isAuthenticated}>
              {isJob ? t("toolSteps.job.tabMyJobs") : t("labels.myResumes")}
              {!isAuthenticated && ` ${t("skillExtractor.loginSuffix")}`}
            </TabsTrigger>
            <TabsTrigger value="text" className="min-h-11">
              {t("labels.pasteText")}
            </TabsTrigger>
            <TabsTrigger value="upload" className="min-h-11">
              {t("labels.uploadFile")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="saved" className="space-y-4">
            <SkillSavedSourcePicker
              sourceType={sourceType}
              savedSearch={savedSearch}
              onSavedSearchChange={onSavedSearchChange}
              selectedResumeId={selectedResumeId}
              onSelectedResumeIdChange={onSelectedResumeIdChange}
              selectedJobId={selectedJobId}
              onSelectedJobIdChange={onSelectedJobIdChange}
              filteredResumes={filteredResumes}
              filteredJobs={filteredJobs}
            />
            <ExtractSkillsButton
              onClick={onSavedSubmit}
              disabled={isExtracting || (isJob ? !selectedJobId : !selectedResumeId)}
              isExtracting={isExtracting}
            />
          </TabsContent>

          <TabsContent value="text" className="space-y-4">
            <div>
              <label htmlFor="skill-extract-text" className="text-sm font-medium mb-2 block">
                {isJob ? t("headings.jobDescription") : t("fields.resumeText.label")}
              </label>
              <Textarea
                id="skill-extract-text"
                placeholder={
                  isJob
                    ? t("skillExtractor.pasteJobPlaceholder")
                    : t("fields.resumeText.placeholder")
                }
                value={pastedText}
                onChange={(e) => onPastedTextChange(e.target.value)}
                className="min-h-[220px]"
              />
            </div>
            <ExtractSkillsButton
              onClick={onTextSubmit}
              disabled={isExtracting || !pastedText.trim()}
              isExtracting={isExtracting}
            />
          </TabsContent>

          <TabsContent value="upload" className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">
                {isJob
                  ? t("skillExtractor.uploadJobFile")
                  : t("labels.uploadResumeFile")}
              </p>
              <div className="border-2 border-dashed border-border bg-muted/40 rounded-xl p-6 text-center">
                <input
                  type="file"
                  onChange={onFileChange}
                  accept={RESUME_TEXT_FILE_ACCEPT}
                  className="hidden"
                  id="skill-extract-upload"
                />
                <label
                  htmlFor="skill-extract-upload"
                  className="cursor-pointer block"
                >
                  <Upload className="h-8 w-8 mx-auto text-primary mb-2" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    {t("messages.clickToUpload")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("messages.uploadFileHelpExtended")}
                  </p>
                </label>
              </div>
            </div>

            {file && (
              <div className="flex items-center justify-between gap-2 p-3 bg-muted rounded-xl">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-sm font-medium truncate">
                    {file.name}
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="min-h-11" onClick={onRemoveFile}>
                  {t("actions.remove")}
                </Button>
              </div>
            )}

            <ExtractSkillsButton
              onClick={onFileSubmit}
              disabled={isExtracting || !file}
              isExtracting={isExtracting}
            />
          </TabsContent>
        </Tabs>

        {error && (
          <Alert>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
