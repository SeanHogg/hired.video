/**
 * Unified page-meta registry — the single declarative source for
 * per-route AI context + SEO-key resolution (gaps #1621 + #1622).
 *
 * Supersedes the standalone `page-context-registry` (folded in here) so
 * there is ONE ordered route table instead of separate context- and
 * SEO-routing logic. Rules are evaluated top-to-bottom; the first `test`
 * that matches wins, so order is specificity (most specific first,
 * `general` as the implicit fallback).
 *
 * Two things a rule carries:
 *  - `contextType` — which AI context the page presents (drives the chat
 *    panel's system prompt + suggestions). Consumed via `detectContextType`.
 *  - `seoKey` (optional) — the canonical `PAGE_SEO` key a route should
 *    fall back to when its exact pathname has no entry. Dynamic / detail
 *    routes (`/studio/editor/abc`, `/jobs/:id`, `/articles/:slug`) had no
 *    PAGE_SEO entry and rendered generic `DEFAULT_SEO`; with a `seoKey`
 *    they inherit their parent surface's title / description / structured
 *    data. `PAGE_SEO` stays the single SEO store — this only improves key
 *    resolution, it does not duplicate SEO data.
 *
 * End state (#1622 remainder): each page co-locates its own `pageMeta`
 * and a build step generates this table + the PAGE_SEO entries, enforced
 * by a `require-page-meta` ESLint rule. Until then, new surfaces add a
 * rule here.
 */

import type { AIContextType } from "@shared/ai-context-types";

export interface PageMetaRule {
  /** Matched against `location.pathname`. */
  test: RegExp;
  /** AI context the page presents. */
  contextType: AIContextType;
  /** `PAGE_SEO` key to fall back to when the exact pathname has no
   *  entry. Must be a real key in PAGE_SEO (lib/seo.ts) or it silently
   *  no-ops back to DEFAULT_SEO. Omit when the route already has its own
   *  exact PAGE_SEO entry. */
  seoKey?: string;
}

