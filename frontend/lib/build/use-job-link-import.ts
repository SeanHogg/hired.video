/**
 * useJobLinkImport — read a job link through the job importer
 * (POST /api/Job/Extract via jobService, the same path the chat's review
 * intake uses) into the job post's text, for the kit's "Job you want" slot.
 * Owns only the reading state; the caller puts the text in its draft.
 */
import { useCallback, useRef, useState } from "react";
import { jobService } from "@/lib/services/job-service";
import { apiErrorCode } from "@/lib/errors";
import { jobLinkError, jobTextFromSummary, type JobLinkError } from "./kit-drop";

export type JobLinkState =
  | { status: "idle" }
  | { status: "reading"; url: string }
  | { status: "failed"; url: string; error: JobLinkError };

export function useJobLinkImport() {
  const [state, setState] = useState<JobLinkState>({ status: "idle" });
  // Only the latest link's answer counts.
  const latest = useRef(0);

  /** The job's text, or null when it couldn't be read (state says why). */
  const read = useCallback(async (url: string): Promise<string | null> => {
    const ticket = ++latest.current;
    setState({ status: "reading", url });
    try {
      const job = await jobService.extractJobFromUrl(url);
      if (ticket !== latest.current) return null;
      setState({ status: "idle" });
      return jobTextFromSummary(job);
    } catch (err) {
      if (ticket === latest.current) setState({ status: "failed", url, error: jobLinkError(apiErrorCode(err)) });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    latest.current += 1;
    setState({ status: "idle" });
  }, []);

  return { state, read, reset };
}

export type JobLinkImport = ReturnType<typeof useJobLinkImport>;
