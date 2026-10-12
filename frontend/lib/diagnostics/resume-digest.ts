/**
 * A résumé as a diagnostics report needs it: its shape, not its prose. One
 * line per entry (who / what / when / how many bullets), section counts,
 * which workspace metadata it carries (cover letter, video plan), counts for
 * the bulky bookkeeping (skillEvidence, metaData), and the content health
 * check (shared/resume-health.ts). The full text stays in the database
 * under the résumé id; dumping it made the report too long to paste.
 */
import { resumeHealth, type ResumeHealthIssue } from "@shared/resume-health";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** "Chief Innovation Officer @ BuilderForce.ai · 2026-01 → Present · 0 bullets" */
function entryLine(e: unknown): string {
  if (!isObj(e)) return "?";
  const what = str(e.position) || str(e.title) || [str(e.studyType), str(e.area)].filter(Boolean).join(" ") || str(e.name);
  const org = str(e.organization) || str(e.institution) || str(e.awarder) || str(e.issuer);
  const who = org || (what !== str(e.name) ? str(e.name) : "");
  const when = [str(e.startDate ?? e.date), str(e.endDate)].filter(Boolean).join(" → ");
  const bullets = Array.isArray(e.highlights) ? `${e.highlights.length} bullets` : "";
  return [[what, who].filter(Boolean).join(" @ "), when, bullets].filter(Boolean).join(" · ");
}

const ENTRY_SECTIONS = ["work", "volunteer", "education", "awards", "certificates", "publications", "projects"] as const;
const COUNT_SECTIONS = ["skills", "languages", "interests", "references"] as const;

export interface ResumeDigest {
  basics: { name: string; label: string; contact: string[]; summaryChars: number };
  sections: Record<string, string[] | number>;
  meta: Record<string, unknown>;
  bookkeeping: { skillEvidence: number; metaData: number };
  health: ResumeHealthIssue[];
}

function metaDigest(meta: unknown): Record<string, unknown> {
  if (!isObj(meta)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key === "coverLetter" && isObj(value)) {
      out.coverLetter = {
        jobTitle: str(value.jobTitle),
        organization: str(value.organization),
        date: str(value.date),
        highlights: list(value.highlights).length,
      };
    } else if (key === "video" && isObj(value)) {
      out.video = { scenes: Object.keys(isObj(value.scenes) ? value.scenes : {}), canvasOverrides: isObj(value.canvas) };
    } else {
      out[key] = isObj(value) || Array.isArray(value) ? "[object]" : value;
    }
  }
  return out;
}

export function digestResume(content: unknown): ResumeDigest | null {
  if (!isObj(content)) return null;
  const basics = isObj(content.basics) ? content.basics : {};
  const sections: ResumeDigest["sections"] = {};
  for (const key of ENTRY_SECTIONS) {
    const entries = list(content[key]);
    if (entries.length) sections[key] = entries.map(entryLine);
  }
  for (const key of COUNT_SECTIONS) {
    const n = list(content[key]).length;
    if (n) sections[key] = n;
  }
  return {
    basics: {
      name: str(basics.name),
      label: str(basics.label),
      contact: ["email", "phone", "url"].filter((k) => str(basics[k])),
      summaryChars: str(basics.summary).length,
    },
    sections,
    meta: metaDigest(content.meta),
    bookkeeping: { skillEvidence: list(content.skillEvidence).length, metaData: list(content.metaData).length },
    health: resumeHealth(content),
  };
}
