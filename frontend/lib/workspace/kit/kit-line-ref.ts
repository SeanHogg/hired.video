/**
 * A click on the kit's résumé page → the line it landed on.
 *
 * The renderer marks each line (a bullet, a summary, a header field) with
 * its shared content path (`data-content-path`, resume-renderer's
 * AnnotatedText under ResumeLineTargets). `lineTargetOf` resolves a click to
 * that path; `lineRefOfPath` (lib/build/this-line.ts) turns the path into
 * the KitLineRef the "This line" inspector reads.
 */
import type { ResumeContent } from "@shared/resume";
import { lineRefOfPath } from "@/lib/build/this-line";
import type { KitLineRef } from "./use-kit-line-selection";

/** The attribute a line on the page carries its content path in. */
export const LINE_PATH_ATTR = "data-content-path";

/** Controls inside the page (section pencils, finding flags, links, fields)
 *  keep their own click: a click on one never selects the line under it. */
const INTERACTIVE = "button, a, input, textarea, select, label, [role='button'], [role='menuitem']";

/** The content path of the line a click landed on, or null when the click
 *  was on a control, or on no line at all. `root` bounds the search. */
export function lineTargetOf(target: EventTarget | null, root?: Element | null): string | null {
  if (!target || typeof (target as Element).closest !== "function") return null;
  const el = target as Element;
  const control = el.closest(INTERACTIVE);
  if (control && (!root || root.contains(control))) return null;
  const line = el.closest(`[${LINE_PATH_ATTR}]`);
  if (!line || (root && !root.contains(line))) return null;
  return line.getAttribute(LINE_PATH_ATTR) || null;
}

/** The ref a click selects, with the path it came from (for highlighting). */
export function lineRefOfClick(content: ResumeContent, target: EventTarget | null, root?: Element | null): KitLineRef | null {
  const path = lineTargetOf(target, root);
  if (!path) return null;
  const ref = lineRefOfPath(content, path);
  return ref && ref.lineIndex >= 0 ? { ...ref, path } : null;
}
