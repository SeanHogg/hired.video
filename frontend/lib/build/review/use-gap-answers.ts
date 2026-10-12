/**
 * useGapAnswers — the person's answers to "the job asks for X, the résumé
 * shows no evidence of it". Shared by tailor (cards in the chat column) and
 * create-from-a-job (cards on the page).
 *
 *   skill gap        "I have it" → a skill; "No" → stays off
 *   experience gap   one line → tightened into a bullet by the same
 *                    no-invention rewrite the merge uses (consolidate),
 *                    on the job the person picks (`targets`; the one the
 *                    gap is anchored to by default); "Skip" → off
 *
 * Answers become ConfirmedFacts (shared/resume-tailor.ts) — applied to the
 * draft, and to the master too when "Also add it to my master" is on (the
 * default), so the next job does not ask again.
 */
import { useCallback, useMemo, useState } from "react";
import type { ResumeContent } from "@shared/resume";
import { readAt } from "@shared/resume-path";
import { entryNaturalKey, type ConfirmedFact, type EntryRef, type JobGap } from "@shared/resume-tailor";
import { resumeService } from "@/lib/services/resume-service";

export type GapAnswer =
  | { status: "open" }
  | { status: "declined" }
  | { status: "writing" }
  /** `where`: the job a bullet went to ("CIO · Alliance"), for the card. */
  | { status: "confirmed"; fact: ConfirmedFact; where?: string };

/** A work entry a written answer can go to. */
export interface GapTarget {
  path: string;
  label: string;
}

/** Every job on the résumé, as "Position · Employer". */
export function gapTargets(content: ResumeContent | null): GapTarget[] {
  return (content?.work ?? []).map((w, i) => ({
    path: `work.${i}`,
    label: [w.position, w.name].filter((s) => typeof s === "string" && s.trim()).join(" · ") || `#${i + 1}`,
  }));
}

/** Where an experience gap's answer goes unless the person picks another job. */
export function defaultTarget(gap: JobGap, targets: readonly GapTarget[]): string | undefined {
  const anchored = gap.anchorPath?.match(/^work\.\d+/)?.[0];
  return targets.some((t) => t.path === anchored) ? anchored : targets[0]?.path;
}

const OPEN: GapAnswer = { status: "open" };

function entryRef(content: ResumeContent, anchorPath?: string): EntryRef | undefined {
  if (!anchorPath) return undefined;
  const [section] = anchorPath.split(".");
  if (section !== "work" && section !== "volunteer" && section !== "projects") return undefined;
  const entry = readAt(content, anchorPath) as Record<string, unknown> | undefined;
  const name = entry ? entryNaturalKey(section, entry).trim() : "";
  return name ? { section, name } : undefined;
}

export function useGapAnswers(gaps: readonly JobGap[], content: ResumeContent | null) {
  const [answers, setAnswers] = useState<Record<string, GapAnswer>>({});
  const [alsoMaster, setAlsoMaster] = useState(true);

  const reset = useCallback(() => {
    setAnswers({});
    setAlsoMaster(true);
  }, []);

  const set = (id: string, a: GapAnswer) => setAnswers((prev) => ({ ...prev, [id]: a }));

  const decline = useCallback((id: string) => set(id, { status: "declined" }), []);

  const confirmSkill = useCallback((gap: JobGap) => {
    set(gap.id, { status: "confirmed", fact: { kind: "skill", name: gap.skill || gap.requirement } });
  }, []);

  const targets = useMemo(() => gapTargets(content), [content]);

  /** Turn the person's own line into a bullet (never adds facts) and keep it
   *  on the job at `targetPath` (default: the gap's own). */
  const answer = useCallback(
    async (gap: JobGap, text: string, targetPath?: string) => {
      const line = text.trim();
      if (!line) return;
      set(gap.id, { status: "writing" });
      let bullet = line;
      try {
        const res = await resumeService.consolidateBullets({ bullets: [line], fieldType: "highlights", sectionType: "work" });
        if (!res.unchanged && res.rewritten[0]?.trim()) bullet = res.rewritten[0].trim();
      } catch {
        // Their own words are fine as they are.
      }
      const path = targetPath ?? defaultTarget(gap, targets) ?? gap.anchorPath;
      const entry = content ? entryRef(content, path) : undefined;
      const where = targets.find((t) => t.path === path)?.label;
      set(gap.id, { status: "confirmed", fact: { kind: "bullet", text: bullet, ...(entry ? { entry } : {}) }, where });
    },
    [content, targets],
  );

  const reopen = useCallback((id: string) => set(id, OPEN), []);

  const facts = useMemo(
    () =>
      gaps.flatMap((g) => {
        const a = answers[g.id];
        return a?.status === "confirmed" ? [a.fact] : [];
      }),
    [gaps, answers],
  );

  return {
    answerOf: (id: string): GapAnswer => answers[id] ?? OPEN,
    /** The jobs a written answer can go to. */
    targets,
    decline,
    confirmSkill,
    answer,
    reopen,
    facts,
    alsoMaster,
    setAlsoMaster,
    reset,
  };
}

export type GapAnswers = ReturnType<typeof useGapAnswers>;
