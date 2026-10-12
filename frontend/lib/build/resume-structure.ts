/**
 * Resume STRUCTURE transform for the kit workspace.
 *
 * A template decides the LOOK (theme, fonts, columns); the structure decides
 * the ORDER the story is told in. Pure: takes a descriptor, returns a new one
 * with `sections` reordered — never mutates the preset.
 *
 *   chronological — work first (newest role leads), skills after.
 *   hybrid        — skills / highlights (projects, awards) before work; the
 *                   summary already leads via the hero. `educationFirst`
 *                   (early-career) puts education ahead of everything.
 *   functional    — skills lead; work kept brief (no bullet highlights).
 *
 * Component blocks (e.g. the career timeline) stay glued to the work section
 * so the hired.video default keeps its "timeline above work" composition.
 */
import type { ResumeStructure } from "@shared/resume-insights";
import type {
  ResumeBlock,
  ResumeSectionKey,
  ResumeTemplateDescriptor,
} from "@/types/resume-template";

export interface StructureOptions {
  /** Early-career: education leads. */
  educationFirst?: boolean;
}

const ORDER: Record<ResumeStructure, readonly ResumeSectionKey[]> = {
  chronological: ["work", "education", "projects", "volunteer", "skills", "certificates", "awards"],
  hybrid: ["skills", "projects", "awards", "work", "education", "certificates", "volunteer"],
  functional: ["skills", "projects", "awards", "certificates", "work", "education", "volunteer"],
};

function priorityList(structure: ResumeStructure, opts: StructureOptions): ResumeSectionKey[] {
  const base = ORDER[structure].filter((k) => !(opts.educationFirst && k === "education"));
  return opts.educationFirst ? ["education", ...base] : [...base];
}

export function applyResumeStructure(
  descriptor: ResumeTemplateDescriptor,
  structure: ResumeStructure,
  opts: StructureOptions = {},
): ResumeTemplateDescriptor {
  const order = priorityList(structure, opts);
  const rankOf = (key: ResumeSectionKey): number => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };
  const workRank = rankOf("work");

  const ranked = descriptor.sections.map((block, index) => ({
    // Components ride just ahead of work; unlisted sections keep their
    // authored relative order after the listed ones.
    rank: block.kind === "component" ? workRank - 0.5 : rankOf(block.key),
    index,
    block,
  }));
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);

  const sections: ResumeBlock[] = ranked.map(({ block }) => {
    if (structure === "functional" && block.kind !== "component" && block.key === "work") {
      return { ...block, showHighlights: false, layout: "list" };
    }
    return block;
  });

  return { ...descriptor, sections };
}
