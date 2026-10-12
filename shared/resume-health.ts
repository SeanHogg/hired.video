/**
 * Content health of a résumé: the mechanical problems an AI edit or a merge
 * can leave behind, found without a model. A bullet repeated under another
 * job, two near-identical bullets, an entry listed twice, dates written in
 * mixed formats, a role with nothing under it.
 *
 * Each issue is anchored by content path (shared/resume-path.ts), so callers
 * can pin it on the page, report it in diagnostics or guard a revision.
 * Pure: no I/O, safe on any JSON-shaped content.
 */

export type ResumeHealthKind = "duplicateBullet" | "nearDuplicateBullet" | "duplicateEntry" | "mixedDateFormats" | "emptyEntry";

export interface ResumeHealthIssue {
  kind: ResumeHealthKind;
  /** Content paths involved (`work.2.highlights.0`). */
  paths: string[];
  /** Short evidence for a reader (the bullet text, the formats seen). */
  detail: string;
}

/** Sections whose entries carry `highlights` bullets. */
const BULLET_SECTIONS = ["work", "volunteer", "projects"] as const;
/** Sections whose entries carry dates. */
const DATED_SECTIONS = ["work", "volunteer", "education", "awards", "certificates", "publications", "projects"] as const;
const DATE_FIELDS = ["startDate", "endDate", "date", "releaseDate"] as const;

/** Word-set overlap at or above this is "the same bullet, reworded". */
const NEAR_DUPLICATE_JACCARD = 0.8;
/** Bullets shorter than this (in words) are too generic to compare. */
const MIN_COMPARABLE_WORDS = 6;

type Entry = Record<string, unknown>;

function entriesOf(content: unknown, section: string): Entry[] {
  const list = (content as Record<string, unknown> | null)?.[section];
  return Array.isArray(list) ? list.filter((e): e is Entry => !!e && typeof e === "object") : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}%$.]+/gu, " ").trim();

function words(s: string): Set<string> {
  // `.` survives normalize for "$1.79M"; a sentence's last word drops it.
  return new Set(normalize(s).split(" ").map((w) => w.replace(/\.+$/, "")).filter((w) => w.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared || 1);
}

interface Bullet {
  path: string;
  text: string;
  norm: string;
  words: Set<string>;
}

function bulletsOf(content: unknown): Bullet[] {
  const out: Bullet[] = [];
  for (const section of BULLET_SECTIONS) {
    entriesOf(content, section).forEach((entry, i) => {
      const highlights = Array.isArray(entry.highlights) ? entry.highlights : [];
      highlights.forEach((h, j) => {
        const t = text(h);
        if (t) out.push({ path: `${section}.${i}.highlights.${j}`, text: t, norm: normalize(t), words: words(t) });
      });
    });
  }
  return out;
}

const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function bulletIssues(content: unknown): ResumeHealthIssue[] {
  const bullets = bulletsOf(content);
  const issues: ResumeHealthIssue[] = [];
  const exact = new Map<string, Bullet[]>();
  for (const b of bullets) exact.set(b.norm, [...(exact.get(b.norm) ?? []), b]);
  for (const group of exact.values()) {
    if (group.length > 1) issues.push({ kind: "duplicateBullet", paths: group.map((b) => b.path), detail: clip(group[0].text) });
  }
  for (let i = 0; i < bullets.length; i++) {
    const a = bullets[i];
    if (a.words.size < MIN_COMPARABLE_WORDS) continue;
    for (let j = i + 1; j < bullets.length; j++) {
      const b = bullets[j];
      if (a.norm === b.norm || b.words.size < MIN_COMPARABLE_WORDS) continue;
      if (jaccard(a.words, b.words) >= NEAR_DUPLICATE_JACCARD) {
        issues.push({ kind: "nearDuplicateBullet", paths: [a.path, b.path], detail: clip(a.text) });
      }
    }
  }
  return issues;
}

function entryKey(section: string, e: Entry): string {
  const who = text(e.name ?? e.organization ?? e.institution ?? e.awarder ?? e.issuer);
  const what = text(e.position ?? e.title ?? e.studyType ?? e.area);
  const when = text(e.startDate ?? e.date);
  return who || what ? normalize(`${section}|${who}|${what}|${when}`) : "";
}

function entryIssues(content: unknown): ResumeHealthIssue[] {
  const issues: ResumeHealthIssue[] = [];
  for (const section of DATED_SECTIONS) {
    const seen = new Map<string, number>();
    entriesOf(content, section).forEach((e, i) => {
      const key = entryKey(section, e);
      if (!key) return;
      const first = seen.get(key);
      if (first === undefined) seen.set(key, i);
      else issues.push({ kind: "duplicateEntry", paths: [`${section}.${first}`, `${section}.${i}`], detail: key.split("|").slice(1).join(" · ") });
    });
  }
  entriesOf(content, "work").forEach((e, i) => {
    const highlights = Array.isArray(e.highlights) ? e.highlights.filter((h) => text(h)) : [];
    if (!text(e.summary) && highlights.length === 0) {
      issues.push({ kind: "emptyEntry", paths: [`work.${i}`], detail: [text(e.position), text(e.name)].filter(Boolean).join(" @ ") });
    }
  });
  return issues;
}

/** "2024-04-01" → "YYYY-MM-DD", "01/1999" → "MM/YYYY", "Present" → null. */
export function dateFormatOf(value: string): string | null {
  const v = value.trim();
  if (!v || /^(present|current|now)$/i.test(v)) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return "YYYY-MM-DD";
  if (/^\d{4}-\d{2}$/.test(v)) return "YYYY-MM";
  if (/^\d{4}$/.test(v)) return "YYYY";
  if (/^\d{1,2}\/\d{4}$/.test(v)) return "MM/YYYY";
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v)) return "MM/DD/YYYY";
  return "text";
}

function dateIssues(content: unknown): ResumeHealthIssue[] {
  const byFormat = new Map<string, string[]>();
  for (const section of DATED_SECTIONS) {
    entriesOf(content, section).forEach((e, i) => {
      for (const field of DATE_FIELDS) {
        const format = dateFormatOf(text(e[field]));
        if (format) byFormat.set(format, [...(byFormat.get(format) ?? []), `${section}.${i}.${field}`]);
      }
    });
  }
  if (byFormat.size <= 1) return [];
  // The common format is the norm; every other format's paths are the issue.
  const [norm] = [...byFormat.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const odd = [...byFormat.entries()].filter(([f]) => f !== norm);
  return [
    {
      kind: "mixedDateFormats",
      paths: odd.flatMap(([, paths]) => paths),
      detail: `${norm} (most) vs ${odd.map(([f, p]) => `${f} ×${p.length}`).join(", ")}`,
    },
  ];
}

export function resumeHealth(content: unknown): ResumeHealthIssue[] {
  return [...bulletIssues(content), ...entryIssues(content), ...dateIssues(content)];
}
