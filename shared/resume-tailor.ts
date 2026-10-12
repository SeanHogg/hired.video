/**
 * Fitting a résumé to a job — the wire contract shared by the tailor
 * endpoint, create-from-a-job, and the kit review UI.
 *
 *   TailorChange   one edit the AI made, with WHERE (`path`, see
 *                  resume-path.ts) and WHY. `before` is the authoritative
 *                  original read from the source, so Revert is exact.
 *   JobGap         something the job asks for that the résumé has no
 *                  evidence of. Never written into the résumé by the AI —
 *                  the person answers it on the page.
 *   ConfirmedFact  what the person confirmed in a gap card ("I have
 *                  Kubernetes", a new bullet). Applied to the draft AND,
 *                  when they tick "Also add it to my master", to the
 *                  master, so the next job does not ask again.
 *
 * Pure: schemas + side-effect-free helpers only.
 */
import { z } from "zod";
import type { ResumeContent } from "./resume.js";
import { normalizeText } from "./resume-path.js";

export const TAILOR_SECTIONS = [
  "basics",
  "work",
  "education",
  "skills",
  "projects",
  "volunteer",
  "awards",
  "certificates",
  "publications",
  "languages",
  "interests",
  "references",
] as const;

export const TailorChangeSchema = z.object({
  section: z.enum(TAILOR_SECTIONS),
  /** Content path the change wrote (`basics.label`, `work.2.highlights`,
   *  `skills`). Optional only for rows produced before anchors existed. */
  path: z.string().optional(),
  before: z.string(),
  after: z.string(),
  why: z.string(),
});
export type TailorChange = z.infer<typeof TailorChangeSchema>;

export const JobGapSchema = z.object({
  /** Stable within one response (`G1`, `R5`, …). */
  id: z.string(),
  /** The requirement as the job states it ("Kubernetes or cloud platform"). */
  requirement: z.string(),
  /** `skill`: a yes/no that adds a skill. `experience`: a one-line answer
   *  that becomes a bullet. */
  kind: z.enum(["skill", "experience"]),
  /** The question shown on the page. */
  question: z.string(),
  /** Skill name a "yes" adds (kind = skill). */
  skill: z.string().optional(),
  /** Entry the answer most likely belongs to (`work.0`) — where the card
   *  sits on the page and where the bullet is written (kind = experience). */
  anchorPath: z.string().optional(),
});
export type JobGap = z.infer<typeof JobGapSchema>;

/** Points at an entry by its natural key, not its index, so the same fact
 *  lands on the right entry in the master even when the version's entry
 *  order differs. */
export const EntryRefSchema = z.object({
  section: z.enum(["work", "volunteer", "projects"]),
  name: z.string().min(1).max(200),
});
export type EntryRef = z.infer<typeof EntryRefSchema>;

export const ConfirmedFactSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("skill"), name: z.string().trim().min(1).max(120) }),
  z.object({
    kind: z.literal("bullet"),
    text: z.string().trim().min(1).max(600),
    entry: EntryRefSchema.optional(),
  }),
]);
export type ConfirmedFact = z.infer<typeof ConfirmedFactSchema>;

type EntrySection = EntryRef["section"];

/** The natural key of a work / volunteer / project entry — what a model
 *  echoes to target it and what a fact uses to find it in another copy. */
export function entryNaturalKey(section: EntrySection, entry: Record<string, unknown>): string {
  return String((section === "volunteer" ? entry.organization : entry.name) ?? "");
}

/** Index of the entry `ref` names in `content`, or -1. */
export function findEntryIndex(content: ResumeContent, ref: EntryRef): number {
  const list = (content[ref.section] ?? []) as Array<Record<string, unknown>>;
  const key = normalizeText(ref.name);
  return list.findIndex((e) => normalizeText(entryNaturalKey(ref.section, e)) === key);
}

/**
 * Apply confirmed facts to a copy of `content`. Idempotent: a skill or
 * bullet that is already there (normalised text) is not added twice, so
 * writing the same answer back to the master on every tailor is safe.
 * A bullet whose entry is not found goes to the most recent work entry;
 * with no work entries it is dropped (there is nowhere honest to put it).
 */
export function applyConfirmedFacts(content: ResumeContent, facts: readonly ConfirmedFact[]): ResumeContent {
  let out: ResumeContent = content;
  for (const fact of facts) {
    if (fact.kind === "skill") {
      const skills = out.skills ?? [];
      const key = normalizeText(fact.name);
      const has = skills.some(
        (s) => normalizeText(s.name ?? "") === key || (s.keywords ?? []).some((k) => normalizeText(k) === key),
      );
      if (!has) out = { ...out, skills: [...skills, { name: fact.name, level: "", keywords: [] }] };
      continue;
    }
    const section: EntrySection = fact.entry?.section ?? "work";
    const list = (out[section] ?? []) as Array<Record<string, unknown>>;
    let index = fact.entry ? findEntryIndex(out, fact.entry) : -1;
    if (index < 0 && section === "work") index = list.length > 0 ? 0 : -1;
    if (index < 0) continue;
    const entry = list[index];
    const highlights = Array.isArray(entry.highlights) ? (entry.highlights as string[]) : [];
    if (highlights.some((h) => normalizeText(h) === normalizeText(fact.text))) continue;
    const nextList = list.map((e, i) => (i === index ? { ...e, highlights: [...highlights, fact.text] } : e));
    out = { ...out, [section]: nextList } as ResumeContent;
  }
  return out;
}
