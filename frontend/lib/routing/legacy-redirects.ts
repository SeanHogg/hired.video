/**
 * Legacy route redirects — the ONE table of retired URLs and where each now
 * lands. Every entity's create / edit form page was retired into the studio
 * (#1912/#1914/#1915/#1955): its old route keeps working by bouncing to the
 * studio with that entity's input template (create) or its edit deep link.
 * App.tsx mounts one route per row (`<LegacyRedirect>`); the route test walks
 * this table, so adding a retirement is one row here.
 *
 * Pure data + pure builders (no React) so the table is unit-testable.
 */
import { resumeEditorPath } from "@/lib/studio/resume-editor-link";
import { studioEditHref, studioNewEntityHref } from "@/lib/studio/studio-authoring";

export type RouteParams = Readonly<Record<string, string | undefined>>;

export interface LegacyRedirect {
  /** react-router path pattern of the retired route. */
  path: string;
  /** The destination, from the matched params. */
  to: (params: RouteParams) => string;
  /** The gap that retired it. */
  gap: string;
  /** A hiring-side route: while the hiring personas are off it goes home
   *  instead (HiringRouteGate), as the page it replaces did. */
  hiringOnly?: boolean;
}

/** The new-résumé start the legacy résumé create forms land on. */
const NEW_RESUME_HREF = "/studio?contentTemplate=resume-doc";

export const LEGACY_REDIRECTS: readonly LegacyRedirect[] = [
  // Résumés — created and edited in the career kit (#1912/#1915/#2311).
  { path: "/resumes/create", to: () => NEW_RESUME_HREF, gap: "#1915" },
  { path: "/resumes/create/:id", to: () => NEW_RESUME_HREF, gap: "#1915" },
  { path: "/resumes/edit/:id", to: (p) => resumeEditorPath(p.id ?? ""), gap: "#1915" },
  // Job postings — the job document canvas (#1914 edit, #1915 create). The
  // `:id` on /jobs/create/:id was a client-side draft id, never a saved job.
  { path: "/jobs/create", to: () => studioNewEntityHref("job"), gap: "#1915" },
  { path: "/jobs/create/:id", to: () => studioNewEntityHref("job"), gap: "#1915" },
  { path: "/jobs/upload", to: () => studioNewEntityHref("job"), gap: "#1915" },
  { path: "/jobs/edit/:id", to: (p) => studioEditHref("job", p.id ?? ""), gap: "#1914" },
  { path: "/post-a-job", to: () => studioNewEntityHref("job"), gap: "#1915", hiringOnly: true },
  // Company pages — the company document canvas (#1955 T2.1).
  { path: "/companies/create", to: () => studioNewEntityHref("company"), gap: "#1955" },
  { path: "/companies/create/:id", to: () => studioNewEntityHref("company"), gap: "#1955" },
  { path: "/companies/edit/:id", to: (p) => studioEditHref("company", p.id ?? ""), gap: "#1955" },
];
