/**
 * splitPersonName — the one place a single display-name string (`users.name`,
 * a contact's name) is split into first / last.
 *
 *   splitPersonName("Mary Anne Evans")                       → { firstName: "Mary", lastName: "Anne Evans" }
 *   splitPersonName("Mary Anne Evans", { lastName: "final" }) → { firstName: "Mary", lastName: "Evans" }
 *   splitPersonName("  ", { emptyFirstName: "Unknown" })      → { firstName: "Unknown", lastName: "" }
 *
 * Input is trimmed; the first name is the first whitespace-delimited token.
 * `lastName: "rest"` (default) keeps everything after it verbatim — the
 * profile/DTO shape. `"final"` keeps only the last token (drops middle
 * names) — what person-lookup APIs such as Hunter expect.
 */
export interface SplitPersonNameOptions {
  /** firstName returned when the input is empty/blank. Defaults to "". */
  emptyFirstName?: string;
  /** "rest" (default): everything after the first token. "final": only the last token. */
  lastName?: "rest" | "final";
}

export interface PersonNameParts {
  firstName: string;
  lastName: string;
}

export function splitPersonName(
  name: string | null | undefined,
  options: SplitPersonNameOptions = {},
): PersonNameParts {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return { firstName: options.emptyFirstName ?? "", lastName: "" };
  const idx = trimmed.search(/\s/);
  if (idx === -1) return { firstName: trimmed, lastName: "" };
  const firstName = trimmed.slice(0, idx);
  if (options.lastName === "final") {
    const parts = trimmed.split(/\s+/);
    return { firstName, lastName: parts[parts.length - 1] ?? "" };
  }
  return { firstName, lastName: trimmed.slice(idx + 1) };
}
