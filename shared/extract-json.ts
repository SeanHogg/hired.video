/**
 * Pull the JSON object out of an LLM answer — models wrap it in ```json
 * fences or chatter around it. Shared so the Worker use cases (résumé parse,
 * social captions) and any other caller parse model output the same way.
 */

/** Strip markdown fences and extract the first JSON object from an LLM response. */
export function extractJson(raw: string): Record<string, unknown> {
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  throw new Error("No valid JSON found in LLM response");
}

/**
 * Non-throwing `extractJson` for best-effort callers that keep their own
 * defaults on a bad answer: returns null when no JSON object can be pulled
 * out (or the payload is not a plain object). `T` is the caller's expected
 * shape — the value is NOT validated, so treat every field as optional.
 */
export function tryExtractJson<T extends object = Record<string, unknown>>(raw: string): T | null {
  try {
    const parsed: unknown = extractJson(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}
