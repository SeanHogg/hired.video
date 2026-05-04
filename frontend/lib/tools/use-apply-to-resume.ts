// Shared hook for AI tools that produce a `{ original, improved }` text
// rewrite and want to push the rewrite back into a saved resume's structured
// content (work highlights, summaries, project bullets, etc.).
//
// The hook self-gates on `resumeId`: callers don't pass a `canApply` boolean
// — they just call `applyRewrite` and let the hook decide whether the apply
// is possible. When no resumeId is bound, `applyRewrite` returns
// `{ ok: false, reason: "no_resume" }` and the consumer can render a "Save
// as resume to apply edits" CTA without duplicating the gating logic.

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resumeService } from "@/lib/services/resume-service";
import type { ResumeContent } from "@shared/resume";

export type ApplyRewriteResult =
  | { ok: true; location: string }
  | { ok: false; reason: "no_resume" | "no_match" | "save_failed"; message?: string };

interface ApplyOptions {
  /** Free-text snippet expected to match a bullet/summary in the resume. */
  original: string;
  /** Replacement text. */
  improved: string;
}

interface FieldHit {
  /** Human-readable label of where the match landed (e.g. "work[0].highlights[2]"). */
  location: string;
  /** Mutator: writes `improved` into the right slot on a working copy. */
  apply: (content: ResumeContent, improved: string) => void;
}

/** Collapse whitespace + lowercase for tolerant matching. The LLM tends to
 *  re-wrap, smart-quote, or strip leading bullet glyphs even when told to
 *  quote verbatim. */
function normalize(s: string): string {
  return s
    .replace(/^[\s\-•▪▸►◦‣*]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Substring-style fuzzy match — returns true if either string normalised
 *  contains the other. Good enough to find an LLM rewrite of a real bullet
 *  without pulling in a Levenshtein dep. */
function looseEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // The LLM sometimes truncates bullets to fit a token budget — accept
  // either-direction containment so a 90% prefix still matches.
  if (na.length >= 12 && nb.length >= 12) {
    return na.includes(nb) || nb.includes(na);
  }
  return false;
}

/** Walk the resume content and collect every place `original` could land,
 *  in order of preference (highlights first — they're the bullet form most
 *  rewrites target). */
function findRewriteTargets(content: ResumeContent, original: string): FieldHit[] {
  const hits: FieldHit[] = [];

  content.work?.forEach((w, wi) => {
    w.highlights?.forEach((h, hi) => {
      if (looseEquals(h, original)) {
        hits.push({
          location: `work[${wi}].highlights[${hi}]`,
          apply: (next, improved) => {
            const t = next.work?.[wi];
            if (t?.highlights) t.highlights[hi] = improved;
          },
        });
      }
    });
  });

  content.work?.forEach((w, wi) => {
    if (w.summary && looseEquals(w.summary, original)) {
      hits.push({
        location: `work[${wi}].summary`,
        apply: (next, improved) => {
          if (next.work?.[wi]) next.work[wi].summary = improved;
        },
      });
    }
  });

  content.projects?.forEach((p, pi) => {
    p.highlights?.forEach((h, hi) => {
      if (looseEquals(h, original)) {
        hits.push({
          location: `projects[${pi}].highlights[${hi}]`,
          apply: (next, improved) => {
            const t = next.projects?.[pi];
            if (t?.highlights) t.highlights[hi] = improved;
          },
        });
      }
    });
  });

  content.volunteer?.forEach((v, vi) => {
    v.highlights?.forEach((h, hi) => {
      if (looseEquals(h, original)) {
        hits.push({
          location: `volunteer[${vi}].highlights[${hi}]`,
          apply: (next, improved) => {
            const t = next.volunteer?.[vi];
            if (t?.highlights) t.highlights[hi] = improved;
          },
        });
      }
    });
  });

  if (content.basics?.summary && looseEquals(content.basics.summary, original)) {
    hits.push({
      location: "basics.summary",
      apply: (next, improved) => {
        if (next.basics) next.basics.summary = improved;
      },
    });
  }

  return hits;
}

export interface UseApplyToResume {
  /** True while a save is in flight. */
  isApplying: boolean;
  /** Map of `original` → outcome, so the caller can render per-row badges. */
  outcomes: Record<string, ApplyRewriteResult>;
  /** True iff this hook has a resume bound and apply is possible. */
  canApply: boolean;
  applyRewrite: (opts: ApplyOptions) => Promise<ApplyRewriteResult>;
}

export function useApplyToResume(resumeId: string | undefined): UseApplyToResume {
  const [isApplying, setIsApplying] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, ApplyRewriteResult>>({});
  const queryClient = useQueryClient();

  const applyRewrite = useCallback(
    async ({ original, improved }: ApplyOptions): Promise<ApplyRewriteResult> => {
      if (!resumeId) {
        const result: ApplyRewriteResult = { ok: false, reason: "no_resume" };
        setOutcomes((prev) => ({ ...prev, [original]: result }));
        return result;
      }

      setIsApplying(true);
      try {
        const resume = await resumeService.getResumeById(resumeId);
        const content = resume?.content as ResumeContent | undefined;
        if (!content) {
          const result: ApplyRewriteResult = {
            ok: false,
            reason: "save_failed",
            message: "Resume content unavailable",
          };
          setOutcomes((prev) => ({ ...prev, [original]: result }));
          return result;
        }

        const hits = findRewriteTargets(content, original);
        if (hits.length === 0) {
          const result: ApplyRewriteResult = { ok: false, reason: "no_match" };
          setOutcomes((prev) => ({ ...prev, [original]: result }));
          return result;
        }

        // Apply the first hit only — the LLM returns one bullet at a time,
        // so a single rewrite shouldn't clobber multiple roles.
        const target = hits[0];
        const next = JSON.parse(JSON.stringify(content)) as ResumeContent;
        target.apply(next, improved);

        await resumeService.updateResumeData(resumeId, { data: next });
        await queryClient.invalidateQueries({ queryKey: ["resumes"] });
        await queryClient.invalidateQueries({ queryKey: ["resume", resumeId] });

        const result: ApplyRewriteResult = { ok: true, location: target.location };
        setOutcomes((prev) => ({ ...prev, [original]: result }));
        return result;
      } catch (err: any) {
        const result: ApplyRewriteResult = {
          ok: false,
          reason: "save_failed",
          message: err?.message || "Save failed",
        };
        setOutcomes((prev) => ({ ...prev, [original]: result }));
        return result;
      } finally {
        setIsApplying(false);
      }
    },
    [resumeId, queryClient],
  );

  return {
    isApplying,
    outcomes,
    canApply: !!resumeId,
    applyRewrite,
  };
}
