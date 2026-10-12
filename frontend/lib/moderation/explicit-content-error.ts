/**
 * The explicit-content gate's 422 `EXPLICIT_CONTENT` on the client. The API
 * sends `error.details = { categories, subject }` (ids, not prose); the
 * user always sees localized category names built here — never the API's
 * English message. Used by the api-client (so `err.message` is localized for
 * every caller) and by <GlobalExplicitContentNotice/> (one toast for every
 * surface: image upload, profile save, personalization save, …).
 */
import { EXPLICIT_CATEGORIES, normalizeCategories, type ExplicitCategory } from "@shared/moderation/explicit";

export const EXPLICIT_CONTENT_CODE = "EXPLICIT_CONTENT";

export type ExplicitSubject = "text" | "image";

export interface ExplicitContentInfo {
  categories: ExplicitCategory[];
  subject: ExplicitSubject;
}

/** Read `{ categories, subject }` from an error's details / context. */
export function explicitInfoFrom(details: unknown): ExplicitContentInfo {
  const d = (details && typeof details === "object" ? details : {}) as { categories?: unknown; subject?: unknown };
  return {
    categories: Array.isArray(d.categories) ? normalizeCategories(d.categories) : [],
    subject: d.subject === "image" ? "image" : "text",
  };
}

/** True for an api-client error carrying the explicit-content code. */
export function isExplicitContentError(err: unknown): boolean {
  return (err as { context?: { serverCode?: unknown } } | null)?.context?.serverCode === EXPLICIT_CONTENT_CODE;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** "weapons and swearing" in the viewer's language. */
export function formatExplicitCategories(categories: readonly ExplicitCategory[], t: Translate, language: string): string {
  const labels = categories
    .filter((c) => (EXPLICIT_CATEGORIES as readonly string[]).includes(c))
    .map((c) => t(`moderation.category.${c}`));
  try {
    return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(labels);
  } catch {
    return labels.join(", ");
  }
}

/** The full localized sentence for a blocked upload / save. */
export function explicitContentMessage(info: ExplicitContentInfo, t: Translate, language: string): string {
  const prefix = info.subject === "image" ? "moderation.blocked.image" : "moderation.blocked.text";
  if (info.categories.length === 0) return t(`${prefix}Generic`);
  return t(prefix, { categories: formatExplicitCategories(info.categories, t, language) });
}
