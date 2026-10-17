// State for /tools/resume-consolidator — an ENTRY POINT now: pick what to
// merge (another saved résumé or a file) and where (the ★ master by
// default), then hand off to the kit workspace, where the merge is reviewed on the
// page and applied (useMergeReview). Builders retire into the workspace.
//
// Keeps the soft auth gate: an anonymous visitor's picks are snapshotted
// and restored after sign-in (a File can't be serialised — they are asked
// to re-upload it).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useAuth } from "@/lib/auth";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { useOpenReview } from "@/lib/tools/use-open-review";
import { useUserResumes } from "@/hooks/queries/use-resumes";

export function useConsolidatorHandoff() {
  const { t } = useTranslation();
  const openReview = useOpenReview();
  const { resumeId: deepLinkResumeId } = useToolEntityParams();
  const { isAuthenticated } = useAuth();
  const { data: resumes = [] } = useUserResumes();

  const [sourceId, setSourceId] = useState<string | null>(null);
  const [pickedTarget, setTargetId] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  // Merging goes into the linked résumé (the one open in the kit workspace when
  // embedded), else the master, unless another target is picked.
  const masterId = useMemo(() => resumes.find((r) => (r as { isMaster?: boolean }).isMaster)?.id ?? null, [resumes]);
  const targetId = pickedTarget ?? deepLinkResumeId ?? masterId;

  const { restored, snapshot, clear } = usePendingToolInput<{ sourceId?: string | null; targetId?: string | null; sourceFileName?: string }>();
  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    if (restored.sourceId) setSourceId(restored.sourceId);
    if (restored.targetId) setTargetId(restored.targetId);
    if (restored.sourceFileName && !sourceFile) setError(t("errors.reuploadAfterSignIn", { name: restored.sourceFileName }));
  }, [restored, isAuthenticated, sourceFile, t]);

  const getResumeLabel = useCallback((r: { title?: string }) => r.title || t("labels.untitledResume"), [t]);

  const handOff = useCallback(() => {
    if (!isAuthenticated) {
      snapshot({ sourceId, targetId, sourceFileName: sourceFile?.name });
      setShowAuthOverlay(true);
      return;
    }
    if (!targetId) return;
    clear();
    if (sourceFile) {
      openReview(targetId, { kind: "merge", source: { kind: "file", file: sourceFile } });
    } else if (sourceId) {
      const source = resumes.find((r) => r.id === sourceId);
      openReview(targetId, { kind: "merge", source: { kind: "resume", resumeId: sourceId, title: getResumeLabel(source ?? {}) } });
    }
  }, [isAuthenticated, snapshot, sourceId, targetId, sourceFile, clear, openReview, resumes, getResumeLabel]);

  const canHandOff = isAuthenticated
    ? !!(targetId && (sourceId || sourceFile) && sourceId !== targetId)
    : !!(sourceId || sourceFile);

  return {
    isAuthenticated,
    resumes,
    getResumeLabel,
    sourceId,
    targetId,
    setTargetId,
    sourceFile,
    selectSourceResume: (id: string) => {
      setSourceId(id);
      setSourceFile(null);
    },
    selectSourceFile: (file: File) => {
      setSourceFile(file);
      setSourceId(null);
    },
    error,
    showAuthOverlay,
    canHandOff,
    handOff,
  };
}
