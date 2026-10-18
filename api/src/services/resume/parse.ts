/**
 * resume-parse.ts — Pure functions for parsing resume text and normalising
 * resume content between PascalCase (frontend) and lowercase (JSON Resume)
 * key conventions.
 *
 * Extracted from routes/resumes.ts so they can be unit-tested independently.
 */

// ─── JSON Resume normaliser ────────────────────────────────────────────────

/**
 * Normalise a JSON Resume object to canonical lowercase-key format.
 *
 * The JSON Resume spec (https://jsonresume.org/schema) uses lowercase keys
 * ("basics", "work", "startDate"). Legacy hired.video exports use
 * PascalCase ("Basics", "Work", "StartDate"). Both are valid input — this
 * helper produces a single canonical shape so downstream code doesn't
 * need to branch on casing.
 *
 * - Top-level section keys and nested field keys are lowercased to camelCase
 *   (e.g. "Basics" -> "basics", "StartDate" -> "startDate", "Url" -> "url").
 * - Arrays are mapped recursively; object properties are remapped.
 * - Values are passed through unchanged (including null, empty strings,
 *   dates, etc.) so non-obvious fields survive.
 * - Unknown top-level keys are preserved (lowercased).
 */
export function normalizeJsonResume(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const obj = input as Record<string, unknown>;
  // Fast path (#1588 — Worker CPU): a row already saved in the canonical
  // lowercase shape has no PascalCase top-level key, so the O(content-size)
  // deep `remapKeys` walk (which re-allocates every nested object + array on
  // every read) is pure waste. PascalCase only appears in legacy hired.video
  // JSON-Resume exports not re-saved since the lowercase migration — a
  // vanishing share of read traffic. Skip the walk entirely for canonical rows.
  const hasPascalTopKey = Object.keys(obj).some((k) => k.length > 0 && k[0] !== k[0].toLowerCase());
  if (!hasPascalTopKey) {
    // Only clone when we must promote a stray top-level `name` → `title`
    // (rare on canonical rows) so we never mutate the caller's stored object.
    if (typeof obj.name === "string" && obj.title === undefined) {
      const { name, ...rest } = obj;
      return { ...rest, title: name };
    }
    return obj;
  }
  const remapped = remapKeys(obj) as Record<string, unknown>;
  // Legacy hired.video exports stored the resume's display title at the
  // top-level `Name` (lowercased here to `name`). Promote it to `title`
  // so callers reading the canonical field find it.
  if (typeof remapped.name === "string" && remapped.title === undefined) {
    remapped.title = remapped.name;
    delete remapped.name;
  }
  return remapped;
}

function toLowerFirst(key: string): string {
  if (!key) return key;
  // Preserve already-lowercase keys; only transform if first char is uppercase
  if (key[0] === key[0].toLowerCase()) return key;
  return key.charAt(0).toLowerCase() + key.slice(1);
}

function remapKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(remapKeys);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[toLowerFirst(k)] = remapKeys(v);
    }
    return out;
  }
  return value;
}

/**
 * Detect whether a raw string looks like a JSON Resume document. Returns
 * the parsed+normalised object when it does, or null otherwise. Accepts
 * both PascalCase (hired.video legacy exports) and the canonical
 * jsonresume.org lowercase shape.
 */
export function tryParseJsonResume(text: string): Record<string, unknown> | null {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  // Heuristic: at least one recognised JSON Resume top-level key
  const RESUME_KEYS = ["basics", "Basics", "work", "Work", "education", "Education", "skills", "Skills", "volunteer", "Volunteer", "projects", "Projects"];
  if (!RESUME_KEYS.some((k) => k in obj)) return null;
  return normalizeJsonResume(obj);
}

// ─── Binary-text guards (shared by /parse + /createfromfile) ───────────────

/**
 * Detect text that is actually undecoded binary leaking through as a string —
 * e.g. a PDF read as latin1, a DOCX/zip read as text, or the old client-side
 * "decode raw bytes" fallback. Such blobs must never reach the AI parser
 * (wastes tokens, returns garbage) or JSONB. Single source of truth so the
 * `/parse` and `/createfromfile` routes apply the same rule.
 */