/** Ordered, most-specific-first. */
export const PAGE_META_RULES: PageMetaRule[] = [
  // Dashboard
  { test: /^\/dashboard$/, contextType: "dashboard", seoKey: "/dashboard" },

  // Resume — create / edit / view / list
  { test: /^\/resumes\/(new|create)\b/, contextType: "resume-create", seoKey: "/resumes" },
  { test: /^\/resumes\/edit\//, contextType: "resume-edit", seoKey: "/resumes" },
  { test: /^\/resumes\/.+\/edit\b/, contextType: "resume-edit", seoKey: "/resumes" },
  { test: /^\/resumes\/.+/, contextType: "resume-view", seoKey: "/resumes" },
  { test: /^\/resumes\/?$/, contextType: "resume-list", seoKey: "/resumes" },

  // Job — create / edit / view / list
  { test: /^\/jobs\/(new|create)\b/, contextType: "job-create", seoKey: "/post-a-job" },
  { test: /^\/jobs\/edit\//, contextType: "job-edit", seoKey: "/jobs" },
  { test: /^\/jobs\/.+\/edit\b/, contextType: "job-edit", seoKey: "/jobs" },
  { test: /^\/jobs\/.+/, contextType: "job-view", seoKey: "/jobs" },
  { test: /^\/jobs\/?$/, contextType: "job-list", seoKey: "/jobs" },
  { test: /^\/post-a-job\b/, contextType: "job-create", seoKey: "/post-a-job" },

  // Studio — every studio surface (editor, preview, wizard, settings…)
  { test: /^\/studio(\/|$)/, contextType: "studio", seoKey: "/studio" },

  // Articles — author vs read vs browse
  { test: /^\/articles\/(new|create)\b/, contextType: "article-edit", seoKey: "/articles" },
  { test: /^\/articles\/.+\/edit\b/, contextType: "article-edit", seoKey: "/articles" },
  { test: /^\/articles\/.+/, contextType: "article-view", seoKey: "/articles" },
  { test: /^\/blog\/.+/, contextType: "article-view", seoKey: "/blog" },

  // Courses + learning paths — author vs learn vs browse
  { test: /^\/course-authoring\b/, contextType: "course-author", seoKey: "/learning" },
  { test: /^\/courses\/review-queue\b/, contextType: "course-author", seoKey: "/courses/review-queue" },
  { test: /^\/courses\/.+\/(author|edit)\b/, contextType: "course-author", seoKey: "/learning" },
  { test: /^\/courses\/.+/, contextType: "course-learn", seoKey: "/learning" },
  { test: /^\/learn(\/|$)/, contextType: "course-learn", seoKey: "/learning" },
  { test: /^\/learning(\/|$)/, contextType: "learning", seoKey: "/learning" },

  // Interview practice
  { test: /^\/interview(\/|$)/, contextType: "interview-practice", seoKey: "/interview" },

  // Tools catalogue + individual tool pages. Most tools have an exact
  // PAGE_SEO entry; this rule gives any uncovered/new tool a sensible
  // fallback to the /tools landing SEO instead of generic defaults.
  // contextType stays general — tools are utilities, not a panel context.
  { test: /^\/tools\/.+/, contextType: "general", seoKey: "/tools" },
  { test: /^\/tools\/?$/, contextType: "general", seoKey: "/tools" },

  // Sector landing pages — individual sectors (/sectors/healthcare …)
  // have exact entries; dynamic ones inherit the /sectors index SEO.
  { test: /^\/sectors\/.+/, contextType: "general", seoKey: "/sectors" },

  // Companies — create / edit / view / browse
  { test: /^\/companies\/(new|create)\b/, contextType: "company-edit", seoKey: "/companies" },
  { test: /^\/companies\/.+\/edit\b/, contextType: "company-edit", seoKey: "/companies" },
  { test: /^\/companies\/.+/, contextType: "company-view", seoKey: "/companies" },

  // Profile — edit vs view
  { test: /^\/profile\/edit\b/, contextType: "profile-edit", seoKey: "/settings" },
  { test: /^\/settings\b/, contextType: "profile-edit", seoKey: "/settings" },
  { test: /^\/profile\//, contextType: "profile-view", seoKey: "/people" },
  { test: /^\/people\/.+/, contextType: "profile-view", seoKey: "/people" },

  // Tasks
  { test: /^\/tasks(\/|$)/, contextType: "tasks", seoKey: "/tasks" },

  // Communication
  { test: /^\/outreach$/, contextType: "outreach", seoKey: "/outreach" },
  { test: /^\/messages(\/|$)/, contextType: "messaging" },

  // Discovery / browse surfaces
  { test: /^\/search$/, contextType: "search" },
  { test: /^\/people$/, contextType: "search", seoKey: "/people" },
  { test: /^\/companies\/?$/, contextType: "search", seoKey: "/companies" },
  { test: /^\/articles\/?$/, contextType: "search", seoKey: "/articles" },
  { test: /^\/(index)?$/, contextType: "search", seoKey: "/" },
];

export interface PageMeta {
  contextType: AIContextType;
  /** PAGE_SEO key to fall back to, or null when the route has no parent
   *  surface to inherit SEO from. */
  seoKey: string | null;
}

/** Resolve the unified page meta for a route. Always resolves — falls
 *  back to `{ contextType: "general", seoKey: null }` for unmatched
 *  routes (marketing, auth, admin, guides). */
export function getPageMeta(pathname: string): PageMeta {
  for (const rule of PAGE_META_RULES) {
    if (rule.test.test(pathname)) {
      return { contextType: rule.contextType, seoKey: rule.seoKey ?? null };
    }
  }
  return { contextType: "general", seoKey: null };
}

/** AI context type for a route. */
export function detectContextType(pathname: string): AIContextType {
  return getPageMeta(pathname).contextType;
}

/** PAGE_SEO key fallback for routes whose exact pathname has no entry.
 *  Consumed by `useSEO` so dynamic/detail routes inherit parent SEO. */
export function resolvePageSeoKey(pathname: string): string | null {
  return getPageMeta(pathname).seoKey;
}
