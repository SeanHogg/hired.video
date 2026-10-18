// Skill views — flattened skill list, graph model with lineage, evidence dedupe.

import type {
  Skill,
  SkillEvidence,
} from "../resume.js";

// ─── Flattened skill view ──────────────────────────────────────────────────

/**
 * Flatten a `skills[]` array into one row per atomic skill. Used by the
 * "By Skill" / "By Position" / "Gaps" tabs so the user sees a per-skill
 * roster with evidence counts. Same parent-row rule as
 * `buildSkillGraphModel`:
 *   - Parent has a level (e.g. "Leadership · Advanced") → keep BOTH the
 *     parent row AND each keyword as their own atomic skills (keywords
 *     inherit the parent's level + years). The parent stays so that
 *     post-merge evidence pointing at the parent's name (which the merge
 *     does on purpose) finds a row to group under.
 *   - Parent has no level (pure category like "Languages" or
 *     "Frameworks") → drop the parent, keep only the keywords.
 *   - No keywords → keep the bare row.
 *
 * Why flatten only at the view layer instead of in storage? The JSON
 * Resume spec keeps category groupings in `keywords`, and the merge UI
 * lets users curate which skills are top-level vs keywords. The view
 * layer's job is to make a graph the user can read; the storage layer's
 * job is to round-trip cleanly with standard JSON Resume tooling.
 *
 * Deduped case-insensitively — first occurrence wins. Prior to 2026-05-04
 * this function ALWAYS dropped the parent when it had keywords, which
 * meant a merged skill like `{name: "AWS", keywords: ["Amazon Web
 * Services"]}` showed only the keyword in By Skill — and any evidence
 * still pointing at "AWS" had nowhere to group. Keeping leveled parents
 * fixes that.
 */
export function flattenSkillsForView(skills: Skill[] | undefined): Skill[] {
  if (!Array.isArray(skills) || skills.length === 0) return [];
  const out: Skill[] = [];
  const seen = new Set<string>();
  for (const s of skills) {
    const rowName = (s?.name ?? "").trim();
    const level = s?.level ?? "";
    const hasKeywords = Array.isArray(s?.keywords) && s.keywords.length > 0;
    if (hasKeywords) {
      const isParentSkill = !!level && !!rowName;
      if (isParentSkill) {
        const parentKey = rowName.toLowerCase();
        if (!seen.has(parentKey)) {
          seen.add(parentKey);
          out.push({ ...s, name: rowName, keywords: [] });
        }
      }
      for (const kw of s.keywords ?? []) {
        const trimmed = (kw ?? "").trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: s.id ? `${s.id}::${key}` : undefined,
          name: trimmed,
          level,
          keywords: [],
          ...(s.yearsOfExperience != null
            ? { yearsOfExperience: s.yearsOfExperience }
            : {}),
        });
      }
    } else if (rowName) {
      const key = rowName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...s, name: rowName, keywords: [] });
    }
  }
  return out;
}

// ─── Graph model with lineage ──────────────────────────────────────────────

/** One node in the skill graph. Same shape as `Skill` but we add a
 *  `parent` pointer so the visualizer can draw lineage edges between a
 *  parent skill and its keyword sub-skills. */
export interface SkillGraphNodeSpec extends Skill {
  /** Canonical (case-preserved) name of the parent skill row, when this
   *  node is a keyword listed under another row. Undefined for top-level
   *  skills and for keywords whose parent row has no level (those parents
   *  are pure categories like "Languages" — they aren't themselves
   *  skills, so there's nothing to draw a lineage edge to). */
  parent?: string;
}

export interface SkillLineageEdge {
  parent: string;
  child: string;
}

