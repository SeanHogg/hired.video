// Interleave AI-tool catalog entries with learning-library courses into one
// ordered list, so a browse surface can show both content kinds in the same
// grid instead of stacking them in separate sections (where the second
// section sits below the fold and gets missed). Extracted from the old
// ToolsLearningGrid so the weave rule lives in exactly one place (DRY) and
// can be unit-tested independently of any component.

import type { ToolCatalogEntry } from "@/data/tools-catalog";
import type { PublicCourseCard } from "@/lib/services/course-service";

export type WovenItem =
  | { kind: "tool"; key: string; value: ToolCatalogEntry }
  | { kind: "course"; key: string; value: PublicCourseCard };

/**
 * Interleave tools and courses into one ordered list.
 *
 * Two rules, in priority order:
 *  1. Lead with a tool, then force a course into the SECOND slot — so a
 *     course is guaranteed to appear in the first grid row on every
 *     breakpoint (mobile 1-col through desktop 3-col). This is the whole
 *     point: surface learning above the fold.
 *  2. Spread the remaining courses evenly across the rest of the grid by
 *     quota, so the two kinds stay intermixed instead of clustering.
 *
 * Degrades cleanly: no courses → tools-only; no tools → courses-only.
 */
export function weaveToolsAndCourses(
  tools: ToolCatalogEntry[],
  courses: PublicCourseCard[],
): WovenItem[] {
  if (courses.length === 0) {
    return tools.map((t) => ({ kind: "tool", key: `tool-${t.id}`, value: t }));
  }

  const items: WovenItem[] = [];
  const total = tools.length + courses.length;
  let ti = 0;
  let ci = 0;
  for (let pos = 0; pos < total; pos++) {
    const forceCourse = pos === 1 && ci < courses.length;
    // Fraction of courses that "should" have been emitted by this position.
    const quota = Math.round(((pos + 1) / total) * courses.length);
    const wantCourse =
      ci < courses.length &&
      (forceCourse || quota > ci || ti >= tools.length);

    if (wantCourse) {
      const c = courses[ci++];
      items.push({ kind: "course", key: `course-${c.id}`, value: c });
    } else {
      const t = tools[ti++];
      items.push({ kind: "tool", key: `tool-${t.id}`, value: t });
    }
  }
  return items;
}
