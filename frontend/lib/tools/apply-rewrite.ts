// Match-and-replace logic for "apply this LLM rewrite to a saved resume".
// Used by both `useApplyToResume` (interactive hook) and the
// `apply_resume_rewrite` tool runner in registry.ts. The matching helpers
// stay pure; `applyResumeRewrite` owns the full fetch → mutate → persist
// pipeline so both call sites take exactly one round-trip and invalidate
// the same query keys on success.

import type { QueryClient } from "@tanstack/react-query";
import { resumeService } from "@/lib/services/resume-service";
import type { ResumeContent } from "@shared/resume";

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

/** Substring-style fuzzy match — true when either normalised string contains
 *  the other. Good enough to find an LLM rewrite of a real bullet without
 *  pulling in a Levenshtein dep. */
export function looseEquals(a: string, b: string): boolean {
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

export interface FieldHit {
  /** Human-readable label of where the match landed (e.g. "work[0].highlights[2]"). */
  location: string;
  /** Mutator: writes `improved` into the right slot on a working copy. */
  apply: (content: ResumeContent, improved: string) => void;
}

/** Walk the resume content and collect every place `original` could land,
 *  in order of preference (highlights first — they're the bullet form most
 *  rewrites target). */
export function findRewriteTargets(content: ResumeContent, original: string): FieldHit[] {
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

export type ApplyRewriteResult =
  | { ok: true; location: string }
  | { ok: false; reason: "no_resume" | "no_match" | "save_failed"; message?: string };

/** Fetch the resume, match `original` against its bullets/summaries, write
 *  `improved` into the first hit, persist, and invalidate the resume
 *  caches. Single source for the whole apply pipeline — the hook wraps
 *  this with state, the AI-coach tool runner calls it directly. */
export async function applyResumeRewrite(
  resumeId: string | undefined,
  original: string,
  improved: string,
  queryClient?: QueryClient,
): Promise<ApplyRewriteResult> {
  if (!resumeId) return { ok: false, reason: "no_resume" };

  try {
    const resume = await resumeService.getResumeById(resumeId);
    const content = resume?.content as ResumeContent | undefined;
    if (!content) {
      return { ok: false, reason: "save_failed", message: "Resume content unavailable" };
    }

    const hits = findRewriteTargets(content, original);
    if (hits.length === 0) return { ok: false, reason: "no_match" };

    // Apply the first hit only — the LLM returns one bullet at a time,
    // so a single rewrite shouldn't clobber multiple roles.
    const target = hits[0];
    const next = JSON.parse(JSON.stringify(content)) as ResumeContent;
    target.apply(next, improved);

    await resumeService.updateResumeData(resumeId, { data: next });
    if (queryClient) {
      await queryClient.invalidateQueries({ queryKey: ["resumes"] });
      await queryClient.invalidateQueries({ queryKey: ["resume", resumeId] });
    }

    return { ok: true, location: target.location };
  } catch (err: any) {
    return { ok: false, reason: "save_failed", message: err?.message || "Save failed" };
  }
}
