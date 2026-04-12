/**
 * resume-parse.ts — Pure functions for parsing resume text and normalising
 * resume content between PascalCase (frontend) and lowercase (JSON Resume)
 * key conventions.
 *
 * Extracted from routes/resumes.ts so they can be unit-tested independently.
 */

// ─── Key normalisation helpers ─────────────────────────────────────────────

/** Case-insensitive property lookup: tries `key` then `Key`. */
export function ciGet(obj: Record<string, unknown>, key: string): unknown {
  return obj[key] ?? obj[key.charAt(0).toUpperCase() + key.slice(1)];
}

/** Same as ciGet but takes a full object and a key. */
export function ciProp(obj: Record<string, unknown>, key: string): unknown {
  return obj[key] ?? obj[key.charAt(0).toUpperCase() + key.slice(1)];
}

// ─── metaResume builder ────────────────────────────────────────────────────

function ensureId(
  item: Record<string, unknown>,
  resumeId: string,
  section: string,
  index: number,
): Record<string, unknown> {
  if (item.id || item.Id) return item;
  return { ...item, id: `${resumeId}-${section}-${index}` };
}

/**
 * Build the legacy `metaResume` envelope from a raw content JSONB blob.
 * Handles both lowercase and PascalCase keys transparently.
 */
export function buildMetaResume(
  content: Record<string, unknown>,
  resumeId: string,
  rowTitle: string,
) {
  const c = content;
  const ci = (key: string) => ciGet(c, key);
  const prop = (obj: Record<string, unknown>, key: string) => ciProp(obj, key);

  const basics = (ci("basics") ?? {}) as Record<string, unknown>;
  const loc = prop(basics, "location") as Record<string, unknown> | null | undefined;

  const ensureArr = (key: string) => {
    const arr = ci(key);
    return Array.isArray(arr)
      ? arr.map((item: any, i: number) => ensureId(item, resumeId, key, i))
      : [];
  };

  return {
    basics: {
      id: prop(basics, "id") || prop(basics, "Id") || `${resumeId}-basics-0`,
      name: prop(basics, "name") ?? rowTitle ?? "",
      label: prop(basics, "label") ?? "",
      image: prop(basics, "image") ?? "",
      email: prop(basics, "email") ?? "",
      phone: prop(basics, "phone") ?? "",
      url: prop(basics, "url") ?? "",
      summary: prop(basics, "summary") ?? "",
      location: loc
        ? {
            address: prop(loc, "address") ?? "",
            postalCode: prop(loc, "postalCode") ?? "",
            city: prop(loc, "city") ?? "",
            countryCode: prop(loc, "countryCode") ?? "",
            region: prop(loc, "region") ?? "",
          }
        : null,
    },
    work: ensureArr("work"),
    education: ensureArr("education"),
    volunteer: ensureArr("volunteer"),
    awards: ensureArr("awards"),
    certificates: ensureArr("certificates"),
    publications: ensureArr("publications"),
    skills: ensureArr("skills"),
    languages: ensureArr("languages"),
    interests: ensureArr("interests"),
    references: ensureArr("references"),
    projects: ensureArr("projects"),
  };
}

// ─── extractJson ───────────────────────────────────────────────────────────

/** Strip markdown fences and extract the first JSON object from an LLM response. */
export function extractJson(raw: string): Record<string, unknown> {
  let cleaned = raw
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
  return hasName && (hasWork || hasSkills || hasEducation);
}

// ─── Regex-based resume parser ─────────────────────────────────────────────

/** Regex-based resume parser — extracts structured fields from well-formatted resume text. */
export function parseResumeWithRegex(
  text: string,
): Record<string, unknown> {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

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
    const datePattern =
      /(\d{1,2}\/\d{4}|\d{4})\s*[-–—]\s*(\d{1,2}\/\d{4}|\d{4}|present)/i;
    for (let i = workIdx + 1; i < endIdx; i++) {
      const dateMatch = lines[i].match(datePattern);
      if (dateMatch) {
        let companyName = "";
        let position = "";
        const prevLine = (i - 1 > workIdx ? lines[i - 1] : "") ?? "";
        const prevPrevLine = (i - 2 > workIdx ? lines[i - 2] : "") ?? "";

        const isBullet = /^[⦁•▪\-*]/.test(prevLine);
        const isHeader = /^(sean|profile|work|experience)/i.test(prevLine);

        if (!isBullet && !isHeader && prevLine) {
          if (
            prevPrevLine &&
            /[▪•|]/.test(prevPrevLine) &&
            !/^[⦁•▪\-*]/.test(prevPrevLine)
          ) {
            const compParts = prevPrevLine.split(/[▪•|]/);
            companyName = compParts[0]?.trim() ?? "";
            position = prevLine.trim();
          } else {
            const parts = prevLine.split(/[|▪•]/);
            companyName = parts[0]?.trim() ?? "";
            position = parts[1]?.trim() ?? parts[0]?.trim() ?? "";
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

  // Skills: look for "Skills" section
  const skills: Array<Record<string, string>> = [];
  const skillsIdx = lines.findIndex((l) => /^skills\b/i.test(l));
  if (skillsIdx !== -1) {
    const nextSection = lines.findIndex(
      (l, i) =>
        i > skillsIdx &&
        /^(education|volunteer|awards|certif|publicat|languages|interests|references|projects)\b/i.test(
          l,
        ),
    );
    const skillLines = lines.slice(
      skillsIdx + 1,
      nextSection !== -1 ? nextSection : skillsIdx + 20,
    );
    for (const sl of skillLines) {
      if (sl.length > 2)
        skills.push({ name: sl.replace(/^[⦁•▪\-*]\s*/, ""), level: "" });
    }
  }

  // Education
  const education: Array<Record<string, unknown>> = [];
  const eduIdx = lines.findIndex((l) => /^education\b/i.test(l));
  if (eduIdx !== -1) {
    const eduEndIdx = lines.findIndex(
      (l, i) =>
        i > eduIdx &&
        /^(volunteer|volunteering|skills|awards|certif|publicat|languages|interests|references|projects)\b/i.test(
          l,
        ),
    );
    const eduEnd =
      eduEndIdx !== -1 ? eduEndIdx : Math.min(eduIdx + 15, lines.length);
    const datePattern =
      /(\d{1,2}\/\d{4}|\d{4})\s*[-–—]\s*(\d{1,2}\/\d{4}|\d{4}|present)/i;
    for (let i = eduIdx + 1; i < eduEnd; i++) {
      if (/university|college|institute|school/i.test(lines[i])) {
        const parts = lines[i].split(",");
        const institution = parts[0]?.trim() ?? "";
        const area = parts[1]?.trim() ?? "";
        let startDate = "";
        let endDate = "";
        if (i + 1 < eduEnd) {
          const dm = lines[i + 1].match(datePattern);
          if (dm) {
            startDate = dm[1];
            endDate = dm[2];
            i++;
          }
        }
        education.push({
          institution,
          area,
          studyType: "",
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
    awards: [],
    certificates: [],
    publications: [],
    languages: [],
    interests: [],
    references: [],
    projects: [],
  };
}
