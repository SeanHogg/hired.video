import { useEffect, useState } from "react";
import { resumeService } from "@/lib/services/resume-service";

/**
 * Returns `true` when the authenticated user has no resumes yet, `false`
 * when they already own at least one, or `undefined` while loading.
 *
 * The backend ([api/src/routes/resumes.ts createResumeHandler]) auto-promotes
 * the first uploaded resume to master+active so the Chrome extension always
 * has an active resume. This hook lets the UI mirror that rule by defaulting
 * the "Mark as Master Resume" checkbox accordingly — single source of truth
 * for the rule, so callers don't each re-implement the count check.
 */
export function useIsFirstResumeUpload(): boolean | undefined {
  const [isFirst, setIsFirst] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    resumeService
      .getUserResumes()
      .then((resumes) => {
        if (!cancelled) setIsFirst(resumes.length === 0);
      })
      .catch(() => {
        if (!cancelled) setIsFirst(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return isFirst;
}
