// URL-backed state + data for the /templates browse page. State lives in the
// query string (?tab=video&industry=…&q=…&sort=name) so every view is a
// shareable link. Data comes from the unified registry hook (`useTemplates`)
// — the same static + creator-published sources /search uses — so there is
// no second fetch path here.

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { getStaticTemplates, useTemplates } from "@/lib/templates/registry";
import {
  applyBrowseFilters,
  parseBrowseParams,
  resumeIndustries,
  toBrowseParams,
  type BrowseState,
} from "@/lib/templates/browse";

export function useTemplateBrowse() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseBrowseParams(params), [params]);

  const update = useCallback(
    (patch: Partial<BrowseState>) => {
      const next: BrowseState = { ...state, ...patch };
      // Switching tabs clears the resume-only industry chip.
      if (patch.tab && patch.tab !== state.tab) next.industry = "";
      setParams(toBrowseParams(next), { replace: true });
    },
    [state, setParams],
  );

  // Both tabs merge creator-published templates from the one public studio
  // listing: résumé templates (documentKind 'resume') land on the Resume tab
  // next to the bundled presets, everything else on the Video tab.
  const { templates, loading } = useTemplates({ query: state.q });

  const industries = useMemo(() => resumeIndustries(getStaticTemplates()), []);
  const results = useMemo(() => applyBrowseFilters(templates, state), [templates, state]);

  return { state, update, industries, results, loading };
}
