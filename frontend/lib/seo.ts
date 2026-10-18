/**
 * SEO facade. Every export that lived here before the split is re-exported
 * so existing `@/lib/seo` / `./seo` imports and `vi.mock("…/lib/seo")`
 * paths keep working. Implementation lives under `lib/seo/`:
 *   types.ts          SEOData
 *   defaults.ts       ORGANIZATION_SCHEMA + DEFAULT_SEO
 *   page-seo.ts       PAGE_SEO (assembled from page-seo-data/*)
 *   canonical.ts      canonicalizePath + defaultBreadcrumbs (URL helpers)
 *   dom.ts            updateMetaTags (meta / link / JSON-LD head writers)
 *   hooks.ts          useSEO, useBreadcrumbs, usePageChrome, useDefaultBreadcrumbs
 * Note: no lib/seo/index.ts on purpose — "@/lib/seo" resolves to this file.
 */
export type { SEOData } from "./seo/types";
export { ORGANIZATION_SCHEMA, DEFAULT_SEO } from "./seo/defaults";
export { PAGE_SEO } from "./seo/page-seo";
export { canonicalizePath, defaultBreadcrumbs } from "./seo/canonical";
export { updateMetaTags } from "./seo/dom";
export {
  useSEO,
  useBreadcrumbs,
  usePageChrome,
  useDefaultBreadcrumbs,
} from "./seo/hooks";

// Re-export the shared structured-data builders so existing imports from
// "@/lib/seo" / "./seo" (seo-ugc, BlogPost, Pricing, tests) keep working —
// the canonical definitions now live in @shared/structured-data.
export {
  generateStructuredData,
  generateBreadcrumbs,
  generatePricingSchema,
} from "@shared/structured-data";
export type { JobPostingInput } from "@shared/structured-data";
