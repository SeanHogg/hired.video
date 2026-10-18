/**
 * Tailor — applying the model's edits to a résumé (with a content-path
 * anchor per change, so Revert is exact), normalising its gaps, and the
 * skills honesty guard. Pure — no I/O. Split out of tailor-edits.ts.
 */
import { coerceEnum } from "../../services/adapters/lenient-coerce.js";
import type { ResumeContent } from "../../../../shared/resume.js";
import { joinPath } from "../../../../shared/resume-path.js";
import {
  entryNaturalKey,
  type JobGap,
  type TailorChange,
} from "../../../../shared/resume-tailor.js";
import type { TailorEdit, TailorGapWire } from "./tailor-edit-contract.js";

// ---------------------------------------------------------------------------
// applyResumeEdits — turn the model's compact edit list into the full
// tailored document + the human-readable changes[] trail. Gap #2109.
// ---------------------------------------------------------------------------

/** Top-level sections whose entries carry editable highlights/summary. */
const EDIT_SECTION_ALLOWED = ["work", "volunteer", "projects"] as const;
export type EditSection = (typeof EDIT_SECTION_ALLOWED)[number];

const EDIT_SECTION_ALIASES: Record<string, EditSection> = {
  experience: "work", employment: "work", positions: "work", roles: "work", job: "work", jobs: "work",
  project: "projects",
  volunteering: "volunteer", volunteer_work: "volunteer",
};

/** Normalise the free-form `op` a model returns onto the canonical op set.
 *  Returns null for anything unrecognised so `applyResumeEdits` can skip it. */
function normalizeEditOp(op: string): "basics" | "highlights" | "summary" | "skills" | null {
  const o = op.trim().toLowerCase();
  if (["basics", "header", "profile", "contact", "headline"].includes(o)) return "basics";
  if (["highlights", "highlight", "bullet", "bullets", "bulletpoints"].includes(o)) return "highlights";
  if (["summary", "description", "blurb"].includes(o)) return "summary";
  if (["skills", "skill", "skillset"].includes(o)) return "skills";
  return null;
}

/**
 * Apply the model's structured edits to a deep clone of the source resume,
 * producing the tailored document AND the `changes[]` trail (`before` is the
 * AUTHORITATIVE original value read from the source, not a model claim).
 *
 * The op-set is deliberately additive — there is NO "remove entry"
 * operation, so no work/education entry can ever be dropped (the guarantee
 * the JSON pipeline exists to enforce now holds by construction). Unmatched
 * / unknown / no-op edits are skipped, never fatal.
 *
 * Pure — no I/O, no mutation of `source`. Exported for unit tests.
 */
export function applyResumeEdits(
  source: ResumeContent,
  edits: TailorEdit[],
): { content: ResumeContent; changes: TailorChange[] } {
  // Deep clone via JSON round-trip — ResumeContent is pure JSON, and this
  // guarantees we never alias the caller's source object.
  const content = JSON.parse(JSON.stringify(source)) as ResumeContent;
  const changes: TailorChange[] = [];
  const norm = (s: string) => s.trim().toLowerCase();

  for (const edit of edits) {
    const op = normalizeEditOp(edit.op);
    if (!op) continue;
    const why = (edit.why ?? "").trim();

    if (op === "basics") {
      const b = (content.basics ?? {}) as Record<string, unknown>;
      if (typeof edit.label === "string" && edit.label !== (b.label ?? "")) {
        changes.push({ section: "basics", path: "basics.label", before: String(b.label ?? ""), after: edit.label, why });
        b.label = edit.label;
      }
      if (typeof edit.summary === "string" && edit.summary !== (b.summary ?? "")) {
        changes.push({ section: "basics", path: "basics.summary", before: String(b.summary ?? ""), after: edit.summary, why });
        b.summary = edit.summary;
      }
      content.basics = b as ResumeContent["basics"];
      continue;
    }

    if (op === "skills") {
      if (Array.isArray(edit.skills)) {
        const before = (content.skills ?? []).map((s) => s.name).filter(Boolean).join(", ");
        const after = edit.skills.map((s) => s.name).filter(Boolean).join(", ");
        content.skills = edit.skills.map((s) => ({
          name: s.name,
          level: s.level ?? "",
          keywords: s.keywords ?? [],
        })) as ResumeContent["skills"];
        changes.push({ section: "skills", path: "skills", before, after, why });
      }
      continue;
    }

    // highlights | summary — locate one entry by its natural key.
    const section = coerceEnum(edit.section ?? "", {
      allowed: EDIT_SECTION_ALLOWED,
      aliases: EDIT_SECTION_ALIASES,
      fallback: "work",
    });
    const arr = content[section] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const matchKey = norm(edit.match ?? "");
    if (!matchKey) continue;
    const index = arr.findIndex((e) => norm(entryNaturalKey(section, e)) === matchKey);
    if (index < 0) continue; // unmatched → skip (never creates/removes entries)
    const target = arr[index];

    if (op === "highlights" && Array.isArray(edit.highlights)) {
      const before = (Array.isArray(target.highlights) ? (target.highlights as string[]) : []).join("\n");
      const after = edit.highlights.join("\n");
      if (before !== after) {
        target.highlights = edit.highlights;
        changes.push({ section, path: joinPath(section, index, "highlights"), before, after, why });
      }
    } else if (op === "summary" && typeof edit.summary === "string") {
      if (String(target.summary ?? "") !== edit.summary) {
        changes.push({ section, path: joinPath(section, index, "summary"), before: String(target.summary ?? ""), after: edit.summary, why });
        target.summary = edit.summary;
      }
    }
  }

  return { content, changes };
}

