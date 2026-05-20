// useCurrentCompanyScope — single source for the recruiter's current
// company scope. Consolidates the duplicate `recruitService.getMyScope()`
// fetches that were happening in CandidatesPanel, TeamLeaderboard, and
// SourcingFeePanel.
//
// Returns the loaded scope plus the currently-selected companyId (which
// the caller can override via setCompanyId for multi-company users).
// `refresh()` re-fetches scope without resetting the selected company —
// callers that mutate brand kits / redaction profiles use it to sync.

import { useCallback, useEffect, useState } from "react";
import { useApiReady } from "@/lib/auth";
import { recruitService, type RecruitScope } from "@/lib/services/recruit-service";

export interface CompanyScopeResult {
  scope: RecruitScope | null;
  companyId: string | null;
  setCompanyId: (id: string) => void;
  loading: boolean;
  /** True when the user has zero recruiting companies — UI should show
   *  the "create a company first" empty state. */
  hasNoCompany: boolean;
  /** Re-fetches scope without clearing the selected company. Returns a
   *  promise so callers can await before showing success toasts. */
  refresh: () => Promise<void>;
}

export function useCurrentCompanyScope(): CompanyScopeResult {
  const apiReady = useApiReady();
  const [scope, setScope] = useState<RecruitScope | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (preserveCompanyId: boolean) => {
    setLoading(true);
    try {
      const s = await recruitService.getMyScope();
      setScope(s);
      setCompanyId((prev) =>
        preserveCompanyId && prev ? prev : s.primaryCompanyId ?? s.companies[0]?.id ?? null,
      );
    } catch {
      setScope(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!apiReady) {
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
  }, [apiReady]);

  const refresh = useCallback(() => load(true), [load]);

  return {
    scope,
    companyId,
    setCompanyId,
    loading,
    hasNoCompany: Boolean(scope && scope.companies.length === 0),
    refresh,
  };
}
