// "Add these skills to <resume|job>" card shown when the extraction ran
// against a saved entity. Presentational — the save flow lives in
// useSkillExtractor.

import { Briefcase, Check, FileText, Loader2, Plus } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SkillResultSource, SkillSaveState } from "./skill-extractor-shared";

interface SkillSaveToSourceCardProps {
  resultSource: SkillResultSource;
  skillCount: number;
  isSaving: boolean;
  saveState: SkillSaveState;
  onSave: () => void;
}

export function SkillSaveToSourceCard({
  resultSource,
  skillCount,
  isSaving,
  saveState,
  onSave,
}: SkillSaveToSourceCardProps) {
  const { t } = useTranslation();
  const isResume = resultSource.type === "resume";

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          {isResume ? (
            <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <Briefcase className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              <Trans
                i18nKey="skillExtractor.addToPrompt"
                values={{ label: resultSource.label }}
                components={{ hl: <span className="text-primary" /> }}
              />
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("skillExtractor.preservedNote")}
            </p>
          </div>
        </div>

        <Button
          onClick={onSave}
          disabled={isSaving || saveState.kind === "success" || skillCount === 0}
          size="lg"
          className="w-full"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              {t("skillExtractor.saving")}
            </>
          ) : saveState.kind === "success" ? (
            <>
              <Check className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("labels.saved")}
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              {isResume
                ? t("skillExtractor.addToResume", { count: skillCount })
                : t("skillExtractor.addToJob", { count: skillCount })}
            </>
          )}
        </Button>

        {saveState.kind === "success" && (
          <Alert>
            <AlertDescription className="text-sm">
              {saveState.added > 0
                ? t("skillExtractor.addedCount", { count: saveState.added })
                : t("skillExtractor.noNewSkills")}
              {saveState.skipped > 0
                ? ` — ${t("skillExtractor.alreadyPresent", { count: saveState.skipped })}`
                : ""}
              {saveState.removed && saveState.removed > 0
                ? ` · ${t("skillExtractor.cleanedDuplicates", { count: saveState.removed })}.`
                : "."}
            </AlertDescription>
          </Alert>
        )}
        {saveState.kind === "error" && (
          <Alert variant="destructive">
            <AlertDescription className="text-sm">
              {saveState.message}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
