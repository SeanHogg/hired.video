/**
 * useReviewIntake — routes what the person hands the kit workspace once a résumé is
 * open: a file on the paperclip, a pasted job post, a job link, or words.
 *
 *   résumé file   → "Merge into my master" · "Start over with it" · "Just compare"
 *   job post/link → "Tailor my master" · "Create a new one for it" · "Just score my match"
 *
 * A typed intent ("merge it", "tailor it for this job") skips the question.
 * A second résumé NEVER replaces the open one unless "Start over with it"
 * is chosen. Messages that are none of this go to the chat as before
 * (`message` returns false).
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { extractTextFromFile } from "@/lib/extract-text";
import { isAcceptedResumeFile } from "@/lib/build-entry";
import { jobService } from "@/lib/services/job-service";
import { matchService } from "@/lib/services/match-service";
import {
  INTENTS_FOR,
  classifyText,
  intentFits,
  intentFrom,
  jobLinkIn,
  type AttachmentKind,
  type ReviewIntent,
} from "./attachment-router";
import type { BuildReview } from "./use-build-review";
import type { JobInput } from "./use-tailor-review";

export type PendingAttachment =
  | { kind: "resume"; name: string; file: File }
  | { kind: "job"; name: string; job: JobInput };

export interface MatchScore {
  job: string;
  score: number;
  summary: string;
}

interface Args {
  review: BuildReview;
  resumeId: string | null;
  ensureSaved: () => Promise<string>;
  /** "Start over with it": the existing re-import (one undo step). */
  replaceWith: (file: File) => void;
}

export function useReviewIntake({ review, resumeId, ensureSaved, replaceWith }: Args) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [reading, setReading] = useState(false);
  const [score, setScore] = useState<MatchScore | null>(null);
  /** "Paste the job link…" when a job intent arrives with no job. */
  const [needJob, setNeedJob] = useState(false);

  const run = useCallback(
    async (intent: ReviewIntent, item: PendingAttachment) => {
      setPending(null);
      setScore(null);
      if (item.kind === "resume") {
        if (intent === "merge") review.startMerge({ kind: "file", file: item.file });
        else if (intent === "compare") review.startCompare(item.file);
        else replaceWith(item.file);
        return;
      }
      if (intent === "tailor") review.startTailor(item.job);
      else if (intent === "create") review.startFromJob(item.job);
      else {
        try {
          const id = resumeId ?? (await ensureSaved());
          const r = item.job.jobId
            ? await matchService.matchJobIdWithResumeId({ jobId: item.job.jobId, resumeId: id })
            : await matchService.analyzeJobHtml({ jobHtml: item.job.jobHtml ?? "", resumeId: id });
          setScore({ job: item.job.label, score: r.score, summary: r.summaryRecommendations });
        } catch {
          toast({ title: t("review.error.generic"), variant: "destructive" });
        }
      }
    },
    [review, replaceWith, resumeId, ensureSaved, toast, t],
  );

  /** Ask (or, with a typed intent, just do it). */
  const offer = useCallback(
    (item: PendingAttachment, typed: string | null) => {
      const intent = typed ? intentFrom(typed) : null;
      if (intent && intentFits(intent, item.kind)) void run(intent, item);
      else setPending(item);
    },
    [run],
  );

  const attach = useCallback(
    async (file: File, typed: string | null = null) => {
      if (!isAcceptedResumeFile(file)) {
        toast({ title: t("build.reimport.unsupported"), variant: "destructive" });
        return;
      }
      setReading(true);
      try {
        // A file we can't read as text is treated as a résumé (scans, photos).
        const text = await extractTextFromFile(file).catch(() => "");
        const kind: AttachmentKind = classifyText(text) ?? "resume";
        offer(kind === "job" ? { kind, name: file.name, job: { jobHtml: text, label: file.name } } : { kind, name: file.name, file }, typed);
      } finally {
        setReading(false);
      }
    },
    [offer, toast, t],
  );

  /** A composer message. True when it was a job post / link / intent this
   *  hook handled; false = an ordinary change request for the chat. */
  const message = useCallback(
    async (text: string): Promise<boolean> => {
      const intent = intentFrom(text);
      setNeedJob(false);
      if (pending && intent && intentFits(intent, pending.kind)) {
        void run(intent, pending);
        return true;
      }
      const url = jobLinkIn(text);
      if (url) {
        setReading(true);
        try {
          const job = await jobService.extractJobFromUrl(url);
          const label = [job.title, job.company].filter(Boolean).join(" · ") || url;
          offer({ kind: "job", name: label, job: { jobId: job.id, label } }, text);
        } catch {
          toast({ title: t("review.intake.linkFailed"), variant: "destructive" });
        } finally {
          setReading(false);
        }
        return true;
      }
      if (classifyText(text) === "job") {
        const label = text.trim().split("\n")[0].slice(0, 80);
        offer({ kind: "job", name: label, job: { jobHtml: text, label } }, null);
        return true;
      }
      return false;
    },
    [pending, run, offer, toast, t],
  );

  return {
    pending,
    intents: pending ? INTENTS_FOR[pending.kind] : [],
    choose: (intent: ReviewIntent) => pending && void run(intent, pending),
    dismiss: () => setPending(null),
    reading,
    needJob,
    score,
    clearScore: () => setScore(null),
    attach,
    message,
  };
}

export type ReviewIntake = ReturnType<typeof useReviewIntake>;
