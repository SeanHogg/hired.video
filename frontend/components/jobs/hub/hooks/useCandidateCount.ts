import { useEffect, useState } from "react";
import { USER_ROLES } from "@/lib/auth";
import { recruitService } from "@/lib/services/recruit-service";

/** Pre-fetch the candidate count for recruiters/employers so the Candidates
 *  tab badge is accurate before the user clicks into it. The panel itself
 *  re-fetches when mounted (and reports back via the returned setter) — this
 *  is just a lightweight warm-up for the badge. */
export function useCandidateCount(
  isAuthenticated: boolean,
  user: { role?: string } | null | undefined,
) {
  const [candidateCount, setCandidateCount] = useState<number>(0);
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (user.role !== USER_ROLES.RECRUITER && user.role !== USER_ROLES.EMPLOYER) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await recruitService.listCandidateResumes();
        if (!cancelled) setCandidateCount(rows.length);
      } catch {
        // Recruiter without a company yet — leave count at 0.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user]);
  return [candidateCount, setCandidateCount] as const;
}
