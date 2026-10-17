import { schema } from "../../db/index.js";
import type { ParsedJob } from "./job-page-parse.js";

const { jobItems } = schema;

/**
 * Compute the backfill diff for `POST /api/jobs/:id/refresh`. Extracted
 * from the route so the merge policy is directly unit-testable.
 *
 * Contract:
 *  - Never overwrites a non-null/non-empty stored value — this is a
 *    backfill, not a re-extract.
 *  - Honors the caller-supplied `missingFields` allow-list strictly.
 *    Passing `null` falls back to "fill anything empty" (used when the
 *    caller trusts the server to decide).
 *  - `details.*` subfields are merged key-by-key; the returned
 *    `updates.details` is the full merged bag (so the route can write
 *    it back as a single jsonb column).
 *
 * Returns `{ updates, updatedFields }` where `updatedFields` lists the
 * column/dotted-path names that actually changed, so the client UI can
 * show "Updated 3 fields".
 */
export function computeRefreshBackfill(args: {
  row: typeof jobItems.$inferSelect;
  parsed: ParsedJob;
  url?: string;
  missingFields: string[] | null;
}): { updates: Record<string, unknown>; updatedFields: string[] } {
  const { row, parsed, url, missingFields } = args;
  const allowField = (col: string) => missingFields === null || missingFields.includes(col);

  const updates: Record<string, unknown> = {};
  const updatedFields: string[] = [];

  const fillIfEmpty = (col: string, storedVal: unknown, parsedVal: unknown) => {
    if (!allowField(col)) return;
    const stored = storedVal as string | number | null | undefined;
    const fresh = parsedVal as string | number | null | undefined;
    if (stored != null && stored !== "") return;
    if (fresh == null || fresh === "") return;
    updates[col] = fresh;
    updatedFields.push(col);
  };

  fillIfEmpty("description", row.description, parsed.description);
  fillIfEmpty("location", row.location, parsed.location);
  fillIfEmpty("jobType", row.jobType, parsed.jobType);
  fillIfEmpty("experienceLevel", row.experienceLevel, parsed.experienceLevel);
  fillIfEmpty("salaryMin", row.salaryMin, parsed.salaryMin);
  fillIfEmpty("salaryMax", row.salaryMax, parsed.salaryMax);
  fillIfEmpty("salaryCurrency", row.salaryCurrency, parsed.salaryCurrency);
  fillIfEmpty("sourceUrl", row.sourceUrl, url || "");

  // applyUrl update policy: always overwrite with a fresh distinct
  // candidate. Unlike other fields (backfill-only), apply links drift
  // — a posting may first land with just sourceUrl, later expose a
  // Workday/Greenhouse form, and eventually change to a different ATS.
  // Each rescan is the user's signal that the stored value is stale, so
  // we replace it whenever we find something better.
  //
  // A "fresh candidate" is parsed.applyUrl or the current request URL,
  // filtered to exclude anything that equals sourceUrl (that's the same
  // no-apply-link fallback the extension already shows).
  if (allowField("applyUrl")) {
    const sourceNorm = (row.sourceUrl || "").toString();
    const parsedCandidate =
      parsed.applyUrl && parsed.applyUrl !== sourceNorm ? parsed.applyUrl : undefined;
    const urlCandidate = url && url !== sourceNorm ? url : undefined;
    const candidate = parsedCandidate || urlCandidate;
    if (candidate && candidate !== row.applyUrl) {
      updates.applyUrl = candidate;
      updatedFields.push("applyUrl");
    }
  }

  if (allowField("skillsRequired")) {
    const storedSkills = (row.skillsRequired ?? []) as string[];
    if (
      (!storedSkills || storedSkills.length === 0) &&
      Array.isArray(parsed.skills) && parsed.skills.length > 0
    ) {
      updates.skillsRequired = parsed.skills;
      updatedFields.push("skillsRequired");
    }
  }

  // details jsonb — merge per-key. Each subfield can be requested via
  // "details.responsibilities" etc., or the whole bag via "details".
  const storedDetails = ((row as Record<string, unknown>).details ?? {}) as Record<string, unknown>;
  const mergedDetails: Record<string, unknown> = { ...storedDetails };
  let detailsChanged = false;
  const fillDetailIfEmpty = (key: string, val: unknown) => {
    if (!allowField(`details.${key}`) && !allowField("details")) return;
    const current = storedDetails[key];
    const isEmpty = current == null || (Array.isArray(current) && current.length === 0);
    if (!isEmpty) return;
    if (!Array.isArray(val) || val.length === 0) return;
    mergedDetails[key] = val;
    detailsChanged = true;
    updatedFields.push(`details.${key}`);
  };
  fillDetailIfEmpty("responsibilities", parsed.responsibilities);
  fillDetailIfEmpty("requirements", parsed.requirements);
  fillDetailIfEmpty("qualifications", parsed.qualifications);
  fillDetailIfEmpty("benefits", parsed.benefits);
  if (detailsChanged) updates.details = mergedDetails;

  return { updates, updatedFields };
}
