import { useSearchParams } from "react-router-dom";

import { effectiveSearchQuery } from "@/lib/card-feed";

/** Canonical read of the `?q=` URL parameter for every searchable page.
 *
 * Returns two values because consumers genuinely need both:
 *   - `raw`        the user-visible string. Use this as the `value` of a
 *                  controlled `<Input>` so the box shows "R" as the user
 *                  types past sub-threshold input.
 *   - `effective`  the threshold-gated query. Use this as the search
 *                  argument to any fetch / filter — sub-threshold input
 *                  ("", "A") normalises to "" via `effectiveSearchQuery`
 *                  so single-keystroke fanout is suppressed.
 *
 * Why a hook instead of per-page `searchParams.get("q") ?? ""`: the gate
 * lives in exactly one place (`effectiveSearchQuery` in `card-feed.ts`),
 * and every per-domain page (Jobs / Companies / People / Resumes / Tools
 * / Help / BlogIndex) reads the same way. New pages that add a search
 * input pick up the gate by importing the hook; the next "I added a
 * search bar and forgot the threshold" regression class disappears.
 */
export function useSearchQueryParam(): {
  raw: string;
  effective: string;
} {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get("q") ?? "";
  return { raw, effective: effectiveSearchQuery(raw) };
}
