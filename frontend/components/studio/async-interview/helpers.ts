import type { TFunction } from "i18next";
import type {
  AsyncInterview,
  AsyncInterviewResponsesResult,
} from "@/lib/services/studio-features-service";

export type { AsyncInterviewResponseView } from "@/lib/services/studio-features-service";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QuestionDraft {
  id: string;
  text: string;
  maxDurationSec: number;
  required: boolean;
}

export interface InterviewForm {
  title: string;
  instructions: string;
  candidateEmail: string;
  jobId: string;
  deadline: string;
  questions: QuestionDraft[];
}

export type RecruiterTab = "create" | "list";

export type CreatedInterview = AsyncInterview & { inviteUrl: string };

/** Response-list payload (DTO owned by the service types). */
export type InterviewResponses = AsyncInterviewResponsesResult;

export interface UploadedResponse {
  recordingId: string;
  videoUrl?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const MAX_QUESTIONS = 10;
export const MIN_QUESTION_DURATION_SEC = 15;
export const MAX_QUESTION_DURATION_SEC = 600;
export const DEFAULT_QUESTION_DURATION_SEC = 120;
export const COPY_FEEDBACK_MS = 2000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateDraftId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function statusColor(status: string): string {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "in_progress":
      return "bg-accent text-accent-foreground";
    case "submitted":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "reviewed":
      return "bg-accent text-accent-foreground";
    default:
      return "bg-muted text-foreground";
  }
}

export function statusLabel(t: TFunction, status: string): string {
  switch (status) {
    case "pending":
      return t("studio.asyncInterview.status.pending");
    case "in_progress":
      return t("studio.asyncInterview.status.inProgress");
    case "submitted":
      return t("studio.asyncInterview.status.submitted");
    case "reviewed":
      return t("studio.asyncInterview.status.reviewed");
    default:
      return status;
  }
}

/** Invites can't be re-sent once the candidate has submitted. */
export function isInviteClosed(status: string): boolean {
  return status === "submitted" || status === "reviewed";
}

export function formatDeadline(t: TFunction, deadline?: string): string {
  if (!deadline) return t("studio.asyncInterview.noDeadline");
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return t("studio.asyncInterview.invalidDate");
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function clampQuestionDuration(value: number): number {
  return Math.max(
    MIN_QUESTION_DURATION_SEC,
    Math.min(MAX_QUESTION_DURATION_SEC, value),
  );
}

export const emptyQuestion = (): QuestionDraft => ({
  id: generateDraftId(),
  text: "",
  maxDurationSec: DEFAULT_QUESTION_DURATION_SEC,
  required: true,
});

export const emptyForm = (): InterviewForm => ({
  title: "",
  instructions: "",
  candidateEmail: "",
  jobId: "",
  deadline: "",
  questions: [emptyQuestion()],
});

/** Clipboard write with a legacy execCommand fallback. */
export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}
