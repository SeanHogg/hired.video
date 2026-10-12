// Pure filter helpers over `TEMPLATE_CATALOG` keyed on `Audience`.
//
// Per the standing DRY rule, both #900 (AudienceLandingPage) and #901
// (TemplateLandingPage "related templates" grid) read from these helpers
// rather than re-deriving the filter inline. They also give tests a
// pure-data surface to assert against without rendering a page.
//
// Single source of truth: TEMPLATE_CATALOG + a `TemplateDef.audiences[]`
// each — no parallel `AUDIENCE_TO_TEMPLATES` lookup table.

import { TEMPLATE_CATALOG, type TemplateDef } from "@/lib/studio/templates/catalog";
import type { Audience } from "@/lib/studio/templates/audiences";

/** Every template that lists `audience` in its `audiences[]` (preserves
 *  the catalog's declaration order so callers don't need to re-sort). */
export function templatesForAudience(audience: Audience): TemplateDef[] {
  return TEMPLATE_CATALOG.filter((t) => t.audiences.includes(audience));
}

/** Templates that share at least one audience with `template`, excluding
 *  the template itself, capped at `limit`. Used for the "More for X"
 *  related-templates grid on `/templates/:slug`. */
export function relatedTemplatesFor(template: TemplateDef, limit: number): TemplateDef[] {
  return TEMPLATE_CATALOG.filter(
    (t) => t.id !== template.id && t.audiences.some((a) => template.audiences.includes(a)),
  ).slice(0, limit);
}
