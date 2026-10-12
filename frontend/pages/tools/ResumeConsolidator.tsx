// /tools/resume-consolidator — an entry point into the kit workspace: pick the résumé
// to merge in (saved, or a file) and where it goes (★ master by default);
// the merge is then reviewed ON the page in the kit workspace and applied there.
//
// State: components/tools/resume-consolidator/useConsolidatorHandoff.

import { GitMerge } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ToolShell } from "@/components/tools/ToolShell";
import { useConsolidatorHandoff } from "@/components/tools/resume-consolidator/useConsolidatorHandoff";
import { ConsolidatorSelectStep } from "@/components/tools/resume-consolidator/ConsolidatorSelectStep";

export default function ResumeConsolidator() {
  const { t } = useTranslation();
  const c = useConsolidatorHandoff();

  return (
    <ToolShell
      toolId="resume-consolidator"
      header={{
        icon: <GitMerge aria-hidden="true" className="h-6 w-6" />,
        title: t("tools.resumeConsolidator.title"),
        description: t("tools.resumeConsolidator.subtitle"),
      }}
      authOverlay={{
        show: c.showAuthOverlay,
        message: t("messages.signInToMergeResumes"),
      }}
    >
      <ConsolidatorSelectStep
        isAuthenticated={c.isAuthenticated}
        resumes={c.resumes}
        getResumeLabel={c.getResumeLabel}
        targetId={c.targetId}
        onTargetChange={c.setTargetId}
        sourceId={c.sourceId}
        onSourceResumeChange={c.selectSourceResume}
        sourceFile={c.sourceFile}
        onSourceFileChange={c.selectSourceFile}
        error={c.error}
        canContinue={c.canHandOff}
        onContinue={c.handOff}
      />
    </ToolShell>
  );
}
