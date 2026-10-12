/**
 * Context-aware help — shared contract (v2: content-as-files).
 *
 * ARCHITECTURE: help CONTENT (titles, bodies, per-locale variants) lives in
 * Markdown files bundled into the frontend (`frontend/content/help/*.md`),
 * served with zero DB/network work and cached as immutable static assets.
 * The DB is a META store, used strictly for SEARCH + MAPPING:
 *   - `help_mappings` (context → ordered slug list) — SuperAdmin-curated.
 *   - Cloudflare Vectorize (vectors keyed by slug) — semantic search.
 * The DB never stores help content. These DTOs therefore carry SLUGS, not
 * bodies — the client joins slugs to the bundled content catalog.
 *
 * The join key for mappings is `AIContextType` (the AI brain's route→context
 * seam), reused so help + AI assistance share one route taxonomy.
 */

import type { AIContextType } from "./ai-context-types.js";

/** The page-context a help mapping is keyed on. */
export type HelpContextKey = AIContextType;

/**
 * Default context → ordered-slug mapping, bundled with the client.
 *
 * This is the SSoT for the ZERO-DB default: the help drawer resolves a
 * context's slugs from here (joined to the bundled content catalog) so help
 * renders even when `help_mappings` is empty/unavailable (fresh env, migration
 * not yet applied, DB hiccup). The DB `help_mappings` table is therefore a
 * pure SuperAdmin OVERRIDE layer — when it has rows for a context they win;
 * otherwise this default is used. (The 0210 seed mirrors these pairs as the
 * initial admin-curation state.) Slugs with no matching content file are
 * dropped at resolve time, so listing an as-yet-unwritten slug is harmless.
 */
export const DEFAULT_HELP_MAPPING: Partial<Record<HelpContextKey, string[]>> = {
  general: ["create-first-video-resume", "supported-file-formats", "set-up-profile", "getting-started", "tutorials"],
  dashboard: ["set-up-profile", "getting-started", "candidate-pipeline"],
  "profile-edit": ["set-up-profile", "change-password", "change-role", "delete-account"],
  "profile-view": ["networking"],
  studio: ["create-first-video-resume", "good-video-resume", "edit-video-resume", "private-video-resume", "video-best-practices"],
  "resume-edit": ["good-video-resume", "edit-video-resume", "video-best-practices"],
  "resume-create": ["create-first-video-resume", "good-video-resume"],
  "resume-view": ["private-video-resume", "edit-video-resume"],
  "job-list": ["job-matching", "track-applications", "job-match-notifications", "job-search"],
  search: ["job-matching", "search-candidates", "job-search"],
  "job-create": ["post-a-job", "search-candidates"],
};

/** Context keys that carry default help (membership set for the drawer). */
export const DEFAULT_HELP_CONTEXT_KEYS = Object.keys(DEFAULT_HELP_MAPPING) as HelpContextKey[];

/** Help item kinds (mirrors the frontmatter `kind`). */
export const HELP_KINDS = ["faq", "guide"] as const;
export type HelpKind = (typeof HELP_KINDS)[number];

/** GET /api/help/resolve?context=<key> — the curated slug list for a context.
 *  The client renders cards by joining these slugs to the bundled catalog. */
export interface ResolveHelpResponse {
  context: HelpContextKey;
  slugs: string[];
}

/** GET /api/help/search?q= — semantic-search slug hits (ranked). */
export interface HelpSearchResponse {
  slugs: string[];
  /** True when results came from Vectorize; false when semantic search is
   *  unavailable (client should fall back to its local keyword index). */
  semantic: boolean;
}

/** A single curation row in the SuperAdmin management list. */
export interface HelpMappingListItem {
  id: string;
  contextKey: HelpContextKey;
  slug: string;
  position: number;
  isActive: boolean;
  updatedAt: string;
}

/** Body for POST /api/help/mappings (SuperAdmin set/curate). */
export interface SetHelpMappingInput {
  contextKey: HelpContextKey;
  slug: string;
  position?: number;
}

/** One item to (re)index for semantic search. The client reads the bundled
 *  content and sends slug + text; the Worker embeds it (Workers AI) and
 *  upserts the vector into Vectorize. Body text is transient on the server
 *  (embedded, never persisted) — content of record stays in the files. */
export interface HelpIndexItem {
  slug: string;
  /** Concatenated title + summary + body used to produce the embedding. */
  text: string;
}
