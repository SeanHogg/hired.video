/**
 * Per-domain `category` label resolvers — one seam per taxonomy so every
 * category-chip render site localizes identically. Each helper maps a raw
 * domain value to `t("<domain>Category.<value>", { defaultValue: <humanized> })`,
 * so a known value resolves through the i18n catalog while an unknown / custom
 * value still renders readably (raw → humanized).
 *
 * Consolidates the previously inline `{event.category}` / `{service.category}` /
 * `{item.category}` raw renders flagged by gap #2104. Mirrors the existing
 * `articleCategoryI18nKey` seam (frontend/lib/article-category.ts) and the
 * course-category pattern — DRY: one helper per domain, every site calls it.
 *
 * `t` is the react-i18next translator, injected by the caller (these helpers
 * are pure so they can run at module scope / outside a component too).
 */

type TFn = (key: string, opts?: { defaultValue?: string }) => string;

/**
 * Humanize a raw taxonomy token for the fallback label: turns slugs/keys like
 * `career-fair`, `job_opportunity`, `streak_bonus` into `Career Fair`,
 * `Job Opportunity`, `Streak Bonus`. Values that are already human-readable
 * (e.g. the service taxonomy stores "Resume Review") pass through unchanged.
 */
export function humanizeCategory(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Public-event category (event_categories.slug — built-in + workspace custom). */
export function eventCategoryLabel(value: string, t: TFn): string {
  return t(`eventCategory.${value}`, { defaultValue: humanizeCategory(value) });
}

/**
 * Service-offering category. The taxonomy stores the human label as the value
 * (e.g. "Resume Review"), so the i18n key is the slugified form and the raw
 * stored string is the fallback.
 */
export function serviceCategoryLabel(value: string, t: TFn): string {
  const key = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return t(`serviceCategory.${key}`, { defaultValue: value });
}

/** External-email classification category (shared EmailCategory + profile keys). */
export function emailCategoryLabel(value: string, t: TFn): string {
  return t(`emailCategory.${value}`, { defaultValue: humanizeCategory(value) });
}

/** Points-ledger activity category (earn / redeem / streak_bonus / …). */
export function pointsCategoryLabel(value: string, t: TFn): string {
  return t(`pointsCategory.${value}`, { defaultValue: humanizeCategory(value) });
}
