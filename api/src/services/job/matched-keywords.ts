/**
 * The job keywords a résumé already shows (#2344) — the green "on your
 * résumé" chips beside a tailor review. Candidates are the job's parsed
 * skills plus what the model named; each is kept only when every word of it
 * appears in the résumé as a WHOLE word (a plural counts: "API" ↔ "APIs")
 * and it is not one of the job's open gaps. Whole words, not substrings: a
 * job asking for "Java" is not matched by a résumé that only says
 * "JavaScript". Pure.
 */
import type { ResumeContent } from "../../../../shared/resume.js";
import type { JobGap } from "../../../../shared/resume-tailor.js";

const MAX_MATCHED = 20;

/** Lower-cased word tokens; "+", "#" and inner dots stay ("c++", "c#",
 *  "node.js"), sentence dots don't ("Go." → "go"). */
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w.length > 1);

const onResume = (vocab: ReadonlySet<string>, w: string) => vocab.has(w) || vocab.has(`${w}s`) || vocab.has(`${w}es`);

export function verifiedMatchedKeywords(
  candidates: readonly string[],
  resume: ResumeContent,
  gaps: readonly JobGap[] = [],
): string[] {
  const vocab = new Set(words(JSON.stringify(resume)));
  const open = new Set(gaps.flatMap((g) => [g.skill ?? "", g.requirement]).map((s) => s.trim().toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const keyword = raw.trim();
    const key = keyword.toLowerCase();
    if (!keyword || keyword.length > 80 || seen.has(key) || open.has(key)) continue;
    const parts = words(keyword);
    if (parts.length === 0 || !parts.every((w) => onResume(vocab, w))) continue;
    seen.add(key);
    out.push(keyword);
    if (out.length >= MAX_MATCHED) break;
  }
  return out;
}