/**
 * The graph model that powers the SkillNetwork visualizer. Returns a
 * flat node list AND the lineage edges that tie keyword nodes back to
 * their parent skill — the missing link that turns "18 floating orphan
 * skills" (the 2026-05-04 user complaint) into "skills clustered around
 * the parent's evidenced positions."
 *
 * Decision rule for emitting the parent row as its own node:
 *   - Has a level set → it's a concrete skill (e.g. "Leadership · Advanced")
 *     that the candidate demonstrated. Emit as a node, draw lineage edges
 *     to its keywords. Direct evidence pointing at the parent name binds
 *     to this node; keywords inherit transitively via the lineage edges.
 *   - No level → it's a pure category (e.g. "Languages", "Frameworks").
 *     Don't emit as a node; keywords stand alone. Drawing a lineage edge
 *     to a category-only label would just clutter the graph.
 *
 * Pure — does not mutate input. Deduped case-insensitively across all
 * names (first occurrence wins, same rule as flattenSkillsForView).
 */
export function buildSkillGraphModel(skills: Skill[] | undefined): {
  nodes: SkillGraphNodeSpec[];
  lineage: SkillLineageEdge[];
} {
  if (!Array.isArray(skills) || skills.length === 0) {
    return { nodes: [], lineage: [] };
  }

  const nodes: SkillGraphNodeSpec[] = [];
  const lineage: SkillLineageEdge[] = [];
  const seen = new Set<string>();

  const upsert = (spec: SkillGraphNodeSpec) => {
    const key = spec.name.toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    nodes.push(spec);
  };

  for (const s of skills) {
    const rowName = (s?.name ?? "").trim();
    const level = s?.level ?? "";
    const yrs = s?.yearsOfExperience;
    const hasKeywords = Array.isArray(s?.keywords) && s.keywords.length > 0;

    if (hasKeywords) {
      const isParentNode = !!level && !!rowName;
      if (isParentNode) {
        upsert({
          ...(s.id ? { id: s.id } : {}),
          name: rowName,
          level,
          keywords: [],
          ...(yrs != null ? { yearsOfExperience: yrs } : {}),
        });
      }
      for (const kw of s.keywords ?? []) {
        const trimmed = (kw ?? "").trim();
        if (!trimmed) continue;
        upsert({
          ...(s.id ? { id: `${s.id}::${trimmed.toLowerCase()}` } : {}),
          name: trimmed,
          level,
          keywords: [],
          ...(yrs != null ? { yearsOfExperience: yrs } : {}),
          ...(isParentNode ? { parent: rowName } : {}),
        });
        if (isParentNode) {
          lineage.push({ parent: rowName, child: trimmed });
        }
      }
    } else if (rowName) {
      upsert({
        ...(s.id ? { id: s.id } : {}),
        name: rowName,
        level,
        keywords: [],
        ...(yrs != null ? { yearsOfExperience: yrs } : {}),
      });
    }
  }

  return { nodes, lineage };
}

// ─── Evidence dedupe ───────────────────────────────────────────────────────

/**
 * Strip duplicate `(skillName, referenceId)` rows from a skill-evidence
 * list, keeping the first occurrence of each pair. Sounds redundant
 * given that `mergeExtractedSkillsIntoResume` and `mergeSkills` already
 * dedupe on insertion, but a resume's evidence array can grow stale
 * across multiple paths:
 *   - Older parses ran without the dedupe rule
 *   - The heuristic binder runs across parent + keyword names — and a
 *     post-merge skill row can have its own name appear in keywords as
 *     a synonym, producing two evidence rows for the same item
 *   - Hand-edits via the manual binding UI bypass the merge path
 *
 * Called by the Rebuild Evidence button so a user-triggered cleanup
 * actually fixes the duplicates the user is seeing in the editor — the
 * 2026-05-04 user complaint that "Used at" listed the same position
 * 5+ times after merging skills.
 *
 * Pure — does not mutate input. Preserves ordering of the first
 * occurrence so React keys stay stable.
 */
export function dedupeSkillEvidence(
  evidence: SkillEvidence[] | undefined,
): SkillEvidence[] {
  if (!Array.isArray(evidence) || evidence.length === 0) return [];
  const seen = new Set<string>();
  const out: SkillEvidence[] = [];
  for (const ev of evidence) {
    if (!ev || typeof ev.skillName !== "string" || typeof ev.referenceId !== "string") {
      continue;
    }
    const key = `${ev.skillName.toLowerCase().trim()}::${ev.referenceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }
  return out;
}

