/**
 * A reviewer's "suggest a replacement" (#2220): the text they selected on the
 * reviewed résumé + what they would write instead → the structured
 * `SuggestedEdit` the owner accepts in one click (the API applies it with
 * services/resume-feedback/content-edit.ts).
 *
 * The selection is located in the résumé CONTENT, not the DOM, with the same
 * text matching the kit findings use (lib/build/line-locate.ts), so it
 * works whichever renderer drew the page. The edit replaces only the
 * selected span inside its field; the rest of the line is kept.
 *
 * Targeting mirrors the API: basics → `fieldPath` on basics; an entry →
 * its stable `id` (`referenceId`) + `fieldPath` ("summary",
 * "highlights[2]"). An entry without an id can't be targeted, so no edit is
 * offered for it (a plain comment still is). Pure.
 */
import type { ResumeContent } from "@shared/resume";
import type { SuggestedEdit } from "@shared/resume-feedback";
import { locateQuote } from "@/lib/build/line-locate";

/** The field a selected quote sits in, ready to take a replacement. Null
 *  when the quote isn't on the page or its entry has no stable id. */
export interface SuggestTarget {
  sectionKey: string;
  referenceId?: string;
  fieldPath: string;
  /** The whole field as it is now. */
  text: string;
  /** The selected span inside `text` ([start, end)). */
  start: number;
  end: number;
}

export function suggestTargetFor(content: ResumeContent | null | undefined, quote: string): SuggestTarget | null {
  if (!content || !quote.trim()) return null;
  const hit = locateQuote(content, quote);
  if (!hit) return null;
  const { field, start, end } = hit;
  const segments = field.path.split(".");
  if (field.section === "basics") {
    return { sectionKey: "basics", fieldPath: field.field, text: field.text, start, end };
  }
  if (!field.itemId) return null;
  // `work.2.highlights.1` → `highlights[1]`; `work.2.summary` → `summary`.
  const index = field.field === "highlights" ? segments[3] : undefined;
  const fieldPath = index !== undefined ? `highlights[${index}]` : field.field;
  return { sectionKey: field.section, referenceId: field.itemId, fieldPath, text: field.text, start, end };
}

/** The structured edit: the field with the selected span replaced. Null
 *  when the replacement is empty or changes nothing. */
export function buildSuggestedEdit(target: SuggestTarget, replacement: string): SuggestedEdit | null {
  const text = replacement.trim();
  let tail = target.text.slice(target.end);
  // The replacement brings its own full stop.
  if (/^[.!?]/.test(tail) && /[.!?]$/.test(text)) tail = tail.slice(1);
  const next = `${target.text.slice(0, target.start)}${text}${tail}`.trim();
  if (!text || next === target.text.trim()) return null;
  return {
    sectionKey: target.sectionKey,
    ...(target.referenceId ? { referenceId: target.referenceId } : {}),
    fieldPath: target.fieldPath,
    before: target.text,
    after: next,
  };
}
