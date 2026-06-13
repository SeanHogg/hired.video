/**
 * Context-aware help — shared contract.
 *
 * A SuperAdmin curates which help articles surface on each *kind* of page.
 * The join key is the existing `AIContextType` (the route→context seam in
 * `frontend/lib/config/page-meta-registry.ts` and `@shared/ai-context-types`)
 * — we deliberately reuse that classification instead of inventing a second
 * route-matching scheme (DRY). On any page, the slide-out HelpDrawer resolves
 * its current context key and asks the API for the curated article set.
 *
 * Lives in `shared/` because the contract is two-sided: the API route +
 * HelpMappingService produce it, the frontend HelpDrawer + admin curation
 * page consume it.
 */

import type { AIContextType } from "./ai-context-types.js";

/** The page-context a help mapping is keyed on. Identical to the AI brain's
 *  context classification so help + AI assistance share one route taxonomy. */
export type HelpContextKey = AIContextType;

/** A help article projected for the drawer + search results. Mirrors the
 *  fields the article card needs — no body, kept light for list payloads. */
export interface HelpArticleCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  /** article | faq | guide — drives the card's icon + grouping. */
  kind: string;
  /** Author user id — the public article URL is /articles/:userId/:slug. */
  userId: string;
  readMinutes: number;
}

/** GET /api/help/resolve?context=<key> — the curated set for a context. */
export interface ResolveHelpResponse {
  context: HelpContextKey;
  articles: HelpArticleCard[];
}

/** A single FAQ — `question` is the article title, `answer` its body.
 *  GET /api/help/faqs returns these grouped by category. */
export interface HelpFaqItem {
  id: string;
  slug: string;
  userId: string;
  question: string;
  answer: string;
}

/** FAQs grouped by category — the shape the Help page's accordion +
 *  the card feed both consume (replaces the old static help-faqs.ts). */
export interface HelpFaqGroup {
  category: string;
  questions: HelpFaqItem[];
}

/** A single curation row in the SuperAdmin management list. */
export interface HelpMappingListItem {
  id: string;
  contextKey: HelpContextKey;
  articleId: string;
  articleTitle: string;
  articleKind: string;
  position: number;
  isActive: boolean;
  updatedAt: string;
}

/** Body for POST /api/help/mappings (SuperAdmin set/curate). */
export interface SetHelpMappingInput {
  contextKey: HelpContextKey;
  articleId: string;
  position?: number;
}
