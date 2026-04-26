// useCurrentCompanyScope — single source for the recruiter's current
// company scope. Consolidates the duplicate `recruitService.getMyScope()`
// fetches that were happening in CandidatesPanel, TeamLeaderboard, and
// SourcingFeePanel.
//
// Returns the loaded scope plus the currently-selected companyId (which
// the caller can override via setCompanyId for multi-company users).

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { recruitService, type RecruitScope } from "@/lib/services/recruit-service";

export interface CompanyScopeResult {
  scope: RecruitScope | null;
  companyId: string | null;
  setCompanyId: (id: string) => void;
  loading: boolean;
  /** True when the user has zero recruiting companies — UI should show
   *  the "create a company first" empty state. */
  hasNoCompany: boolean;
}

export function useCurrentCompanyScope(): CompanyScopeResult {
  const { isAuthenticated } = useAuth();
  const [scope, setScope] = useState<RecruitScope | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    recruitService
      .getMyScope()
      .then((s) => {
        if (cancelled) return;
        setScope(s);
        setCompanyId(s.primaryCompanyId ?? s.companies[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setScope(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return {
    scope,
    companyId,
    setCompanyId,
    loading,
    hasNoCompany: Boolean(scope && scope.companies.length === 0),
  };
}