export function looksLikeBinaryText(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trimStart();
  // NUL byte → almost certainly binary.
  if (text.includes("\u0000")) return true;
  // Container/document magic numbers that mean we got raw bytes, not text.
  if (trimmed.startsWith("PK")) return true; // zip (docx/xlsx/pptx)
  if (trimmed.startsWith("%PDF")) return true; // raw PDF stream
  // Control-char ratio: real resume text is overwhelmingly printable. Sample
  // the head so this stays O(1) on large blobs.
  const sample = text.slice(0, 1000);
  let control = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Allow tab(9), LF(10), CR(13); count the rest of C0 + DEL as control.
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) {
      control++;
    }
  }
  return sample.length > 0 && control / sample.length > 0.1;
}

/**
 * Strip the C0 control range (minus tab/newline/CR) so text is safe to store
 * in JSONB. There is no non-control way to express this character class, hence
 * the eslint exception. Mirrors the inline cleanup `/createfromfile` used to do.
 */
export function stripResumeControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

// ─── extractJson ───────────────────────────────────────────────────────────
// SSoT lives in shared/extract-json (also used by shared/social-caption).
export { extractJson } from "../../../../shared/extract-json.js";

// ─── isParseComplete ───────────────────────────────────────────────────────

/** Check whether a parsed JSON Resume has meaningful content. */
export function isParseComplete(parsed: Record<string, unknown>): boolean {
  const basics = parsed.basics as Record<string, unknown> | undefined;
  const hasName = !!(basics && (basics.name || basics.Name));

  const hasContent = (arr: unknown, keys: string[]) =>
    Array.isArray(arr) &&
    arr.some((item: any) =>
      keys.some(
        (k) => typeof item[k] === "string" && item[k].trim().length > 0,
      ),
    );

  const hasWork = hasContent(parsed.work, [
    "name",
    "Name",
    "position",
    "Position",
  ]);
  const hasSkills = hasContent(parsed.skills, ["name", "Name"]);
  const hasEducation = hasContent(parsed.education, [
    "institution",
    "Institution",
    "area",
    "Area",
  ]);
  const hasAwards = hasContent(parsed.awards, ["title", "Title"]);
  const hasCertificates = hasContent(parsed.certificates, ["name", "Name"]);
  return (
    hasName &&
    (hasWork || hasSkills || hasEducation || hasAwards || hasCertificates)
  );
}

// ─── Regex-based resume parser ─────────────────────────────────────────────

// Date token matchers shared across work/education parsing.
// Accepts:
//   - "Sep 2021", "Jan. 2005" (month name + year)
//   - "09/2021", "1/2019" (numeric)
//   - "2021" (bare year)
const DATE_TOKEN = String.raw`(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:[a-z]*\.?)?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})`;
const END_DATE_TOKEN = `(?:${DATE_TOKEN}|present|current)`;
const DATE_RANGE_RE = new RegExp(
  `(${DATE_TOKEN})\\s*[-–—]\\s*(${END_DATE_TOKEN})`,
  "i",
);

