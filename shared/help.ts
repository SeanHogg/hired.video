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
