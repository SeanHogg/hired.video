/**
 * Locate a Work / Volunteer / Project entry on a resume by content-
 * matching a sample bullet. Used by the `consolidate_section_highlights`
 * registry tool — the AI Brain (and the optimizer Action button) pass a
 * single sample bullet, the matcher walks the resume and returns
 * enough handles to (a) pull the section's full bullet list + parent
 * context for the consolidate-highlights LLM call, and (b) write the
 * consolidated bullets back when the user accepts.
 *
 * Reuses `looseEquals` from apply-rewrite.ts so a single matcher
 * heuristic governs every "find this LLM-rewritten bullet on the
 * resume" path.
 */

import type { ResumeContent } from "@shared/resume";
import { looseEquals } from "@/lib/tools/apply-rewrite";

export type SectionKind = "work" | "volunteer" | "projects";

export interface SectionHit {
  kind: SectionKind;
  index: number;
  /** Human-readable label for the preview UI ("Director of IT @ Acme"). */
  label: string;
  /** Highlights array as it stands today — what the consolidate LLM operates on. */
  highlights: string[];
  /** Context the LLM uses to ground the rewrite. */
  context: { role?: string; organization?: string; summary?: string };
}

/** Find every section whose `highlights` contains a bullet matching
 *  `sample`. In practice the matcher returns 0 or 1 hit — duplicate
 *  bullets across sections are rare; the caller takes the first. */
export function findSectionsContaining(
  content: ResumeContent,
  sample: string,
): SectionHit[] {
  const hits: SectionHit[] = [];

  content.work?.forEach((w, i) => {
    if (w.highlights?.some((h) => looseEquals(h, sample))) {
      hits.push({
        kind: "work",
        index: i,
        label: [w.position, w.name].filter(Boolean).join(" @ ") || `Work entry ${i + 1}`,
        highlights: [...(w.highlights ?? [])],
        context: {
          role: w.position || undefined,
          organization: w.name || undefined,
          summary: w.summary || undefined,
        },
      });
    }
  });

  content.volunteer?.forEach((v, i) => {
    if (v.highlights?.some((h) => looseEquals(h, sample))) {
      hits.push({
        kind: "volunteer",
        index: i,
        label: [v.position, v.organization].filter(Boolean).join(" @ ") || `Volunteer entry ${i + 1}`,
        highlights: [...(v.highlights ?? [])],
        context: {
          role: v.position || undefined,
          organization: v.organization || undefined,
          summary: v.summary || undefined,
        },
      });
    }
  });

  content.projects?.forEach((p, i) => {
    if (p.highlights?.some((h) => looseEquals(h, sample))) {
      hits.push({
        kind: "projects",
        index: i,
        label: p.name || `Project ${i + 1}`,
        highlights: [...(p.highlights ?? [])],
        context: {
          role: undefined,
          organization: p.entity || undefined,
          summary: p.description || undefined,
        },
      });
    }
  });

  return hits;
}

/** Write a fresh highlights array onto the section identified by
 *  `{ kind, index }`. Mutates the passed `content` in place — caller
 *  is responsible for cloning first if they need the original. */
export function setSectionHighlights(
  content: ResumeContent,
  hit: { kind: SectionKind; index: number },
  highlights: string[],
): void {
  if (hit.kind === "work" && content.work?.[hit.index]) {
    content.work[hit.index].highlights = highlights;
  } else if (hit.kind === "volunteer" && content.volunteer?.[hit.index]) {
    content.volunteer[hit.index].highlights = highlights;
  } else if (hit.kind === "projects" && content.projects?.[hit.index]) {
    content.projects[hit.index].highlights = highlights;
  }
}
