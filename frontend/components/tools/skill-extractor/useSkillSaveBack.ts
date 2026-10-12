// Save-back half of /tools/skill-extractor: writes extracted skills into
// the saved resume/job the extraction ran against, and keeps the
// right-pane SkillNetwork preview resume in sync.
//
// Composed by useSkillExtractor; pure merge planning lives in
// ./skill-extractor-shared.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SkillExtractionResult } from "@/components/SkillExtractionResults";
import { resumeService } from "@/lib/services/resume-service";
import { jobService } from "@/lib/services/job-service";
import {
  planJobSkillMerge,
  planResumeSkillMerge,
  type SkillPreviewResume,
  type SkillResultSource,
  type SkillSaveState,
} from "./skill-extractor-shared";

export function useSkillSaveBack() {
  const { t } = useTranslation();

  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<SkillSaveState>({ kind: "idle" });
  // Tracks the resume payload currently loaded in the right-hand
  // SkillNetwork preview. Populated when extraction targets a saved
  // resume; refreshed after a successful save so the visualizer reflects
  // the new bindings without a page reload.
  const [previewResume, setPreviewResume] = useState<SkillPreviewResume | null>(null);

  const resetSaveState = () => setSaveState({ kind: "idle" });

  /** Best-effort reload of the SkillNetwork preview from the persisted row. */
  const refreshPreviewResume = async (id: string) => {
    try {
      const fresh = await resumeService.getResumeById(id);
      if (fresh.content) {
        setPreviewResume({
          id: fresh.id,
          userId: fresh.userId,
          content: fresh.content,
        });
      }
    } catch {
      /* best-effort refresh */
    }
  };

  // Merge the extracted skills into the resume or job the extraction was
  // run against, and PUT the updated entity back. Skips any skill that
  // already exists (case-insensitive match on the name) so repeat clicks
  // don't duplicate entries.
  const saveSkillsToSource = async (
    result: SkillExtractionResult | null,
    resultSource: SkillResultSource | null,
  ) => {
    if (!result || !resultSource) return;

    const incoming = result.skills.map((s) => s.name.trim()).filter(Boolean);
    if (incoming.length === 0) return;

    setIsSaving(true);
    setSaveState({ kind: "idle" });

    try {
      if (resultSource.type === "resume") {
        const resume = await resumeService.getResumeById(resultSource.id);
        const plan = planResumeSkillMerge(resume.content, result, incoming);
        if (plan.noChange) {
          setSaveState({ kind: "success", added: 0, skipped: plan.skipped });
          return;
        }
        await resumeService.updateResumeData(resultSource.id, {
          data: plan.nextData as any,
        });
        // Refresh the right-pane SkillNetwork preview with the persisted
        // state so the user can see the new bindings + any cleanup the
        // optimize pass performed without leaving the tool.
        await refreshPreviewResume(resultSource.id);
        setSaveState({
          kind: "success",
          added: plan.added,
          skipped: plan.skipped,
          ...(plan.optimizedRemoved > 0 ? { removed: plan.optimizedRemoved } : {}),
        });
      } else {
        const job = await jobService.getJobById(resultSource.id);
        const plan = planJobSkillMerge(job?.skills, incoming);
        if (plan.added === 0) {
          setSaveState({ kind: "success", added: 0, skipped: plan.skipped });
          return;
        }
        await jobService.updateJob(resultSource.id, {
          ...job,
          skills: plan.nextSkills,
        });
        setSaveState({ kind: "success", added: plan.added, skipped: plan.skipped });
      }
    } catch (err: any) {
      setSaveState({
        kind: "error",
        message: err?.message || t("skillExtractor.saveFailed"),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    saveState,
    resetSaveState,
    previewResume,
    setPreviewResume,
    refreshPreviewResume,
    saveSkillsToSource,
  };
}