/**
 * Normalise the model's `gaps` into the wire `JobGap` shape: ids `G1…`,
 * `kind` coerced (a gap that names a skill and no entry is a skill
 * question), `anchorPath` resolved from the entry's natural key. Gaps the
 * résumé already covers by name (a listed skill) are dropped — the model is
 * not trusted to know that.
 */
export function toJobGaps(wire: readonly TailorGapWire[], content: ResumeContent): JobGap[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const listed = new Set(
    (content.skills ?? []).flatMap((s) => [s.name ?? "", ...(s.keywords ?? [])]).map(norm).filter(Boolean),
  );
  const gaps: JobGap[] = [];
  for (const g of wire) {
    const requirement = g.requirement.trim();
    if (!requirement) continue;
    const skill = g.skill?.trim();
    if (skill && listed.has(norm(skill))) continue;
    const kind = coerceEnum(g.kind ?? "", {
      allowed: ["skill", "experience"] as const,
      aliases: { tool: "skill", technology: "skill", keyword: "skill", domain: "experience", achievement: "experience" },
      fallback: skill && !g.match ? "skill" : "experience",
    });
    let anchorPath: string | undefined;
    if (g.match) {
      const section = coerceEnum(g.section ?? "", { allowed: EDIT_SECTION_ALLOWED, aliases: EDIT_SECTION_ALIASES, fallback: "work" });
      const index = ((content[section] ?? []) as Array<Record<string, unknown>>).findIndex(
        (e) => norm(entryNaturalKey(section, e)) === norm(g.match ?? ""),
      );
      if (index >= 0) anchorPath = joinPath(section, index);
    }
    gaps.push({
      id: `G${gaps.length + 1}`,
      requirement,
      kind,
      question: g.question?.trim() || requirement,
      ...(kind === "skill" ? { skill: skill || requirement } : {}),
      ...(anchorPath ? { anchorPath } : {}),
    });
    if (gaps.length >= 5) break;
  }
  return gaps;
}

/**
 * Honesty guard on a skills edit: a skill the model put in the draft that
 * the source résumé never mentions (every word of it, anywhere) is removed.
 * Rephrasing ("CI/CD" for "continuous integration") is the model's job;
 * claiming a tool the person never wrote down is not.
 *
 * A skill WITH keywords is a group ("Cybersecurity & Risk": [...]) — its
 * name is a heading the model may phrase in the job's words, so the
 * keywords are what get checked, one by one, and the group stays while at
 * least one survives. A skill without keywords is a claim itself: its name
 * is checked.
 */
export function dropUnsupportedSkills(source: ResumeContent, tailored: ResumeContent): ResumeContent {
  if (tailored.skills === source.skills) return tailored;
  const corpus = JSON.stringify(source).toLowerCase();
  const supported = (name: string) =>
    name
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w.length > 2)
      .every((w) => corpus.includes(w));
  let changed = false;
  const skills = (tailored.skills ?? []).flatMap((s) => {
    const keywords = s.keywords ?? [];
    if (keywords.length === 0) {
      if (supported(s.name ?? "")) return [s];
      changed = true;
      return [];
    }
    const kept = keywords.filter(supported);
    if (kept.length === keywords.length) return [s];
    changed = true;
    return kept.length ? [{ ...s, keywords: kept }] : [];
  });
  return changed ? { ...tailored, skills } : tailored;
}
