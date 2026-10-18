// Canonical origin (prefer apex domain over www)
export const CANONICAL_ORIGIN = "https://hired.video";

// Map legacy/duplicate routes to canonical equivalents. The tools are
// registered at both PascalCase (/Tools/AIResumeScorer) and kebab-case
// (/tools/ai-resume-scorer) paths — kebab-case is canonical for SEO so
// every PascalCase variant is aliased here. Keep this in sync with
// App.tsx's route table when new tools are added.
export function canonicalizePath(pathname: string): string {
  const p = pathname || "/";
  const aliasMap: Record<string, string> = {
    "/Tools/AIResumeScorer": "/tools/ai-resume-scorer",
    "/Tools/ResumeOptimizer": "/tools/resume-optimizer",
    "/Tools/SalaryCalculator": "/tools/salary-calculator",
    "/Tools/SentimentAnalysis": "/tools/sentiment-analysis",
    "/Tools/JobResumeMatch": "/tools/job-resume-match",
    "/Tools/SummarizeResume": "/tools/summarize-resume",
    "/Tools/ValueProposition": "/tools/value-proposition",
    "/Tools/pdftojson": "/tools/pdf-to-json",
    "/Tools/PdfToJson": "/tools/pdf-to-json",
    "/Tools/ResumeConsolidator": "/tools/resume-consolidator",
    "/Tools/ResumeTailor": "/tools/resume-tailor",
    "/Tools/AutoFill": "/tools/auto-fill",
    "/tools/form-autofill": "/tools/auto-fill",
    "/tools/autofill": "/tools/auto-fill",
    "/resume-roast": "/tools/resume-roast",
    "/privacy": "/privacy-policy",
    "/terms": "/terms-of-service",
    // Legacy discovery URLs consolidated into /tasks Discover surface.
    "/events": "/tasks",
    "/map": "/tasks",
  };

  if (aliasMap[p]) return aliasMap[p];
  if (p.startsWith("/resume/")) return "/resumes/" + p.slice("/resume/".length);
  if (p.startsWith("/Tools/")) return p.replace(/^\/Tools\//, "/tools/");
  return p;
}


/**
 * Derive a sensible breadcrumb trail from a route path: Home → humanised
 * path segments (id-like segments dropped). The single source for the
 * "no custom trail needed" default so pages don't hand-roll the same
 * Home→segments logic (DRY).
 */
export function defaultBreadcrumbs(pathname: string): { name: string; url: string }[] {
  const items = [{ name: "Home", url: "/" }];
  let acc = "";
  for (const seg of pathname.split("/").filter(Boolean)) {
    acc += `/${seg}`;
    // Skip opaque id/slug-ish segments (uuids, long hex, pure numbers).
    if (/^[0-9]+$/.test(seg) || /^[0-9a-f]{8,}$/i.test(seg) || /-[0-9a-f]{6,}$/i.test(seg)) {
      continue;
    }
    items.push({
      name: seg.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      url: acc,
    });
  }
  return items;
}