// Common boilerplate line that appears as a page footer in multi-page PDFs
// ("Sean Hogg - page 1"). Filter these out before section parsing so they
// don't leak into skills/awards/certificate lists.
const PAGE_FOOTER_RE = /^[A-Za-z][A-Za-z\s.'-]{1,40}\s-\s(?:page|pg)\s\d{1,3}$/i;

/** Regex-based resume parser — extracts structured fields from well-formatted resume text. */
export function parseResumeWithRegex(
  text: string,
): Record<string, unknown> {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !PAGE_FOOTER_RE.test(l));

  // Name: usually the first non-empty line
  const name = lines[0]?.replace(/[▪•|].*$/, "").trim() ?? "";

  // Email
  const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
  const email = emailMatch?.[0] ?? "";

  // Phone
  const phoneMatch = text.match(/(\+?\d[\d\s\-().]{7,}\d)/);
  const phone = phoneMatch?.[1]?.trim() ?? "";

  // URL
  const urlMatch = text.match(/https?:\/\/[^\s,)]+/);
  const url = urlMatch?.[0] ?? "";

  // Summary: look for "Profile", "Summary", "Objective" section
  let summary = "";
  const summaryIdx = lines.findIndex((l) =>
    /^(profile|summary|objective)\b/i.test(l),
  );
  if (summaryIdx !== -1) {
    const nextSectionIdx = lines.findIndex(
      (l, i) =>
        i > summaryIdx &&
        /^(work|experience|education|skills|volunteer)\b/i.test(l),
    );
    summary = lines
      .slice(
        summaryIdx + 1,
        nextSectionIdx !== -1 ? nextSectionIdx : summaryIdx + 5,
      )
      .join(" ")
      .trim();
  }

  // Work: look for company + position patterns
  const work: Array<Record<string, unknown>> = [];
  const workIdx = lines.findIndex((l) =>
    /^(work\s+experience|experience|employment)\b/i.test(l),
  );
  const workEndIdx = lines.findIndex(
    (l, i) =>
      i > (workIdx === -1 ? 0 : workIdx) &&
      /^(education|skills|volunteer|volunteering|awards|certif|publicat|languages|interests|references|projects)\b/i.test(
        l,
      ),
  );
  if (workIdx !== -1) {
    const endIdx = workEndIdx !== -1 ? workEndIdx : lines.length;
    for (let i = workIdx + 1; i < endIdx; i++) {
      const dateMatch = lines[i].match(DATE_RANGE_RE);
      if (dateMatch) {
        let companyName = "";
        let position = "";
        const prevLine = (i - 1 > workIdx ? lines[i - 1] : "") ?? "";
        const prevPrevLine = (i - 2 > workIdx ? lines[i - 2] : "") ?? "";

        const isBullet = /^[⦁•▪\-*]/.test(prevLine);
        const isHeader = /^(sean|profile|work|experience)/i.test(prevLine);

        if (!isBullet && !isHeader && prevLine) {
          const prevHasDelimiter = /[▪•|]/.test(prevLine);
          const prevPrevHasDelimiter =
            prevPrevLine &&
            /[▪•|]/.test(prevPrevLine) &&
            !/^[⦁•▪\-*]/.test(prevPrevLine);
          // A "position" line — the layout is usually Position / Company / Date
          // on three consecutive lines. Detect prev-prev as a plausible job
          // title: short, non-bullet, non-header, doesn't end in sentence-
          // terminating punctuation and isn't a stray paren/bracket fragment.
          const prevPrevIsTitle =
            prevPrevLine &&
            prevPrevLine.length >= 3 &&
            prevPrevLine.length <= 120 &&
            !/^[⦁•▪\-*]/.test(prevPrevLine) &&
            !/^(sean|profile|work|experience|education|skills|volunteer)/i.test(
              prevPrevLine,
            ) &&
            !/[.,;:)]$/.test(prevPrevLine) &&
            !/^[)\]}]/.test(prevPrevLine);

          if (prevHasDelimiter) {
            // "Company | Position" on the same line
            const parts = prevLine.split(/[|▪•]/);
            companyName = parts[0]?.trim() ?? "";
            position = parts[1]?.trim() ?? parts[0]?.trim() ?? "";
          } else if (prevPrevHasDelimiter) {
            // "Company ▪ Location" on prev-prev, "Position" on prev
            const compParts = prevPrevLine.split(/[▪•|]/);
            companyName = compParts[0]?.trim() ?? "";
            position = prevLine.trim();
          } else if (prevPrevIsTitle) {
            // Position / Company / Date three-line layout
            position = prevPrevLine.trim();
            companyName = prevLine.trim();
          } else {
            companyName = prevLine.trim();
          }
        }

        work.push({
          name: companyName,
          position,
          startDate: dateMatch[1],
          endDate: dateMatch[2],
          summary: "",
          highlights: [],
          url: "",
        });
      }
      // Bullet points
      if (/^[⦁•▪\-*]/.test(lines[i]) && work.length > 0) {
        const hl = (work[work.length - 1].highlights as string[]) ?? [];
        hl.push(lines[i].replace(/^[⦁•▪\-*]\s*/, ""));
        work[work.length - 1].highlights = hl;
      }
    }
  }

  // Skills: look for "Skills" section header first
  const skills: Array<Record<string, string>> = [];
  const skillsIdx = lines.findIndex((l) => /^skills\b/i.test(l));
  if (skillsIdx !== -1) {
    const nextSection = lines.findIndex(
      (l, i) =>
        i > skillsIdx &&
        /^(work|experience|education|volunteer|volunteering|awards|honors|honours|achievements|distinctions|certif|licenses?|credentials|publicat|languages|interests|references|projects)\b/i.test(
          l,
        ),
    );
    const skillLines = lines.slice(
      skillsIdx + 1,
      nextSection !== -1 ? nextSection : skillsIdx + 20,
    );
    // Skills are commonly delimited inline with bullets (•, ▪), pipes (|),
    // or commas. Split each line on those so "AWS • Python • Go" becomes
    // three entries rather than one lump.
    for (const sl of skillLines) {
      const cleaned = sl.replace(/^[⦁•▪\-*]\s*/, "");
      const pieces = cleaned
        .split(/\s*[•▪|]\s*|\s*,\s{2,}|\s+·\s+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 1);
      for (const piece of pieces) {
        skills.push({ name: piece, level: "" });
      }
    }
  }

  // Fallback: if no Skills section, extract from "Technologies:" bullet lines
  if (skills.length === 0) {
    for (const line of lines) {
      const techMatch = line.match(
        /^[⦁•▪\-*]?\s*(?:technologies|tech stack|tools|technical skills)\s*[:-]\s*(.+)/i,
      );
      if (techMatch) {
        const items = techMatch[1]
          .split(/[,;]/)
          .map((s) => s.replace(/\(.*?\)/g, "").trim())
          .filter((s) => s.length > 1);
        for (const item of items) {
          skills.push({ name: item, level: "" });
        }
      }
    }
  }

  // Education
  const education: Array<Record<string, unknown>> = [];
  const eduIdx = lines.findIndex((l) => /^education\b/i.test(l));
  if (eduIdx !== -1) {
    const eduEndIdx = lines.findIndex(
      (l, i) =>
        i > eduIdx &&
        /^(volunteer|volunteering|skills|awards|honors|honours|achievements|certif|licenses?|credentials|publicat|languages|interests|references|projects)\b/i.test(
          l,
        ),
    );
    const eduEnd =
      eduEndIdx !== -1 ? eduEndIdx : Math.min(eduIdx + 30, lines.length);
    for (let i = eduIdx + 1; i < eduEnd; i++) {
      if (/university|college|institute|school/i.test(lines[i])) {
        const headerParts = lines[i].split(",");
        const institution = headerParts[0]?.trim() ?? "";
        let area = headerParts[1]?.trim() ?? "";
        let studyType = "";
        let startDate = "";
        let endDate = "";

        // Next line may be a degree line ("Bachelor of Science (BSc),
        // Computer Science") rather than a date. Extract study type and
        // area from it, then look at the line after for the date.
        if (i + 1 < eduEnd) {
          const next = lines[i + 1];
          const nextDate = next.match(DATE_RANGE_RE);
          if (nextDate) {
            startDate = nextDate[1];
            endDate = nextDate[2];
            i++;
          } else if (
            /\b(bachelor|master|associate|ph\.?d|doctorate|b\.?[sa]\.?|m\.?[sa]\.?|b\.?eng|m\.?eng|diploma|certificate)\b/i.test(
              next,
            )
          ) {
            const degParts = next.split(",");
            studyType = degParts[0]?.trim() ?? "";
            if (!area && degParts[1]) area = degParts[1].trim();
            i++;
            if (i + 1 < eduEnd) {
              const dm = lines[i + 1].match(DATE_RANGE_RE);
              if (dm) {
                startDate = dm[1];
                endDate = dm[2];
                i++;
              }
            }
          }
        }

        education.push({
          institution,
          area,
          studyType,
          startDate,
          endDate,
          score: "",
          courses: [],
          url: "",
        });
      }
    }
  }

  // Volunteering
  const volunteer: Array<Record<string, unknown>> = [];
  const volIdx = lines.findIndex((l) =>
    /^(volunteer|volunteering)\b/i.test(l),
  );
  if (volIdx !== -1) {
    const volEndIdx = lines.findIndex(
      (l, i) =>
        i > volIdx &&
        /^(skills|awards|certif|publicat|languages|interests|references|projects|education)\b/i.test(
          l,
        ),
    );
    const volEnd =
      volEndIdx !== -1 ? volEndIdx : Math.min(volIdx + 15, lines.length);
    for (let i = volIdx + 1; i < volEnd; i++) {
      const volMatch = lines[i].match(
        /^(.+?),\s*(.+?)(?:\s*\((.+?)\s*[-–—]\s*(.+?)\))?$/,
      );
      if (volMatch) {
        volunteer.push({
          organization: volMatch[1]?.trim() ?? "",
          position: volMatch[2]?.trim() ?? "",
          startDate: volMatch[3]?.trim() ?? "",
          endDate: volMatch[4]?.trim() ?? "",
          summary: "",
          highlights: [],
          url: "",
        });
      }
    }
  }

  // Awards / Honors / Achievements
  const awards: Array<Record<string, string>> = [];
  const awardsIdx = lines.findIndex((l) =>
    /^(awards|honors|honours|achievements|recognition|honors\s*&\s*awards|distinctions)\b/i.test(
      l,
    ),
  );
  if (awardsIdx !== -1) {
    const awardsEndIdx = lines.findIndex(
      (l, i) =>
        i > awardsIdx &&
        /^(work|experience|education|skills|volunteer|volunteering|certif|licenses?|credentials|publicat|languages|interests|references|projects|profile|summary)\b/i.test(
          l,
        ),
    );
    const awardsEnd =
      awardsEndIdx !== -1 ? awardsEndIdx : Math.min(awardsIdx + 30, lines.length);
    const yearPattern = /\b(19|20)\d{2}\b/;
    const monthYearPattern = /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:[a-z]*\.?)?\s+\d{4}$/i;
    for (let i = awardsIdx + 1; i < awardsEnd; i++) {
      const line = lines[i].replace(/^[⦁•▪\-*]\s*/, "").trim();
      if (line.length < 3) continue;

      // A bare date line ("Mar 2015") belongs to the previous award, not a
      // new one. Same for short trailing lines that look like metadata.
      if (monthYearPattern.test(line) && awards.length > 0) {
        if (!awards[awards.length - 1].date) awards[awards.length - 1].date = line;
        continue;
      }

      // Descriptive prose following an award is that award's summary.
      // Detect by the absence of typical title markers (year, dash-with-
      // issuer, or comma-year) — prose sentences have none of these.
      const hasTitleMarker = /\s[—–|]\s|,\s+(?:19|20)\d{2}\b|\b(19|20)\d{2}\b/.test(line);
      if (awards.length > 0 && !hasTitleMarker) {
        const prev = awards[awards.length - 1];
        prev.summary = prev.summary ? prev.summary + " " + line : line;
        continue;
      }

      const yearMatch = line.match(yearPattern);
      const date = yearMatch?.[0] ?? "";
      const withoutDate = line
        .replace(/\s*[—–\-()]*\s*(19|20)\d{2}\s*\)?/, "")
        .trim();
      const parts = withoutDate.split(/\s+[—–|]\s+|,\s+/);
      awards.push({
        title: parts[0]?.trim() ?? withoutDate,
        awarder: parts.slice(1).join(", ").trim(),
        date,
        summary: "",
      });
    }
  }

  // Certifications / Licenses
  const certificates: Array<Record<string, string>> = [];
  const certIdx = lines.findIndex((l) =>
    /^(certifications?|licenses?|credentials|accreditations)\b/i.test(l),
  );
  if (certIdx !== -1) {
    const certEndIdx = lines.findIndex(
      (l, i) =>
        i > certIdx &&
        /^(work|experience|education|skills|volunteer|volunteering|awards|honors|publicat|languages|interests|references|projects|profile|summary)\b/i.test(
          l,
        ),
    );
    const certEnd =
      certEndIdx !== -1 ? certEndIdx : Math.min(certIdx + 20, lines.length);
    const yearPattern = /\b(19|20)\d{2}\b/;
    const knownIssuers =
      /\b(AWS|Amazon|Google|GCP|Microsoft|Azure|Cisco|CompTIA|Oracle|IBM|PMI|Scrum Alliance|Kubernetes|Red Hat|Salesforce|HashiCorp)\b/i;
    for (let i = certIdx + 1; i < certEnd; i++) {
      const line = lines[i].replace(/^[⦁•▪\-*]\s*/, "").trim();
      if (line.length < 3) continue;
      const yearMatch = line.match(yearPattern);
      const date = yearMatch?.[0] ?? "";
      const withoutDate = line
        .replace(/\s*[—–\-()]*\s*(19|20)\d{2}\s*\)?/, "")
        .trim();
      const parts = withoutDate.split(/\s+[—–|]\s+|,\s+/);
      const name = parts[0]?.trim() ?? withoutDate;
      let issuer = parts.slice(1).join(", ").trim();
      if (!issuer) {
        const issuerMatch = name.match(knownIssuers);
        if (issuerMatch) issuer = issuerMatch[0];
      }
      certificates.push({ name, issuer, date, url: "" });
    }
  }

  // Location: try to extract city/region from the header area
  let location: Record<string, string> | null = null;
  const locMatch = text.match(
    /(?:▪|•|\|)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\b/,
  );
  if (locMatch) {
    location = {
      city: locMatch[1],
      region: locMatch[2],
      countryCode: "",
      address: "",
      postalCode: "",
    };
  }

  return {
    basics: { name, label: "", email, phone, url, summary, location },
    work,
    education,
    skills,
    volunteer,
    awards,
    certificates,
    publications: [],
    languages: [],
    interests: [],
    references: [],
    projects: [],
  };
}

