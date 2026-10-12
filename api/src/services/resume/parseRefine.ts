/**
 * Résumé parse refinement — the deterministic post-processing the parse
 * pipeline runs on model output, plus the missing-date rescan prompt.
 *
 *   - mergeRegexFallback: fill sections/fields the model left empty from the
 *     regex pre-parse.
 *   - consolidateFragmentedEntries: fold bullets the model split into their
 *     own entries back into the role above.
 *   - findEntriesMissingDates / rescanMissingDates / applyDateRescan: ask the
 *     model for dates it skipped, never overwriting a value already present.
 *   - ensureSectionItemIds: stable UUIDs so skill evidence binds to items.
 *
 * Pure apart from the injected model call in rescanMissingDates.
 */
import { extractJson } from "./parse.js";
import { hasRealSectionContent } from "./content.js";
import type { AiTextCaller } from "../adapters/ai-text-caller.js";

const SECTION_KEYS = [
  "basics", "work", "education", "skills", "volunteer", "awards", "certificates",
  "publications", "languages", "interests", "references", "projects",
] as const;

/**
 * Merge the regex pre-parse under the model result: for each section keep the
 * model's value when it has real content, otherwise take the regex value.
 * `basics` merges field by field. Placeholder objects like
 * `{ area: "", institution: "" }` count as empty (shared `hasRealSectionContent`).
 */
export function mergeRegexFallback(
  model: Record<string, unknown>,
  regex: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...model };
  for (const key of SECTION_KEYS) {
    const aiVal = merged[key];
    const regexVal = regex[key];
    if (key === "basics") {
      const regBas = (regexVal ?? {}) as Record<string, unknown>;
      const mergedBasics: Record<string, unknown> = { ...regBas, ...((aiVal ?? {}) as Record<string, unknown>) };
      // Only take the regex value where the model's field is empty/missing.
      for (const [k, v] of Object.entries(regBas)) {
        const current = mergedBasics[k];
        if (!current || (typeof current === "string" && !current.trim())) mergedBasics[k] = v;
      }
      merged.basics = mergedBasics;
    } else if (!hasRealSectionContent(aiVal, key) && Array.isArray(regexVal) && regexVal.length > 0) {
      merged[key] = regexVal;
    }
  }
  return merged;
}

/** Walk every evidence-bindable section and stamp a fresh UUID on any
 *  item that's missing `id`. Idempotent — items that already have an id
 *  are left untouched so existing evidence stays bound. */
export function ensureSectionItemIds(merged: Record<string, unknown>): void {
  const sections: Array<keyof typeof EVIDENCE_BINDABLE_SECTIONS> = [
    "work",
    "volunteer",
    "projects",
    "education",
    "certificates",
    "awards",
    "publications",
  ];
  for (const section of sections) {
    const list = merged[section];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        if (typeof obj.id !== "string" || !obj.id) {
          obj.id = mintSectionItemId();
        }
      }
    }
  }
}

const EVIDENCE_BINDABLE_SECTIONS = {
  work: true,
  volunteer: true,
  projects: true,
  education: true,
  certificates: true,
  awards: true,
  publications: true,
} as const;

