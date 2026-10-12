// Right-hand results column for /tools/skill-extractor once a result
// exists: grouped skills, live SkillNetwork preview (saved-resume runs),
// the save-back card, and the "extract another / open source" actions.

import { Link } from "react-router-dom";
import { publicJobPath, publicResumePath } from "@shared/public-paths";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  SkillExtractionResults,
  type SkillExtractionResult,
} from "@/components/SkillExtractionResults";
import SkillNetwork from "@/components/SkillNetwork";
import { SkillSaveToSourceCard } from "./SkillSaveToSourceCard";
import type {
  SkillPreviewResume,
  SkillResultSource,
  SkillSaveState,
} from "./skill-extractor-shared";

interface SkillExtractorResultPanelProps {
  result: SkillExtractionResult;
  resultSource: SkillResultSource | null;
  previewResume: SkillPreviewResume | null;
  onPreviewResumeUpdated: (id: string) => Promise<void>;
  isSaving: boolean;
  saveState: SkillSaveState;
  onSave: () => void;
  onReset: () => void;
}

export function SkillExtractorResultPanel({
  result,
  resultSource,
  previewResume,
  onPreviewResumeUpdated,
  isSaving,
  saveState,
  onSave,
  onReset,
}: SkillExtractorResultPanelProps) {
  const { t } = useTranslation();

  return (
    <>
      <SkillExtractionResults result={result} />

      {previewResume && (
        <SkillNetwork
          resumeData={previewResume.content}
          resumeId={previewResume.id}
          ownerUserId={previewResume.userId}
          title={t("skillExtractor.liveSkillNetwork")}
          onResumeUpdated={() => onPreviewResumeUpdated(previewResume.id)}
        />
      )}

      {resultSource && (
        <SkillSaveToSourceCard
          resultSource={resultSource}
          skillCount={result.skills.length}
          isSaving={isSaving}
          saveState={saveState}
          onSave={onSave}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11" onClick={onReset}>
          {t("skillExtractor.extractAnother")}
        </Button>
        {resultSource && (
          <Link
            to={
              resultSource.type === "resume"
                ? publicResumePath(resultSource.id)
                : publicJobPath(resultSource.id)
            }
          >
            <Button variant="outline" className="min-h-11">
              {resultSource.type === "resume"
                ? t("skillExtractor.openResume")
                : t("skillExtractor.openJob")}
            </Button>
          </Link>
        )}
      </div>
    </>
  );
}
