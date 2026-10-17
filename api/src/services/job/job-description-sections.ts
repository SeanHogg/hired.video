import type { ParsedJob } from "./job-page-parse.js";

/**
 * Post-parse description section splitter. When the structured arrays
 * (responsibilities, requirements, qualifications, benefits) are empty
 * but the description text contains recognizable headings, extract them.
 *
 * Common patterns (Dice, Greenhouse, many ATSes):
 *   "Key Responsibilities ... Qualifications ... Benefits ..."
 *   "What You'll Do ... What We're Looking For ... What We Offer ..."
 */
export function splitDescriptionSections(parsed: ParsedJob): ParsedJob {
  // Only run when all structured fields are empty.
  const hasStructure =
    (parsed.responsibilities?.length ?? 0) > 0 ||
    (parsed.requirements?.length ?? 0) > 0 ||
    (parsed.qualifications?.length ?? 0) > 0 ||
    (parsed.benefits?.length ?? 0) > 0;
  if (hasStructure) return parsed;

  const text = parsed.description || "";
  if (text.length < 200) return parsed;

  // Section-header patterns — order matters: check more specific first.
  const SECTION_PATTERNS: Array<{
    key: keyof Pick<ParsedJob, "responsibilities" | "requirements" | "qualifications" | "benefits">;
    patterns: RegExp[];
  }> = [
    {
      key: "responsibilities",
      patterns: [
        /(?:key\s+)?responsibilities/i,
        /what\s+you(?:'ll|\s+will)\s+do/i,
        /your\s+role/i,
        /the\s+role/i,
        /job\s+duties/i,
        /essential\s+(?:duties|functions)/i,
      ],
    },
    {
      key: "requirements",
      patterns: [
        /(?:basic\s+|minimum\s+)?requirements/i,
        /what\s+we(?:'re|\s+are)\s+looking\s+for/i,
        /what\s+you(?:'ll|\s+will)\s+(?:need|bring)/i,
        /required\s+skills/i,
        /skills\s+(?:&|and)\s+experience/i,
        /must\s+have/i,
      ],
    },
    {
      key: "qualifications",
      patterns: [
        /qualifications/i,
        /education/i,
        /preferred\s+qualifications/i,
        /nice\s+to\s+have/i,
        /desired\s+skills/i,
      ],
    },
    {
      key: "benefits",
      patterns: [
        // Matches "Benefits", "Benefit", "Benefits & Perks", "Benefits and Perks".
        /benefits?(?:\s*(?:&|and)\s*perks?)?/i,
        /what\s+we\s+offer/i,
        /why\s+(?:join|work)/i,
        /compensation/i,
        /our\s+benefits/i,
        /perks/i,
      ],
    },
  ];

  // Split the text into lines.
  const lines = text.split(/\n|(?<=\.)\s+(?=[A-Z])/);

  // Walk lines and assign each to the most-recently-matched section.
  let currentKey: string | null = null;
  const buckets: Record<string, string[]> = {};
  let cleanDescription: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let matched = false;
    for (const section of SECTION_PATTERNS) {
      if (section.patterns.some((p) => p.test(line) && line.length < 120)) {
        currentKey = section.key;
        if (!buckets[currentKey]) buckets[currentKey] = [];
        matched = true;
        break;
      }
    }

    if (matched) continue;

    if (currentKey && buckets[currentKey]) {
      // Strip leading bullet chars or numbered-list prefixes like "1.", "2)".
      // Do NOT eat bare leading digits — "5+ years" must stay intact.
      const clean = line
        .replace(/^(?:[\s•\-–—*·▪►●○◦→⮞]+|\d+[.)\]])\s*/, "")
        .trim();
      if (clean.length > 10) buckets[currentKey].push(clean);
    } else {
      cleanDescription.push(line);
    }
  }

  return {
    ...parsed,
    // Replace the giant-blob description with the pre-section portion.
    description: cleanDescription.length > 0 ? cleanDescription.join("\n") : parsed.description,
    responsibilities: buckets.responsibilities?.length ? buckets.responsibilities : parsed.responsibilities,
    requirements: buckets.requirements?.length ? buckets.requirements : parsed.requirements,
    qualifications: buckets.qualifications?.length ? buckets.qualifications : parsed.qualifications,
    benefits: buckets.benefits?.length ? buckets.benefits : parsed.benefits,
  };
}
