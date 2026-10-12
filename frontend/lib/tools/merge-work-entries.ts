/**
 * Merge two work entries that are really one role (#375 "consolidate similar
 * roles"): the same company listed twice, a promotion split into two rows.
 * Pure — the `merge_work_entries` wand previews with it and re-runs it on
 * the current draft when the person clicks Apply.
 *
 * The first entry is kept (its title, link, place); the second's bullets
 * that the first does not already say are appended; the dates span both
 * (an open end — "Present" — wins); the summaries are joined when they
 * differ. The second entry is removed.
 */
import type { ResumeContent, Work } from "@shared/resume";
import { normalizeText } from "@shared/resume-path";

export interface WorkMerge {
  next: ResumeContent;
  /** Indices merged (into `keep`, `removed` dropped), in the source. */
  keep: number;
  removed: number;
  /** "Acme Corp" + "Acme" → what the card says. */
  label: string;
}

/** The entry `name` names: its company, or "company|position" / "position @ company". */
function findEntry(work: readonly Work[], name: string, skip = -1): number {
  const key = normalizeText(name);
  const matches = (w: Work) =>
    normalizeText(w.name) === key ||
    normalizeText(`${w.name}|${w.position}`) === key ||
    normalizeText(`${w.position} @ ${w.name}`) === key;
  const exact = work.findIndex((w, i) => i !== skip && matches(w));
  if (exact >= 0) return exact;
  return work.findIndex((w, i) => i !== skip && key.length >= 3 && normalizeText(w.name).includes(key));
}

/** Compare résumé dates ("2021-03", "2021", "Mar 2021") by their sortable prefix. */
const sortable = (d: string) => d.trim();

function earliest(a: string, b: string): string {
  if (!a.trim()) return b;
  if (!b.trim()) return a;
  return sortable(a) <= sortable(b) ? a : b;
}

/** An empty end date is "Present" — it outlasts any real date. */
function latest(a: string, b: string): string {
  if (!a.trim() || !b.trim()) return "";
  return sortable(a) >= sortable(b) ? a : b;
}

export function mergeWorkEntries(content: ResumeContent, first: string, second: string): WorkMerge | null {
  const work = content.work ?? [];
  const keep = findEntry(work, first);
  if (keep < 0) return null;
  const removed = findEntry(work, second, keep);
  if (removed < 0) return null;
  const a = work[keep];
  const b = work[removed];

  const said = new Set((a.highlights ?? []).map(normalizeText));
  const added = (b.highlights ?? []).filter((h) => h.trim() && !said.has(normalizeText(h)));
  const summaries = [a.summary, b.summary].map((s) => (s ?? "").trim()).filter(Boolean);
  const summary =
    summaries.length === 2 && normalizeText(summaries[0]) !== normalizeText(summaries[1]) ? summaries.join(" ") : (summaries[0] ?? "");

  const merged: Work = {
    ...a,
    summary,
    startDate: earliest(a.startDate ?? "", b.startDate ?? ""),
    endDate: latest(a.endDate ?? "", b.endDate ?? ""),
    highlights: [...(a.highlights ?? []), ...added],
  };
  const nextWork = work.flatMap((w, i) => (i === keep ? [merged] : i === removed ? [] : [w]));
  return {
    next: { ...content, work: nextWork },
    keep,
    removed,
    label: `${a.name || a.position} + ${b.name || b.position}`,
  };
}
