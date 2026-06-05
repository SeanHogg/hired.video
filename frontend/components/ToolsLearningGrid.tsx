// A single grid that intermixes AI tools and learning-library courses so
// both content kinds are visible in the first row — instead of tools and
// courses living in two stacked sections where the course section sits
// below the fold and signed-out visitors (who don't scroll) never see it.
//
// The component self-fetches the published-course library and self-weaves,
// so the page stays thin and the weave rule lives in exactly one place
// (DRY). When no courses are available it degrades to a tools-only grid.

import { useEffect, useState } from "react";
import { ToolCard } from "@/components/ToolCard";
import CourseMarketplaceCard, {
  type CourseMarketplaceItem,
} from "@/components/CourseMarketplaceCard";
import {
  courseService,
  type PublicCourseCard,
} from "@/lib/services/course-service";
import type { ToolCatalogEntry } from "@/data/tools-catalog";

interface Props {
  tools: ToolCatalogEntry[];
  /** Cap on how many courses to weave in. */
  courseLimit?: number;
}

type WovenItem =
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
 */
function weave(
  tools: ToolCatalogEntry[],
  courses: PublicCourseCard[],
): WovenItem[] {
  const items: WovenItem[] = [];
  if (courses.length === 0) {
    return tools.map((t) => ({ kind: "tool", key: `tool-${t.id}`, value: t }));
  }

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

export function ToolsLearningGrid({ tools, courseLimit = 12 }: Props) {
  const [courses, setCourses] = useState<PublicCourseCard[]>([]);

  // Tools render immediately; courses weave in once fetched so a slow
  // course call never blocks the (static) tool grid from painting.
  useEffect(() => {
    let cancelled = false;
    courseService
      .listPublished(courseLimit)
      .then((rows) => {
        if (!cancelled) setCourses(rows);
      })
      .catch(() => {
        if (!cancelled) setCourses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [courseLimit]);

  const woven = weave(tools, courses);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
      {woven.map((item) =>
        item.kind === "tool" ? (
          <ToolCard key={item.key} tool={item.value} />
        ) : (
          <CourseMarketplaceCard
            key={item.key}
            item={item.value as CourseMarketplaceItem}
          />
        ),
      )}
    </div>
  );
}
