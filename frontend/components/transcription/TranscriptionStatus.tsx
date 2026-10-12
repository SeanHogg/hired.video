/**
 * TranscriptionStatus (#2145) — on a video answer, tells the interview's
 * creator when the transcript is still being made or failed, and offers a
 * retry when it failed. Renders nothing for text answers, completed
 * transcripts, and legacy rows. The server already retries transient
 * failures automatically; this is the manual fallback.
 *
 * Live review page currently uses `interview-assignments/TranscriptionStatusStrip`
 * (same behaviour). This module is the workstream-owned path so tests and
 * future callers can import from `@/components/transcription`.
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

export type TranscriptionJobResponse = Pick<
  AssignmentResponse,
  "id" | "responseMode" | "videoUrl" | "transcriptionStatus"
>;

export interface TranscriptionStatusProps {
  interviewId: string;
  response: TranscriptionJobResponse;
  /** Refetch the report — called after a retry is queued and on "Check again". */
  onRefresh: () => void | Promise<void>;
  /** Injected in tests; production uses `retranscribeAnswer`. */
  retranscribe?: (interviewId: string, responseId: string) => Promise<void>;
}

export function TranscriptionStatus({
  interviewId,
  response,
  onRefresh,
  retranscribe = retranscribeAnswer,
}: TranscriptionStatusProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  if (response.responseMode !== "video" || !response.videoUrl) return null;
  const status = response.transcriptionStatus;
  if (status !== "failed" && status !== "pending") return null;

  const retry = async () => {
    setBusy(true);
    try {
      await retranscribe(interviewId, response.id);
      toast.success(t("messages.interviewAssignments.transcription.queued"));
      await onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : t("errors.interviewAssignments.transcription.retryFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  if (status === "pending") {
    return (
      <div
        className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"
        data-testid="transcription-status"
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        <span>{t("labels.interviewAssignments.transcription.pending")}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11 px-2 text-[11px]"
          onClick={() => void onRefresh()}
        >
          {t("actions.interviewAssignments.transcription.checkAgain")}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 text-[11px] text-destructive"
      data-testid="transcription-status"
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
      <span>{t("labels.interviewAssignments.transcription.failed")}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 px-2 text-[11px]"
        disabled={busy}
        onClick={() => void retry()}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="h-3 w-3 mr-1" aria-hidden />
        )}
        {t("actions.interviewAssignments.transcription.retry")}
      </Button>
    </div>
  );
}

export default TranscriptionStatus;
