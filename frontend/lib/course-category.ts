/**
 * Course `category` is a free-text varchar on the courses schema, but the
 * seeded platform library uses a small known set (AI / Career / Engineering).
 * Localize those known values through i18n while letting any custom
 * creator-authored category fall back to its raw string.
 *
 * One seam so every category-badge render site resolves identically — pass
 * the result through `t(key, { defaultValue: category })`.
 */
export function courseCategoryI18nKey(category: string): string {
  return `courseCategory.${category}`;
}
