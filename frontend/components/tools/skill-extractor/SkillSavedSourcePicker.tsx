// "My Jobs / My Resumes" tab body for the Skill Extractor: search box +
// filtered saved-entity Select. Presentational — state lives in
// useSkillExtractor.

import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ResumeSelectItem from "@/components/tools/ResumeSelectItem";
import type { SkillSourceType } from "@/components/SkillExtractionResults";
import type { ResumeSummary } from "@/lib/services/resume-service";
import type { JobSummary } from "@/lib/services/job-service";

interface SkillSavedSourcePickerProps {
  sourceType: SkillSourceType;
  savedSearch: string;
  onSavedSearchChange: (value: string) => void;
  selectedResumeId: string;
  onSelectedResumeIdChange: (value: string) => void;
  selectedJobId: string;
  onSelectedJobIdChange: (value: string) => void;
  filteredResumes: ResumeSummary[];
  filteredJobs: JobSummary[];
}

export function SkillSavedSourcePicker({
  sourceType,
  savedSearch,
  onSavedSearchChange,
  selectedResumeId,
  onSelectedResumeIdChange,
  selectedJobId,
  onSelectedJobIdChange,
  filteredResumes,
  filteredJobs,
}: SkillSavedSourcePickerProps) {
  const { t } = useTranslation();
  const isJob = sourceType === "job";
  const isEmpty = isJob ? filteredJobs.length === 0 : filteredResumes.length === 0;

  return (
    <div>
      <label htmlFor="skill-extract-search" className="text-sm font-medium mb-2 block">
        {isJob
          ? t("skillExtractor.searchSavedJobs")
          : t("skillExtractor.searchSavedResumes")}
      </label>
      <Input
        id="skill-extract-search"
        placeholder={
          isJob
            ? t("skillExtractor.searchJobsPlaceholder")
            : t("skillExtractor.searchResumesPlaceholder")
        }
        value={savedSearch}
        onChange={(e) => onSavedSearchChange(e.target.value)}
        className="mb-3"
      />
      <Select
        value={isJob ? selectedJobId : selectedResumeId}
        onValueChange={(value) => {
          if (isJob) onSelectedJobIdChange(value);
          else onSelectedResumeIdChange(value);
        }}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              isJob
                ? t("skillExtractor.chooseJob")
                : t("toolSteps.resume.selectPlaceholder")
            }
          />
        </SelectTrigger>
        <SelectContent>
          {isJob
            ? filteredJobs.map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.title}
                  {job.company ? ` — ${job.company}` : ""}
                </SelectItem>
              ))
            : filteredResumes.map((resume) => (
                <ResumeSelectItem
                  key={(resume.id as string | undefined)!}
                  resume={resume as any}
                />
              ))}
          {isEmpty && (
            <div className="px-2 py-3 text-sm text-muted-foreground text-center">
              {savedSearch
                ? t("skillExtractor.noMatches")
                : isJob
                  ? t("skillExtractor.noSavedJobs")
                  : t("skillExtractor.noSavedResumes")}
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
