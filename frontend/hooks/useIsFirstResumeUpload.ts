import { useUserResumes } from "@/hooks/queries/use-resumes";

/**
 * Returns `true` when the authenticated user has no resumes yet, `false`
 * when they already own at least one, or `undefined` while loading.
 *
 * The backend (api/src/services/resume/create.ts `insertOwnedResume`) auto-promotes
 * the first uploaded resume to master+active so the Chrome extension always
 * has an active resume. This hook lets the UI mirror that rule by defaulting
 * the "Mark as Master Resume" checkbox accordingly — single source of truth
 * for the rule, so callers don't each re-implement the count check.
 */
export function useIsFirstResumeUpload(): boolean | undefined {
  const { data, isError, fetchStatus } = useUserResumes();
  // A failed read, or no signed-in viewer to read for, is "not first".
  if (isError) return false;
  if (data) return data.length === 0;
  return fetchStatus === "idle" ? false : undefined;
}
