// Heuristic text-mention binder — derives evidence rows from item text.

import type {
  ResumeContent,
  Skill,
  SkillEvidence,
  SkillEvidenceItemType,
  Work,
  Volunteer,
  Project,
  Education,
} from "../resume.js";
import { listResolvableItems } from "./evidence.js";

// ─── Heuristic text-mention binder ─────────────────────────────────────────

/** Build the searchable text blob for one item — what the heuristic
 *  binder grep's against to decide whether a skill was used here. Source
 *  fields per item type:
 *    work / volunteer  : position + summary + highlights
 *    project           : description + highlights
 *    education         : area + courses
 *    certificate/award : name/title only
 *  We deliberately don't include the organization name — "AWS" appearing
 *  as part of "AWS re:Invent 2024" award doesn't mean the candidate USED
 *  AWS; it means they attended a conference. Same reason a skill tag like
 *  "Python" shouldn't bind to a position just because "python" appears in
 *  the company URL. */
function buildItemSearchableText(content: ResumeContent | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!content) return out;
  for (const w of (content.work ?? []) as Work[]) {
    if (!w.id) continue;
    out.set(w.id, [w.position, w.summary, ...(w.highlights ?? [])].filter(Boolean).join(" \n "));
  }
  for (const v of (content.volunteer ?? []) as Volunteer[]) {
    if (!v.id) continue;
    out.set(v.id, [v.position, v.summary, ...(v.highlights ?? [])].filter(Boolean).join(" \n "));
  }
  for (const p of (content.projects ?? []) as Project[]) {
    if (!p.id) continue;
    out.set(
      p.id,
      [p.name, p.description, ...(p.highlights ?? []), ...(p.keywords ?? [])]
        .filter(Boolean)
        .join(" \n "),
    );
  }
  for (const e of (content.education ?? []) as Education[]) {
    if (!e.id) continue;
    out.set(e.id, [e.area, ...(e.courses ?? [])].filter(Boolean).join(" \n "));
  }
  return out;
}

/** Escape a string for use as a literal inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word case-insensitive scan of `text` for `term`. Word boundary
 *  is JavaScript's `\b`, which doesn't fire for tokens like "C#" or
 *  ".NET" — we extend the boundary check manually for those. */
function textMentionsTerm(text: string, term: string): boolean {
  if (!text || !term) return false;
  const trimmed = term.trim();
  if (!trimmed) return false;
  const lower = text.toLowerCase();
  const needle = trimmed.toLowerCase();

  // Multi-character symbol terms (C#, .NET, C++) — fall back to a manual
  // boundary check using surrounding non-letter-non-digit chars.
  if (/[^a-z0-9 ]/i.test(needle)) {
    let from = 0;
    while (true) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) return false;
      const before = idx === 0 ? "" : lower[idx - 1];
      const after = idx + needle.length >= lower.length ? "" : lower[idx + needle.length];
      const ok = !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
      if (ok) return true;
      from = idx + needle.length;
    }
  }

  const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i");
  return re.test(text);
}

/** Heuristic evidence builder. Walks every skill (top-level name AND
 *  category keywords), scans every evidence-bindable item's text fields
 *  for whole-word mentions, and emits evidence rows for matches that
 *  aren't already in `existingEvidence`. Used as a backstop when the LLM
 *  doesn't return `evidenceLabels` — without it, a freshly-extracted
 *  resume would show "N skills without linked evidence" and the
 *  visualizer's network would be all orphans.
 *
 *  Conservative on purpose: whole-word match only, no fuzzy spelling, no
 *  cross-section inference. The LLM's evidenceLabels (when present)
 *  remain the higher-quality signal — heuristic just covers the gap. */
export function deriveEvidenceFromText(
  content: ResumeContent | undefined,
  existingEvidence: SkillEvidence[],
  newId: () => string,
  now: Date = new Date(),
): SkillEvidence[] {
  if (!content) return [];
  const itemTexts = buildItemSearchableText(content);
  const itemTypeById = new Map<string, SkillEvidenceItemType>();
  for (const it of listResolvableItems(content)) itemTypeById.set(it.id, it.itemType);

  const seen = new Set(
    existingEvidence.map(
      (e) => `${e.skillName.toLowerCase().trim()}::${e.referenceId}`,
    ),
  );

  // Build the search list — every skill name AND every keyword. Keywords
  // are typically the actual technologies (e.g. "AWS" under a "Cloud
  // Architecture" parent), so they bind to evidence under their own name.
  const searchTerms: Array<{ skillName: string }> = [];
  for (const s of (content.skills ?? []) as Skill[]) {
    const top = (s.name ?? "").trim();
    if (top) searchTerms.push({ skillName: top });
    for (const kw of s.keywords ?? []) {
      const k = (kw ?? "").trim();
      if (k) searchTerms.push({ skillName: k });
    }
  }
  // Dedupe search terms case-insensitively so we don't scan the same word
  // under both a top-level name and a keyword.
  const uniqueTerms = new Map<string, string>();
  for (const t of searchTerms) {
    const key = t.skillName.toLowerCase();
    if (!uniqueTerms.has(key)) uniqueTerms.set(key, t.skillName);
  }

  const nowIso = now.toISOString();
  const fresh: SkillEvidence[] = [];
  for (const [, skillName] of uniqueTerms) {
    for (const [itemId, itemText] of itemTexts) {
      if (!textMentionsTerm(itemText, skillName)) continue;
      const dedupeKey = `${skillName.toLowerCase().trim()}::${itemId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const itemType = itemTypeById.get(itemId);
      if (!itemType) continue;
      fresh.push({
        id: newId(),
        skillName,
        itemType,
        referenceId: itemId,
        source: "derived",
        createdAt: nowIso,
      });
    }
  }
  return fresh;
}

