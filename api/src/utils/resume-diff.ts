// Levenshtein-based similarity used by the resume variant system. Produces
// an integer 0–100 representing how much a child's content diverges from its
// parent: 0 = identical, 100 = completely different. Persisted on the child
// row (resume_information.diff_percent) and recomputed whenever either side
// changes.
//
// We only hash the fields that a job seeker actually tailors — summary, work
// highlights, and skill names — so reformatting or section reordering doesn't
// inflate the score.

type ResumeContent = Record<string, unknown>;

function ciGet(obj: ResumeContent, key: string): unknown {
  const lower = key.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lower) return obj[k];
  }
  return undefined;
}

function normalize(value: unknown): string {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(normalize).join("\n");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k.toLowerCase()}:${normalize(v)}`)
      .join("|");
  }
  return "";
}

// Build the comparable string from a resume's content. Only fields job seekers
// actively tailor per-variant are included — everything else (education, dates,
// contact info) is rarely rewritten and would otherwise swamp the signal.
export function canonicalize(content: ResumeContent | null | undefined): string {
  if (!content || typeof content !== "object") return "";
  const c = content as ResumeContent;

  const basics = (ciGet(c, "basics") ?? {}) as ResumeContent;
  const summary = normalize(ciGet(basics, "summary"));
  const label = normalize(ciGet(basics, "label"));

  const work = (ciGet(c, "work") ?? []) as unknown[];
  const workText = Array.isArray(work)
    ? work
        .map((w) => {
          const we = (w ?? {}) as ResumeContent;
          const position = normalize(ciGet(we, "position"));
          const name = normalize(ciGet(we, "name"));
          const wSummary = normalize(ciGet(we, "summary"));
          const highlights = normalize(ciGet(we, "highlights"));
          return `${name}::${position}::${wSummary}::${highlights}`;
        })
        .join("\n")
    : "";

  const skills = (ciGet(c, "skills") ?? []) as unknown[];
  const skillsText = Array.isArray(skills)
    ? skills.map((s) => normalize(ciGet((s ?? {}) as ResumeContent, "name"))).join(",")
    : "";

  return [summary, label, workText, skillsText].join("\n---\n");
}

// Iterative two-row Levenshtein; O(n*m) time, O(min(n,m)) memory. Good enough
// for resume-sized strings (typical < 10k chars) and avoids pulling a
// dependency for one function.
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string to minimise row length.
  if (a.length > b.length) [a, b] = [b, a];

  let prev = new Array(a.length + 1);
  let curr = new Array(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,         // insertion
        prev[i] + 1,             // deletion
        prev[i - 1] + cost,      // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length];
}

// Computes an integer percentage [0, 100] of how different `child` is from
// `parent`. Identical → 0, completely different → 100. Returns null when
// neither side has canonicalizable content (would divide by zero).
export function computeDiffPercent(
  parent: ResumeContent | null | undefined,
  child: ResumeContent | null | undefined,
): number | null {
  const a = canonicalize(parent);
  const b = canonicalize(child);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return null;
  const dist = levenshtein(a, b);
  return Math.max(0, Math.min(100, Math.round((dist / maxLen) * 100)));
}