// ─── Resume content → plain text ───────────────────────────────────────────

function asArray(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

/**
 * Convert a resume JSON content blob to readable plain text.
 * Handles both JSON Resume (lowercase) and frontend (PascalCase) keys,
 * plus legacy flat formats.
 */
export function resumeContentToText(content: unknown, maxLength = 8000): string {
  if (!content || typeof content !== "object") return "";
  const parts: string[] = [];
  const c = content as Record<string, unknown>;

  // Basics / contact
  const basics = (c.basics ?? c.Basics) as Record<string, unknown> | undefined;
  if (basics && typeof basics === "object") {
    if (basics.name || basics.Name) parts.push(`Name: ${basics.name ?? basics.Name}`);
    if (basics.label || basics.Label) parts.push(`Title: ${basics.label ?? basics.Label}`);
    if (basics.email || basics.Email) parts.push(`Email: ${basics.email ?? basics.Email}`);
    if (basics.phone || basics.Phone) parts.push(`Phone: ${basics.phone ?? basics.Phone}`);
    if (basics.summary || basics.Summary) parts.push(`Summary: ${basics.summary ?? basics.Summary}`);
  } else {
    if (c.name || c.fullName) parts.push(`Name: ${c.name ?? c.fullName}`);
    if (c.headline || c.title || c.label) parts.push(`Title: ${c.headline ?? c.title ?? c.label}`);
    if (c.summary || c.objective) parts.push(`Summary: ${c.summary ?? c.objective}`);
  }

  // Skills
  const skills = c.skills ?? c.Skills;
  if (Array.isArray(skills)) {
    const list = skills.map((s: unknown) => {
      if (typeof s === "string") return s;
      if (s && typeof s === "object") {
        const sk = s as Record<string, unknown>;
        const name = sk.name ?? sk.Name ?? "";
        const kw = Array.isArray(sk.keywords ?? sk.Keywords) ? (sk.keywords ?? sk.Keywords) as string[] : [];
        return kw.length ? `${name} (${kw.join(", ")})` : String(name);
      }
      return "";
    }).filter(Boolean);
    if (list.length) parts.push(`\nSkills: ${list.join(", ")}`);
  } else if (typeof skills === "string") {
    parts.push(`\nSkills: ${skills}`);
  }

  // Work experience
  for (const job of asArray(c.work ?? c.Work ?? c.experience ?? c.workExperience ?? c.Experience)) {
    if (!job || typeof job !== "object") continue;
    const j = job as Record<string, unknown>;
    const company = j.name ?? j.Name ?? j.company ?? j.employer ?? "";
    const position = j.position ?? j.Position ?? j.title ?? "";
    const dates = [j.startDate ?? j.StartDate, j.endDate ?? j.EndDate ?? "Present"].filter(Boolean).join(" - ");
    parts.push(`\nJob: ${position} at ${company} (${dates})`);
    if (j.summary ?? j.Summary) parts.push(String(j.summary ?? j.Summary).slice(0, 500));
    if (j.description) parts.push(String(j.description).slice(0, 500));
    const highlights = (j.highlights ?? j.Highlights) as string[] | undefined;
    if (Array.isArray(highlights) && highlights.length) {
      parts.push(highlights.map((h) => `- ${h}`).join("\n"));
    }
  }

  // Education
  for (const edu of asArray(c.education ?? c.Education)) {
    if (!edu || typeof edu !== "object") continue;
    const e = edu as Record<string, unknown>;
    const institution = e.institution ?? e.Institution ?? e.school ?? "";
    const degree = [e.studyType ?? e.StudyType, e.area ?? e.Area].filter(Boolean).join(" in ") || (e.degree ?? e.program ?? "");
    const dates = [e.startDate ?? e.StartDate, e.endDate ?? e.EndDate].filter(Boolean).join(" - ");
    parts.push(`Education: ${degree} at ${institution}${dates ? ` (${dates})` : ""}`);
  }

  // Volunteer
  for (const v of asArray(c.volunteer ?? c.Volunteer)) {
    if (!v || typeof v !== "object") continue;
    const vol = v as Record<string, unknown>;
    parts.push(`Volunteer: ${vol.position ?? vol.Position ?? ""} at ${vol.organization ?? vol.Organization ?? ""}`);
  }

  // Projects
  for (const p of asArray(c.projects ?? c.Projects)) {
    if (!p || typeof p !== "object") continue;
    const proj = p as Record<string, unknown>;
    parts.push(`Project: ${proj.name ?? proj.Name ?? ""} - ${proj.description ?? proj.Description ?? ""}`);
  }

  // Certificates
  for (const cert of asArray(c.certificates ?? c.Certificates)) {
    if (!cert || typeof cert !== "object") continue;
    const ct = cert as Record<string, unknown>;
    parts.push(`Certificate: ${ct.name ?? ct.Name ?? ""} (${ct.issuer ?? ct.Issuer ?? ""})`);
  }

  const structured = parts.join("\n").trim();
  if (structured) return structured.slice(0, maxLength);

  // Fallbacks
  if (c.resumeSerialized && typeof c.resumeSerialized === "string") {
    try { return resumeContentToText(JSON.parse(c.resumeSerialized), maxLength); } catch { /* fall through */ }
  }
  if (c.markdown && typeof c.markdown === "string" && c.markdown.trim()) {
    return c.markdown.slice(0, maxLength);
  }

  return JSON.stringify(content).slice(0, maxLength);
}
