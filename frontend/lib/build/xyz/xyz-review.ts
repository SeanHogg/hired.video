/**
 * "Review my whole résumé in XYZ" (#990) — the steps, as data. Every work,
 * volunteer and project entry, in page order, contributes up to three
 * steps: its bullets (one group rewrite), its summary / description, and its
 * title (work / volunteer only). XYZ = "Accomplished [X] as measured by [Y],
 * by doing [Z]".
 *
 * The person decides each step (Apply the rewrite — as they edited it — or
 * Skip); nothing touches the résumé until they finish, and then
 * `applyXyzDecisions` writes every applied step in ONE change, so the whole
 * pass is ONE Undo step. Pure.
 */
import type { ResumeContent } from "@shared/resume";
import { readAt, writeAt, type ContentPath } from "@shared/resume-path";

export type XyzSection = "work" | "volunteer" | "projects";
export type XyzStepKind = "highlights" | "summary" | "position";

export interface XyzStep {
  /** Stable for the résumé: the content path it rewrites. */
  id: ContentPath;
  section: XyzSection;
  index: number;
  kind: XyzStepKind;
  /** "VP Engineering · Acme" — which entry the step is on. */
  entry: string;
  /** The text the rewrite starts from (bullets for `highlights`). */
  original: string | string[];
  /** Grounding for the rewrite endpoints. */
  context: { role?: string; organization?: string; summary?: string; highlights?: string[] };
}

/** What the person chose for a step. An applied step remembers the text it
 *  rewrote, so a line edited since is never overwritten. */
export type XyzDecision =
  | { status: "applied"; value: string | string[]; original: string | string[] }
  | { status: "skipped" };

const SECTIONS: readonly XyzSection[] = ["work", "volunteer", "projects"];

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Every step of the pass over `content`, in page order. */
export function xyzSteps(content: ResumeContent): XyzStep[] {
  const steps: XyzStep[] = [];
  for (const section of SECTIONS) {
    const entries = ((content as Record<string, unknown>)[section] ?? []) as Array<Record<string, unknown>>;
    entries.forEach((e, index) => {
      const organization = section === "volunteer" ? s(e.organization) : section === "projects" ? s(e.entity) : s(e.name);
      const role = section === "projects" ? s(e.name) : s(e.position);
      const proseField = section === "projects" ? "description" : "summary";
      const prose = s(e[proseField]);
      const raw = Array.isArray(e.highlights) ? (e.highlights as unknown[]) : [];
      const highlights = raw.filter((h): h is string => typeof h === "string" && h.trim() !== "");
      const entry = [role, organization].filter(Boolean).join(" · ");
      const base = `${section}.${index}`;
      if (highlights.length > 0) {
        steps.push({
          id: `${base}.highlights`,
          section,
          index,
          kind: "highlights",
          entry,
          // As stored, so "changed since?" compares like for like.
          original: raw.map((h) => (typeof h === "string" ? h : "")),
          context: { role: role || undefined, organization: organization || undefined, summary: prose || undefined },
        });
      }
      if (prose) {
        steps.push({
          id: `${base}.${proseField}`,
          section,
          index,
          kind: "summary",
          entry,
          original: prose,
          context: { role: role || undefined, organization: organization || undefined, highlights },
        });
      }
      if (section !== "projects" && role) {
        steps.push({
          id: `${base}.position`,
          section,
          index,
          kind: "position",
          entry,
          original: role,
          context: { organization: organization || undefined, highlights },
        });
      }
    });
  }
  return steps;
}

/**
 * `content` with every applied step written in — the whole pass as ONE
 * change. A step whose line changed since the pass read it (the person
 * edited it meanwhile, or the pass resumed on a newer draft) is left alone,
 * so a stale rewrite never overwrites newer words. Never mutates its input;
 * returns the same object when nothing applies.
 */
export function applyXyzDecisions(content: ResumeContent, decisions: Readonly<Record<ContentPath, XyzDecision>>): ResumeContent {
  let next = content;
  for (const [path, decision] of Object.entries(decisions)) {
    if (decision.status !== "applied") continue;
    if (JSON.stringify(readAt(next, path)) !== JSON.stringify(decision.original)) continue;
    const value = Array.isArray(decision.value)
      ? decision.value.map((v) => v.trim()).filter(Boolean)
      : decision.value.trim();
    if (Array.isArray(value) ? value.length === 0 : !value) continue;
    next = writeAt(next, path, value);
  }
  return next;
}

/** How many steps the person applied. */
export function appliedCount(decisions: Readonly<Record<string, XyzDecision>>): number {
  return Object.values(decisions).filter((d) => d.status === "applied").length;
}