function mintSectionItemId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return (
    cryptoRef?.randomUUID?.() ??
    `it_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  );
}

// ---------------------------------------------------------------------------
// Post-parse consolidation + missing-field rescan
// ---------------------------------------------------------------------------

/**
 * Consolidate entries fragmented into separate records when they should
 * have been one entry with highlights. When two consecutive entries share
 * the same identity key (e.g. same organization) but the later one has
 * only a summary/highlights and no distinguishing fields (position/dates),
 * merge the later one's summary+highlights into the earlier entry.
 */
export function consolidateFragmentedEntries(
  entries: unknown,
  identityKeys: string[],
  distinguishingKeys: string[],
): unknown[] {
  if (!Array.isArray(entries) || entries.length < 2) return Array.isArray(entries) ? entries : [];
  const result: any[] = [];
  const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
  const getIdentity = (item: any) => identityKeys.map((k) => norm(item[k] ?? item[k.charAt(0).toUpperCase() + k.slice(1)])).filter(Boolean).join("|");
  const hasAnyDistinguishing = (item: any) =>
    distinguishingKeys.some((k) => {
      const v = item[k] ?? item[k.charAt(0).toUpperCase() + k.slice(1)];
      return typeof v === "string" && v.trim().length > 0;
    });

  for (const item of entries as any[]) {
    if (!item || typeof item !== "object") { result.push(item); continue; }
    const identity = getIdentity(item);
    const last = result[result.length - 1];
    const lastIdentity = last ? getIdentity(last) : "";

    // If this item shares identity with the previous one AND has no
    // distinguishing fields (no position, no dates), treat it as a bullet
    // that leaked through — fold its summary/highlights into the previous.
    if (last && identity && identity === lastIdentity && !hasAnyDistinguishing(item)) {
      const existingHighlights: string[] = Array.isArray(last.highlights) ? [...last.highlights] : [];
      const newHighlights: string[] = Array.isArray(item.highlights) ? item.highlights : [];
      for (const h of newHighlights) {
        if (h && !existingHighlights.includes(h)) existingHighlights.push(h);
      }
      if (typeof item.summary === "string" && item.summary.trim()) {
        if (!existingHighlights.includes(item.summary.trim())) existingHighlights.push(item.summary.trim());
      }
      last.highlights = existingHighlights;
      continue;
    }

    result.push({ ...item });
  }
  return result;
}

/** Section-local missing-date detector. Returns a list of refs the AI needs to fill. */
export function findEntriesMissingDates(
  parsed: Record<string, unknown>,
): Array<{ section: "work" | "education" | "volunteer" | "projects"; index: number; identityLabel: string }> {
  const needs: Array<{ section: any; index: number; identityLabel: string }> = [];
  const sections: Array<["work" | "education" | "volunteer" | "projects", (item: any) => string]> = [
    ["work", (i) => `${i.position ?? ""} at ${i.name ?? ""}`.trim()],
    ["education", (i) => `${i.studyType ?? ""} ${i.area ?? ""} at ${i.institution ?? ""}`.trim()],
    ["volunteer", (i) => `${i.position ?? ""} at ${i.organization ?? ""}`.trim()],
    ["projects", (i) => `${i.name ?? ""}`.trim()],
  ];
  for (const [section, labelOf] of sections) {
    const arr = parsed[section];
    if (!Array.isArray(arr)) continue;
    arr.forEach((item: any, index: number) => {
      if (!item || typeof item !== "object") return;
      const start = item.startDate ?? item.StartDate;
      const end = item.endDate ?? item.EndDate;
      const hasStart = typeof start === "string" && start.trim().length > 0;
      const hasEnd = typeof end === "string" && end.trim().length > 0;
      if (!hasStart || !hasEnd) {
        const label = labelOf(item);
        if (label) needs.push({ section, index, identityLabel: label });
      }
    });
  }
  return needs;
}

/** Ask the AI to find dates for a specific list of entries in the resume text. */
export async function rescanMissingDates(
  callAI: AiTextCaller,
  resumeText: string,
  entries: Array<{ section: string; index: number; identityLabel: string }>,
): Promise<Array<{ section: string; index: number; startDate: string; endDate: string }>> {
  const systemPrompt = [
    "You are a focused date extractor for resumes.",
    "You are given a resume and a list of entries that are missing startDate and/or endDate.",
    "For EACH entry, search the resume text carefully and return the dates you find.",
    "",
    "RULES:",
    "  - Return 'YYYY-MM' when month is known, or 'YYYY' when only year is known.",
    "  - Use 'Present' as endDate for current/ongoing roles (e.g. 'since 2022', '2022 - Current').",
    "  - If no date can be found for an entry, return empty strings for that entry.",
    "  - DO NOT invent dates. Only return dates that appear in the text.",
    "",
    "Return ONLY a JSON object with this exact shape (no markdown fences):",
    '{ "dates": [{ "section": "", "index": 0, "startDate": "", "endDate": "" }] }',
  ].join("\n");

  const userMessage = [
    "--- RESUME TEXT ---",
    resumeText,
    "--- END RESUME ---",
    "",
    "Find dates for these entries:",
    ...entries.map((e) => `  - section="${e.section}" index=${e.index}: ${e.identityLabel}`),
  ].join("\n");

  const raw = await callAI(systemPrompt, userMessage);
  const parsed = extractJson(raw);
  const out: Array<{ section: string; index: number; startDate: string; endDate: string }> = [];
  if (Array.isArray((parsed as any).dates)) {
    for (const d of (parsed as any).dates as any[]) {
      if (!d || typeof d !== "object") continue;
      out.push({
        section: String(d.section ?? ""),
        index: Number.isFinite(d.index) ? Number(d.index) : -1,
        startDate: String(d.startDate ?? "").trim(),
        endDate: String(d.endDate ?? "").trim(),
      });
    }
  }
  return out;
}

/** Apply rescanned dates to the merged result, never overwriting existing values. */
export function applyDateRescan(
  merged: Record<string, unknown>,
  filled: Array<{ section: string; index: number; startDate: string; endDate: string }>,
): void {
  for (const f of filled) {
    const arr = merged[f.section];
    if (!Array.isArray(arr)) continue;
    const item = arr[f.index] as Record<string, unknown> | undefined;
    if (!item || typeof item !== "object") continue;
    // Never overwrite — only fill empties (same safety rule as job refresh backfill)
    if (f.startDate && !(item.startDate as string)?.trim() && !(item.StartDate as string)?.trim()) {
      (item as any).startDate = f.startDate;
    }
    if (f.endDate && !(item.endDate as string)?.trim() && !(item.EndDate as string)?.trim()) {
      (item as any).endDate = f.endDate;
    }
  }
}
