/**
 * Declarative page → AIContextType registry.
 *
 * Replaces the hand-maintained `detectContextFromRoute` switch that
 * lived inside AIChatPanel and recognized only ~15 routes (gap #1621).
 * Rules are evaluated top-to-bottom; the first `test` that matches the
 * pathname wins, so order is specificity — most specific patterns
 * first, broad list/index patterns last, `general` as the implicit
 * fallback.
 *
 * Adding a surface = one rule here. The AI panel, the system-prompt
 * builder, and (under #1620) the MCP server all derive the active
 * context from this single function rather than re-deriving per
 * consumer.
 */

import type { AIContextType } from "@shared/ai-context-types";

interface PageContextRule {
  /** Matched against `location.pathname`. */
  test: RegExp;
  contextType: AIContextType;
}

/** Ordered, most-specific-first. */
export const PAGE_CONTEXT_RULES: PageContextRule[] = [
  // Dashboard
  { test: /^\/dashboard$/, contextType: "dashboard" },

  // Resume — create / edit / view / list (order matters)
  { test: /^\/resumes\/(new|create)\b/, contextType: "resume-create" },
  { test: /^\/resumes\/edit\//, contextType: "resume-edit" },
  { test: /^\/resumes\/.+\/edit\b/, contextType: "resume-edit" },
  { test: /^\/resumes\/.+/, contextType: "resume-view" },
  { test: /^\/resumes\/?$/, contextType: "resume-list" },

  // Job — create / edit / view / list
  { test: /^\/jobs\/(new|create)\b/, contextType: "job-create" },
  { test: /^\/jobs\/edit\//, contextType: "job-edit" },
  { test: /^\/jobs\/.+\/edit\b/, contextType: "job-edit" },
  { test: /^\/jobs\/.+/, contextType: "job-view" },
  { test: /^\/jobs\/?$/, contextType: "job-list" },
  { test: /^\/post-a-job\b/, contextType: "job-create" },

  // Studio — every studio surface (editor, preview, wizard, settings…)
  { test: /^\/studio(\/|$)/, contextType: "studio" },

  // Articles — author vs read vs browse
  { test: /^\/articles\/(new|create)\b/, contextType: "article-edit" },
  { test: /^\/articles\/.+\/edit\b/, contextType: "article-edit" },
  { test: /^\/articles\/.+/, contextType: "article-view" },
  { test: /^\/blog\/.+/, contextType: "article-view" },

  // Courses + learning paths — author vs learn vs browse
  { test: /^\/course-authoring\b/, contextType: "course-author" },
  { test: /^\/courses\/review-queue\b/, contextType: "course-author" },
  { test: /^\/courses\/.+\/(author|edit)\b/, contextType: "course-author" },
  { test: /^\/courses\/.+/, contextType: "course-learn" },
  { test: /^\/learn(\/|$)/, contextType: "course-learn" },
  { test: /^\/learning(\/|$)/, contextType: "learning" },

  // Interview practice
  { test: /^\/interview(\/|$)/, contextType: "interview-practice" },

  // Companies — create / edit / view / browse
  { test: /^\/companies\/(new|create)\b/, contextType: "company-edit" },
  { test: /^\/companies\/.+\/edit\b/, contextType: "company-edit" },
  { test: /^\/companies\/.+/, contextType: "company-view" },

  // Profile — edit vs view
  { test: /^\/profile\/edit\b/, contextType: "profile-edit" },
  { test: /^\/settings\b/, contextType: "profile-edit" },
  { test: /^\/profile\//, contextType: "profile-view" },
  { test: /^\/people\/.+/, contextType: "profile-view" },

  // Tasks
  { test: /^\/tasks(\/|$)/, contextType: "tasks" },

  // Communication
  { test: /^\/outreach$/, contextType: "outreach" },
  { test: /^\/messages(\/|$)/, contextType: "messaging" },

  // Discovery / browse surfaces
  { test: /^\/search$/, contextType: "search" },
  { test: /^\/people$/, contextType: "search" },
  { test: /^\/companies\/?$/, contextType: "search" },
  { test: /^\/articles\/?$/, contextType: "search" },
  { test: /^\/(index)?$/, contextType: "search" },
];

/**
 * Resolve the AI context type for a route. Always resolves — falls back
 * to `"general"` when no rule matches (e.g. marketing, auth, admin,
 * guides), which is the correct neutral context for those pages.
 */
export function detectContextType(pathname: string): AIContextType {
  for (const rule of PAGE_CONTEXT_RULES) {
    if (rule.test.test(pathname)) return rule.contextType;
  }
  return "general";
}
