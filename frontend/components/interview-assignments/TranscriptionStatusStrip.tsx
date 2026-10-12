/**
 * TranscriptionStatusStrip (#2145) — on a video answer, tells the
 * interview's creator when the transcript is still being made or failed,
 * and offers a retry when it failed. Renders nothing for text answers,
 * completed transcripts and legacy rows. The server already retries
 * transient failures automatically; this is the manual fallback.
 */
"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  retranscribeAnswer,
  type AssignmentResponse,
} from "@/lib/services/interview-assignments-service";

interface Props {
  interviewId: string;
  response: AssignmentResponse;
  /** Refetch the report — called after a retry is queued and on "Check again". */
  onRefresh: () => void | Promise<void>;
}

export default function TranscriptionStatusStrip({ interviewId, response, onRefresh }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  if (response.responseMode !== "video" || !response.videoUrl) return null;
  const status = response.transcriptionStatus;
  if (status !== "failed" && status !== "pending") return null;

  const retry = async () => {
    setBusy(true);
    try {
      await retranscribeAnswer(interviewId, response.id);
      toast.success(t("messages.interviewAssignments.transcription.queued"));
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t("errors.interviewAssignments.transcription.retryFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (status === "pending") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        <span>{t("labels.interviewAssignments.transcription.pending")}</span>
        <Button size="sm" variant="ghost" className="min-h-11 px-2 text-[11px]" onClick={() => void onRefresh()}>
          {t("actions.interviewAssignments.transcription.checkAgain")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-destructive">
      <AlertTriangle className="h-3 w-3" aria-hidden />
      <span>{t("labels.interviewAssignments.transcription.failed")}</span>
      <Button size="sm" variant="outline" className="min-h-11 px-2 text-[11px]" disabled={busy} onClick={() => void retry()}>
        {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3 mr-1" aria-hidden />}
        {t("actions.interviewAssignments.transcription.retry")}
      </Button>
    </div>
  );
}
