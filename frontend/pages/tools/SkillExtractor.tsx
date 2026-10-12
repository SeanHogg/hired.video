// /tools/skill-extractor — extract skills from a job description or
// resume (paste / upload / saved entity) and optionally write them back
// to the saved source.
//
// State + orchestration: components/tools/skill-extractor/useSkillExtractor.
// Presentational pieces + pure helpers live alongside it.

import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ToolShell } from "@/components/tools/ToolShell";
import { useSkillExtractor } from "@/components/tools/skill-extractor/useSkillExtractor";
import { SkillSourceInputCard } from "@/components/tools/skill-extractor/SkillSourceInputCard";
import { SkillExtractorResultPanel } from "@/components/tools/skill-extractor/SkillExtractorResultPanel";
import {
  SkillExtractorEmptyStateCard,
  SkillExtractorFreeCard,
} from "@/components/tools/skill-extractor/SkillExtractorSideCards";
import { SKILL_EXTRACTOR_TOOL_ID } from "@/components/tools/skill-extractor/skill-extractor-shared";

export default function SkillExtractor() {
  const { t } = useTranslation();
  const s = useSkillExtractor();

  return (
    <ToolShell
      toolId={SKILL_EXTRACTOR_TOOL_ID}
      header={{
        icon: <Sparkles className="h-6 w-6" aria-hidden="true" />,
        title: t("tools.card.skill-extractor.title"),
        description: t("tools.skillExtractor.subtitle"),
        tier: "free",
      }}
      authOverlay={{
        show: s.showAuthOverlay,
        message: t("skillExtractor.authOverlay"),
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Left — input */}
        <div className="space-y-6">
          <SkillSourceInputCard
            isAuthenticated={s.isAuthenticated}
            isExtracting={s.isExtracting}
            error={s.error}
            sourceType={s.sourceType}
            onSourceTypeChange={s.handleSourceTypeChange}
            savedSearch={s.savedSearch}
            onSavedSearchChange={s.setSavedSearch}
            selectedResumeId={s.selectedResumeId}
            onSelectedResumeIdChange={s.setSelectedResumeId}
            selectedJobId={s.selectedJobId}
            onSelectedJobIdChange={s.setSelectedJobId}
            filteredResumes={s.filteredResumes}
            filteredJobs={s.filteredJobs}
            pastedText={s.pastedText}
            onPastedTextChange={s.setPastedText}
            file={s.file}
            onFileChange={s.handleFileChange}
            onRemoveFile={s.removeFile}
            onSavedSubmit={s.handleSavedExtraction}
            onTextSubmit={s.handleTextExtraction}
            onFileSubmit={s.handleFileExtraction}
          />
          <SkillExtractorFreeCard />
        </div>

        {/* Right — results */}
        <div className="space-y-6">
          {s.result ? (
            <SkillExtractorResultPanel
              result={s.result}
              resultSource={s.resultSource}
              previewResume={s.previewResume}
              onPreviewResumeUpdated={s.refreshPreviewResume}
              isSaving={s.isSaving}
              saveState={s.saveState}
              onSave={s.handleSaveSkillsToSource}
              onReset={s.reset}
            />
          ) : (
            !s.isExtracting && <SkillExtractorEmptyStateCard />
          )}
        </div>
      </div>
    </ToolShell>
  );
}
