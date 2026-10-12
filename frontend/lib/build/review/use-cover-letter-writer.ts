/**
 * useCoverLetterWriter — the cover letter that goes with a job review
 * (tailor, create from a job). It is written AUTOMATICALLY as soon as the
 * tailored résumé is ready: the person pastes a job and gets the fitted
 * résumé AND its letter, with nothing more to click.
 *
 * Paid AI = Pro (POST /api/match/cover-letter is requirePro): for a free
 * account the letter waits as "locked" — the chat card offers the upgrade
 * (CoverLetterCard owns that gate) and, the moment the plan turns Pro, the
 * waiting letter is written without another click.
 *
 * The letter rides on the review's proposal (`content.meta.coverLetter`,
 * shared/cover-letter.ts), so "Save as version of master" stores it on the
 * version and the Letter tab, Undo and autosave all see one document.
 * Each letter written is recorded as a "cover-letter" tool run (history +
 * the cover_letter.generated reward, tool-id-mapping.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeContent } from "@shared/resume";
import type { CoverLetter } from "@shared/cover-letter";
import { useToolRunRecorder } from "@/lib/tools/use-tool-run-recorder";
import { matchService } from "@/lib/services/match-service";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { reviewErrorKey } from "./review-errors";
import type { JobInput } from "./use-tailor-review";

export type CoverLetterStatus = "idle" | "locked" | "writing" | "ready" | "error";

export interface CoverLetterDraft {
  status: CoverLetterStatus;
  letter: CoverLetter | null;
  errorKey?: string;
  /** Write it again from the review as it stands now (kept changes +
   *  confirmed answers). */
  rewrite: () => void;
  /** The person's own edits on the Letter tab. */
  setLetter: (letter: CoverLetter) => void;
}

type Request = { job: JobInput; content: ResumeContent };

export function useCoverLetterWriter() {
  const { isPro, loading } = useSubscription();
  const { recordRun } = useToolRunRecorder("cover-letter");
  const [status, setStatus] = useState<CoverLetterStatus>("idle");
  const [letter, setLetterState] = useState<CoverLetter | null>(null);
  const [errorKey, setErrorKey] = useState<string | undefined>();
  const [pending, setPending] = useState<Request | null>(null);
  const runId = useRef(0);

  const write = useCallback(async ({ job, content }: Request) => {
    const id = ++runId.current;
    setStatus("writing");
    setErrorKey(undefined);
    try {
      const next = await matchService.writeCoverLetter({ jobId: job.jobId, jobHtml: job.jobHtml, resumeContent: content });
      if (id !== runId.current) return;
      setLetterState(next);
      setStatus("ready");
      const title = [next.jobTitle, next.organization].filter(Boolean).join(" · ");
      void recordRun({
        result: { summary: title, raw: next },
        summary: title || null,
        jobDescription: job.jobHtml ?? null,
        jobId: job.jobId,
      });
    } catch (err) {
      if (id !== runId.current) return;
      const key = reviewErrorKey(err);
      // The server is the Pro authority; a stale client plan lands here.
      setStatus(key === "review.error.pro" ? "locked" : "error");
      setErrorKey(key);
    }
  }, [recordRun]);

  // A request waits until the plan is known; a free plan waits "locked"
  // until it upgrades, then the letter is written with no further click.
  useEffect(() => {
    if (!pending || loading) return;
    if (!isPro) {
      setStatus("locked");
      return;
    }
    setPending(null);
    void write(pending);
  }, [pending, loading, isPro, write]);

  /** Queue the letter for this job + tailored résumé (auto-write). */
  const request = useCallback((job: JobInput, content: ResumeContent) => {
    runId.current++;
    setLetterState(null);
    setErrorKey(undefined);
    setStatus("idle");
    setPending({ job, content });
  }, []);

  const reset = useCallback(() => {
    runId.current++;
    setPending(null);
    setLetterState(null);
    setErrorKey(undefined);
    setStatus("idle");
  }, []);

  const draft = useCallback(
    (job: JobInput | null, current: ResumeContent | null): CoverLetterDraft => ({
      status,
      letter,
      errorKey,
      rewrite: () => {
        if (job && current) setPending({ job, content: current });
      },
      setLetter: setLetterState,
    }),
    [status, letter, errorKey],
  );

  return { request, reset, draft, letter };
}
