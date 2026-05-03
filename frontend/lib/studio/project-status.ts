/**
 * Studio project status — single source for converting the raw API
 * status string into a user-facing label + colour class. Centralised so
 * "what does this status mean to the user?" lives in one place and
 * every consumer (sidebar Recent badge, search results, dashboard
 * cards) reads the same answer.
 *
 * The crucial reframe: the persisted `studio_projects.status` enum is
 * the WORKFLOW state, not the share state.
 *
 *   • "Published" actually means "featured on the user's profile"
 *     (driven by the Publish/Remove from Profile menu item).
 *
 *   • Whether a video has a publicly-accessible link is independent —
 *     that's `videos.privacyStatus = 'public'` and is surfaced by the
 *     separate VisibilityChip (Public / Private).
 *
 * Calling the workflow status "Published" reads as "has a public link"
 * to most users, which is wrong. We rename it to "On Profile" here so
 * the two concerns stay clearly separated everywhere the badge appears.
 */

export interface ProjectStatusMeta {
  /** What the user sees on the badge. */
  label: string;
  /** Tailwind classes for bg + text. Light-on-light combos avoided so
   *  the badge reads against the active row's accent backdrop. */
  className: string;
}

const STATUS_META: Record<string, ProjectStatusMeta> = {
  Draft:      { label: "Draft",       className: "bg-muted text-foreground" },
  Processing: { label: "Rendering",   className: "bg-blue-500/15 text-blue-700 dark:text-blue-200" },
  Exported:   { label: "Ready",       className: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-200" },
  Publishing: { label: "Publishing",  className: "bg-amber-500/15 text-amber-700 dark:text-amber-200" },
  Completed:  { label: "Ready",       className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200" },
  // The big rename — see header comment for why.
  Published:  { label: "On Profile",  className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200" },
  Failed:     { label: "Failed",      className: "bg-red-500/15 text-red-700 dark:text-red-200" },
};

const FALLBACK: ProjectStatusMeta = {
  label: "Draft",
  className: "bg-muted text-foreground",
};

export function getProjectStatusMeta(status: string | null | undefined): ProjectStatusMeta {
  if (!status) return FALLBACK;
  return STATUS_META[status] ?? { label: status, className: FALLBACK.className };
}
