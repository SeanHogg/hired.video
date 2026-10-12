/**
 * Article `category` is free-text, but the content library uses a known set
 * (see frontend/data/blog-posts.ts). Localize the known values through i18n
 * while letting any custom category fall back to its raw string.
 *
 * Mirrors `courseCategoryI18nKey` — one seam per taxonomy so every
 * category-chip render site resolves identically via
 * `t(key, { defaultValue: category })`. (Unifying the per-taxonomy helpers
 * into one generic resolver is tracked as gap #1952.)
 */
export function articleCategoryI18nKey(category: string): string {
  return `articleCategory.${category}`;
}
