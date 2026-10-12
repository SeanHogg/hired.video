// Pure state + filtering for the /templates browse page.
//
// Data comes from the unified registry (`useTemplates` → static resume +
// studio-builtin presets merged with creator-published rows), which already
// applies the text query. This module owns only what the page layers on top:
// URL <-> state, the Resume | Video tab split (by what a template makes, not
// where it comes from), industry chips and sort — so
// it's unit-tested and the page just renders.

import { isResumeTemplate, type TemplateMeta } from "./types";

export type BrowseTab = "resume" | "video";
export type BrowseSort = "recommended" | "name";

export interface BrowseState {
  tab: BrowseTab;
  /** Exact industry label, or "" for all. Resume tab only. */
  industry: string;
  q: string;
  sort: BrowseSort;
}

export const DEFAULT_BROWSE_STATE: BrowseState = {
  tab: "resume",
  industry: "",
  q: "",
  sort: "recommended",
};

/** Catch-all industry label used by generic presets ("All"). Never shown as
 *  a chip; such templates match every industry filter. */
export const GENERIC_INDUSTRY = "All";

/** Read browse state from URL search params; unknown values fall back to defaults. */
export function parseBrowseParams(params: URLSearchParams): BrowseState {
  const tab = params.get("tab") === "video" ? "video" : "resume";
  const sort = params.get("sort") === "name" ? "name" : "recommended";
  return {
    tab,
    industry: tab === "resume" ? (params.get("industry") ?? "").trim() : "",
    q: (params.get("q") ?? "").trim(),
    sort,
  };
}

/** Serialize state to URL params, omitting defaults so links stay short. */
export function toBrowseParams(state: BrowseState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.tab !== DEFAULT_BROWSE_STATE.tab) p.set("tab", state.tab);
  if (state.tab === "resume" && state.industry) p.set("industry", state.industry);
  const q = state.q.trim();
  if (q) p.set("q", q);
  if (state.sort !== DEFAULT_BROWSE_STATE.sort) p.set("sort", state.sort);
  return p;
}

/** Résumé templates — built-in presets AND creator résumé templates — go on
 *  the Resume tab; every other kind on the Video tab. */
export function tabFor(meta: TemplateMeta): BrowseTab {
  return isResumeTemplate(meta) ? "resume" : "video";
}

/** Distinct, non-generic industries across resume templates, in catalog order. */
export function resumeIndustries(templates: readonly TemplateMeta[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of templates) {
    if (!isResumeTemplate(t)) continue;
    const ind = t.industry?.trim();
    if (!ind || ind === GENERIC_INDUSTRY || seen.has(ind)) continue;
    seen.add(ind);
    out.push(ind);
  }
  return out;
}

/** Apply tab, industry and sort. "recommended" keeps registry order
 *  (first-party presets first, then creator templates). */
export function applyBrowseFilters(
  templates: readonly TemplateMeta[],
  state: Pick<BrowseState, "tab" | "industry" | "sort">,
): TemplateMeta[] {
  const out = templates.filter((t) => {
    if (tabFor(t) !== state.tab) return false;
    if (state.tab === "resume" && state.industry) {
      return t.industry === state.industry || t.industry === GENERIC_INDUSTRY;
    }
    return true;
  });
  if (state.sort === "name") {
    return [...out].sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}
