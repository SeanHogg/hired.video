/**
 * The ONE /studio deep-link table. Order is precedence — the first entry
 * whose `matches` holds handles the URL (same order the old mount effect
 * checked them). The trailing `unresolvedEntry` catches a deep-link param
 * nothing above could use (an unknown `?contentTemplate=`, an unparseable
 * `?subject=`, an empty `?projectId=`) so the page drops it instead of
 * sitting on the loading shell.
 */
import { STUDIO_EDIT_PARAMS } from "@/lib/studio/studio-authoring";
import { projectIdEntry, legacyResumeEntry } from "./redirect";
import { jobEditEntry } from "./job";
import { articleEditEntry } from "./article";
import { companyEditEntry } from "./company";
import { contentTemplateEntry } from "./content-template";
import { visualTemplateEntry } from "./template";
import { studioTemplateEntry } from "./studio-template";
import { blankEntry } from "./blank";
import { FAILED, type EntryContext, type EntryHandler, type EntryOutcome } from "./types";

/** The landing page itself — where a failed deep link is replaced to. */
export const STUDIO_LANDING_PATH = "/studio";

/** Every query param that makes /studio a deep link (vs the chooser). */
export const DEEP_LINK_PARAMS: readonly string[] = [
  "projectId",
  ...STUDIO_EDIT_PARAMS,
  "contentTemplate",
  "template",
  "studioTemplate",
  "subject",
  "capture",
  "new",
];

const unresolvedEntry: EntryHandler = {
  id: "unresolved",
  matches: (params) => DEEP_LINK_PARAMS.some((p) => params.has(p)),
  run: async () => FAILED,
};

export const ENTRY_HANDLERS: readonly EntryHandler[] = [
  projectIdEntry,
  legacyResumeEntry,
  jobEditEntry,
  articleEditEntry,
  companyEditEntry,
  contentTemplateEntry,
  visualTemplateEntry,
  studioTemplateEntry,
  blankEntry,
  unresolvedEntry,
];

export function matchEntry(params: URLSearchParams): EntryHandler | null {
  return ENTRY_HANDLERS.find((h) => h.matches(params)) ?? null;
}

/** Identity of the deep link in the URL — the hook runs each one once and
 *  re-runs when it changes on the same mounted page. Null = no deep link. */
export function entryKey(params: URLSearchParams): string | null {
  if (!matchEntry(params)) return null;
  const parts = DEEP_LINK_PARAMS.filter((p) => params.has(p)).map(
    (p) => `${p}=${params.getAll(p).join(",")}`,
  );
  return parts.join("&");
}

/**
 * How a run ended: `navigate` (go there), `left` (the create seam already
 * navigated elsewhere itself — the anon editor, a career kit — so leave the
 * URL alone), `failed` (clear the shell and drop the deep link).
 */
export type EntryResolution =
  | { type: "navigate"; to: string }
  | { type: "left" }
  | { type: "failed" };

export async function runEntry(
  handler: EntryHandler,
  ctx: EntryContext,
  hasLeft: () => boolean,
): Promise<EntryResolution> {
  let outcome: EntryOutcome;
  try {
    outcome = await handler.run(ctx);
  } catch {
    // Handlers toast their own errors; a stray throw must still clear the shell.
    outcome = FAILED;
  }
  if (outcome.type === "navigate") return outcome;
  return hasLeft() ? { type: "left" } : { type: "failed" };
}
