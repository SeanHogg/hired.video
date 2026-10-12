/**
 * Studio route predicates — the ONE place that knows which URLs mount the
 * full-screen workspace: `/studio/:id` (including `/studio/new` and
 * `/studio/resume/:resumeId`). Global chrome (floating AI button, mobile
 * bottom nav, spacers) asks this instead of re-deriving path rules, so the
 * workspace stays chrome-free everywhere.
 */
export function isStudioEditorPath(pathname: string): boolean {
  const path = pathname.toLowerCase().replace(/\/+$/, "");
  return /^\/studio\/[^/]+(\/.*)?$/.test(path);
}
