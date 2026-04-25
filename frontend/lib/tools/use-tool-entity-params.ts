// Reads the entity-id query params we deep-link into the standalone
// /tools/* pages from a Run-Tool action menu (`?resumeId=…`, `?jobId=…`).
// Pages call this once at mount, then bind the returned ids to their
// own picker state (`setSelectedResumeId(...)`) so the user lands with
// the entity already chosen and a single click away from running.
//
// We deliberately don't strip the params from the URL — keeping them
// makes the link shareable and lets the user refresh without losing
// the preselection.

import { useMemo } from "react";
import { useLocation } from "react-router-dom";

export interface ToolEntityParams {
  resumeId?: string;
  jobId?: string;
  companyId?: string;
}

export function useToolEntityParams(): ToolEntityParams {
  const { search } = useLocation();
  return useMemo(() => {
    const params = new URLSearchParams(search);
    const resumeId = params.get("resumeId") ?? undefined;
    const jobId = params.get("jobId") ?? undefined;
    const companyId = params.get("companyId") ?? undefined;
    return { resumeId, jobId, companyId };
  }, [search]);
}
