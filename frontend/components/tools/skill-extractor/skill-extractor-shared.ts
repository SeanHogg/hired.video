// Shared types + pure helpers for /tools/skill-extractor.
//
// Everything here is side-effect free: list filtering for the saved
// resume/job pickers and the "merge extracted skills into the source
// entity" planners used by the save-back flow. The orchestration hook
// (useSkillExtractor) owns the network calls and state.

import type { SkillExtractionResult } from "@/components/SkillExtractionResults";
import type { ResumeSummary } from "@/lib/services/resume-service";
import type { JobSummary } from "@/lib/services/job-service";
import type { Resume as FrontendResume } from "@/types/resume";
import { dedupeAndOptimizeSkills } from "@shared/skill-evidence";
import type { Skill as ResumeSkill, ResumeContent } from "@shared/resume";

export const SKILL_EXTRACTOR_TOOL_ID = "skill-extractor";

export const FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;

/** Set only when the current result came from a saved resume/job so the
 *  "Add to this X" button knows where to write back to. */
export interface SkillResultSource {
  type: "resume" | "job";
  id: string;
  label: string;
}

export type SkillSaveState =
  | { kind: "idle" }
  | { kind: "success"; added: number; skipped: number; removed?: number }
  | { kind: "error"; message: string };

/** Resume payload currently loaded in the right-hand SkillNetwork preview. */
export interface SkillPreviewResume {
  id: string;
  userId: string;
  content: ResumeContent;
}

/** The server accepts ONE of: `content` (paste/upload paths), `resumeId`
 *  (saved-resume path), or `jobId` (saved-job path). */
export type SkillExtractionPayload =
  | { content: string; sourceType: SkillExtractionResult["sourceType"] }
  | { resumeId: string }
  | { jobId: string };

// ---------------------------------------------------------------------------
// Saved-list filtering — keeps the dropdown usable when a user has
// hundreds of resumes or jobs.
// ---------------------------------------------------------------------------

export function filterSavedResumes(resumes: ResumeSummary[], search: string): ResumeSummary[] {
  const q = search.trim().toLowerCase();
  const list = resumes.filter((r) => r.id);
  if (!q) return list;
  return list.filter((r) => {
    const name = String(r.title || "").toLowerCase();
    return name.includes(q);
  });
}

export function filterSavedJobs(jobs: JobSummary[], search: string): JobSummary[] {
  const q = search.trim().toLowerCase();
  if (!q) return jobs;
  return jobs.filter((j) => {
    const haystack = `${j.title ?? ""} ${j.company ?? ""}`.toLowerCase();
    return haystack.includes(q);
  });
}

// ---------------------------------------------------------------------------
// Save-back planners
// ---------------------------------------------------------------------------

export interface ResumeSkillMergePlan {
  noChange: boolean;
  added: number;
  skipped: number;
  optimizedRemoved: number;
  nextData: Record<string, unknown>;
}

/** Merge the extracted skills into the resume content. Skips any skill
 *  already present (case-insensitive) as a top-level name OR as a
 *  keyword under a category, then runs the canonical optimize pass so
 *  existing duplicates are cleaned up alongside the new appends. */
export function planResumeSkillMerge(
  content: FrontendResume["content"] | undefined,
  result: SkillExtractionResult,
  incoming: string[],
): ResumeSkillMergePlan {
  // Skills can land on the row in either case shape (legacy
  // PascalCase or canonical camelCase). Read both, normalise to
  // camelCase before merging so dedupeAndOptimizeSkills sees a
  // consistent shape.
  const rawExisting: any[] = Array.isArray(content?.skills)
    ? (content!.skills as any[])
    : [];
  const existing: ResumeSkill[] = rawExisting.map((s) => ({
    id: s?.id ?? s?.Id,
    name: (s?.name ?? s?.Name ?? "") as string,
    level: (s?.level ?? s?.Level ?? "") as string,
    keywords: Array.isArray(s?.keywords ?? s?.Keywords)
      ? ((s?.keywords ?? s?.Keywords) as string[])
      : [],
    ...(s?.yearsOfExperience != null
      ? { yearsOfExperience: s.yearsOfExperience }
      : {}),
  }));

  // "Already on the resume" needs to check BOTH top-level skill
  // names AND every category's keywords — otherwise re-running the
  // extractor adds duplicate top-level rows for skills that are
  // already represented as keywords under a category (the bug the
  // user flagged 2026-05-03 with AWS / Azure appearing twice).
  const claimed = new Set<string>();
  for (const s of existing) {
    const nm = (s.name ?? "").toLowerCase().trim();
    if (nm) claimed.add(nm);
    for (const kw of s.keywords ?? []) {
      const k = (kw ?? "").toLowerCase().trim();
      if (k) claimed.add(k);
    }
  }

  const extractedByName = new Map(
    result.skills.map((s) => [s.name.toLowerCase().trim(), s]),
  );

  const toAdd = incoming.filter((name) => !claimed.has(name.toLowerCase()));
  const newSkillRows: ResumeSkill[] = toAdd.map((name) => {
    const ex = extractedByName.get(name.toLowerCase());
    return {
      name,
      level: ex?.level ?? "",
      keywords: [],
      ...(ex?.yearsOfExperience != null
        ? { yearsOfExperience: ex.yearsOfExperience }
        : {}),
    };
  });

  // Build the merged list, then run the canonical optimize pass so
  // existing duplicates on the resume (bare "AWS" row alongside
  // "Cloud Architecture" with AWS as a keyword) get cleaned up at
  // the same time as the new appends. The optimize pass collapses
  // case-insensitive name dupes, drops bare rows already represented
  // as keywords, and dedupes keywords within each row. This is what
  // makes the extractor "tighten" the resume on every run instead
  // of growing it.
  const merged = dedupeAndOptimizeSkills([...existing, ...newSkillRows]);
  const optimizedRemoved = existing.length + newSkillRows.length - merged.length;
  const added = newSkillRows.length;
  const skipped = incoming.length - added;

  const existingEvidence = Array.isArray(content?.skillEvidence)
    ? content!.skillEvidence!
    : [];
  const nextEvidence = result.evidence
    ? [...existingEvidence, ...result.evidence]
    : existingEvidence;
  const noChange =
    added === 0 &&
    optimizedRemoved === 0 &&
    (!result.evidence || result.evidence.length === 0);

  const nextData = {
    ...(content ?? {}),
    skills: merged,
    skillEvidence: nextEvidence,
  } as any;

  return { noChange, added, skipped, optimizedRemoved, nextData };
}

export interface JobSkillMergePlan {
  added: number;
  skipped: number;
  nextSkills: string[];
}

/** Append extracted skills not already on the job (case-insensitive). */
export function planJobSkillMerge(existingSkills: unknown, incoming: string[]): JobSkillMergePlan {
  const existing: string[] = Array.isArray(existingSkills) ? existingSkills : [];
  const existingLower = new Set(
    existing.map((s) => String(s).toLowerCase().trim()).filter(Boolean),
  );
  const toAdd = incoming.filter((name) => !existingLower.has(name.toLowerCase()));
  return {
    added: toAdd.length,
    skipped: incoming.length - toAdd.length,
    nextSkills: [...existing, ...toAdd],
  };
}
