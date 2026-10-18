// Pure helpers behind <UnifiedSearch /> (/search + the signed-out home):
// category → card-feed types, the client-side query narrowing, the sort
// comparator and the best-effort title/secondary column for the Table view.
// Kept free of React so the rules are testable and shared in one place.

import type { CardFeedType } from "@/lib/card-feed";
import type { SearchFilters } from "@/lib/services/search-service";

/** Search category → card-feed types it fetches (open/closed: a new
 *  category is one entry). Unlisted categories fetch nothing. */
const CATEGORY_CARD_TYPES: Readonly<Record<string, readonly CardFeedType[]>> = {
  resumes: ["resume"],
  jobs: ["job"],
  companies: ["company"],
  people: ["people"],
  // Creators are a filter on People — same fetch, viewer-side filter on isCreator
  creators: ["people"],
  // Services have a dedicated fetch path; no card-feed type
  services: [],
  // Courses also bypass the card-feed pipeline (separate /api/courses/public)
  courses: [],
  // Templates = the actual template catalog only: resume presets +
  // studio built-ins + creator-published studio templates, ALL of which
  // the "template" fetcher already surfaces through the unified registry
  // (card-feed `fetchTemplates`). Public USER resumes are NOT templates —
  // they previously rode along here (the #1613 conflation) but, carrying
  // real recent dates, out-ranked and crowded out the actual templates
  // under the "recent" sort. They live under the "resumes" category.
  // Future kinds (job_templates, learning_path_templates) get added here.
  templates: ["template"],
  articles: ["article"],
  guides: ["guide"],
  tools: ["tool"],
  faqs: ["faq"],
  media: ["video"],
  events: ["event"],
  all: ["resume", "job", "company", "people", "video", "template", "article", "guide", "tool", "faq", "event"],
};

export const categoryToTypes = (category: string): CardFeedType[] =>
  Object.prototype.hasOwnProperty.call(CATEGORY_CARD_TYPES, category)
    ? [...CATEGORY_CARD_TYPES[category]]
    : [];

// Search fields are heterogeneous across entity kinds: `keywords`, `tags`,
// and `category` can arrive as a plain string OR an array of strings
// (e.g. studio scripts ship `keywords: ["Sean Hogg", "VP Technology"]`,
// articles ship `tags: [...]`). Normalize any of those shapes to a single
// lowercase haystack so `.includes()` never explodes on a non-string.
export const fieldMatches = (value: unknown, needle: string): boolean => {
  if (!value) return false;
  if (typeof value === "string") return value.toLowerCase().includes(needle);
  if (Array.isArray(value)) return value.some((v) => fieldMatches(v, needle));
  return false;
};

/** Client-side narrowing: effective query + the hasMedia toggle. */
export function matchesSearchFilters(
  item: any,
  query: string,
  hasMedia: SearchFilters["hasMedia"],
): boolean {
  const needle = query.toLowerCase();
  const matchesSearch =
    query === "" ||
    fieldMatches(item.title, needle) ||
    fieldMatches(item.name, needle) ||
    fieldMatches(item.profession, needle) ||
    fieldMatches(item.company, needle) ||
    fieldMatches(item.summary, needle) ||
    fieldMatches(item.description, needle) ||
    fieldMatches(item.keywords, needle) ||
    fieldMatches(item.tags, needle) ||
    fieldMatches(item.category, needle);

  const matchesMedia =
    hasMedia === undefined ||
    (hasMedia === true && item.hasMedia === true) ||
    (hasMedia === false && item.hasMedia !== true);

  return matchesSearch && matchesMedia;
}

/** Comparator for the search sort modes (recent / featured / top / latest). */
export function compareSearchResults(a: any, b: any, sortBy: string): number {
  switch (sortBy) {
    case "recent": {
      const aDate = new Date(a.createdAt || a.postedDate || 0);
      const bDate = new Date(b.createdAt || b.postedDate || 0);
      return bDate.getTime() - aDate.getTime();
    }
    case "featured": {
      const aF = a.isFeatured || false;
      const bF = b.isFeatured || false;
      if (aF !== bF) return (bF ? 1 : 0) - (aF ? 1 : 0);
      return (b.views || 0) - (a.views || 0);
    }
    case "top":
      return (b.views || 0) - (a.views || 0);
    case "latest": {
      const aU = new Date(a.updatedAt || a.createdAt || a.postedDate || 0);
      const bU = new Date(b.updatedAt || b.createdAt || b.postedDate || 0);
      return bU.getTime() - aU.getTime();
    }
    default:
      return 0;
  }
}

/** Best-effort title for a result regardless of its source shape. */
export const searchItemTitle = (item: any): string =>
  (item.name as string) || (item.title as string) || "";

/** Best-effort secondary column for the Table view — price/category when a
 *  type carries one, else an em-dash so the column stays aligned. */
export const searchItemSecondary = (item: any): string => {
  if (typeof item.priceLabel === "string" && item.priceLabel) {
    return item.priceLabel;
  }
  if (typeof item.priceCents === "number") {
    return `$${(item.priceCents / 100).toFixed(2)}`;
  }
  if (typeof item.price === "number") {
    return `$${item.price.toFixed(2)}`;
  }
  if (typeof item.category === "string" && item.category) {
    return item.category;
  }
  if (typeof item.profession === "string" && item.profession) {
    return item.profession;
  }
  if (typeof item.company === "string" && item.company) {
    return item.company;
  }
  return "—";
};
