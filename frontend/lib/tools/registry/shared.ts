// Small helpers shared by the registry runners and catalog data files.

import type { NormalizedToolRunResult } from "../types";

type Recommendation = NonNullable<NormalizedToolRunResult["recommendations"]>[number];

/** JSON-schema fragment for tools that take no arguments (the chat panel
 *  binds the active resumeId into ToolRunContext — the LLM never passes it). */
export const NO_ARGS = { type: "object", properties: {}, additionalProperties: false } as const;

export function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** View an untyped API payload as a record (empty when it isn't one). */
export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

export function asStringArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : undefined;
}

const CATEGORIES: ReadonlyArray<NonNullable<Recommendation["category"]>> = ["critical", "important", "minor"];

function asCategory(v: unknown): Recommendation["category"] {
  return CATEGORIES.find((c) => c === v);
}

/** Project a server recommendations array (strings or `{title, description,
 *  severity, impact}` objects) into the shared card shape. */
export function toRecommendations(v: unknown): Recommendation[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map((item): Recommendation => {
    if (typeof item === "string") return { title: item };
    const r = asRecord(item);
    const impact = r.impact;
    return {
      category: asCategory(r.severity),
      title: String(r.title ?? ""),
      description: typeof r.description === "string" ? r.description : undefined,
      impact: typeof impact === "number" || typeof impact === "string" ? impact : undefined,
    };
  });
}
