/**
 * Helpers that flatten structured content into the plain narration text
 * the TextNarrator player expects. Lives next to the synth helpers in
 * `lib/audio/` so every surface that wants a "read this aloud" button
 * has one place to grab the right string.
 *
 * Self-gating philosophy: every helper accepts a partial / nullable
 * input and returns an empty string for "nothing to narrate", so the
 * caller can pass `<TextNarrator text={textFromX(maybeNull)} />`
 * unconditionally — the narrator itself returns null on empty input.
 */
import type {
  Basics,
  Education,
  Project,
  Resume,
  ResumeContent,
  Skill,
  Work,
} from "@shared/resume";
import type { MarketingFAQItem } from "@/components/MarketingFAQ";

/** Join non-empty segments with a sentence break so TTS phrases them
 *  separately instead of running them together. */
function joinSentences(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(" ");
}

/** Q&A blocks read naturally as "Question. Answer." pairs. */
export function textFromFAQ(items: MarketingFAQItem[] | undefined): string {
  if (!items?.length) return "";
  return items
    .map((item) => joinSentences([item.question, item.answer]))
    .join(" ");
}

function workToSentence(w: Work): string {
  const where = [w.position, w.name].filter(Boolean).join(" at ");
  const range = [w.startDate, w.endDate].filter(Boolean).join(" to ");
  const header = [where, range && `(${range})`].filter(Boolean).join(" ");
  return joinSentences([
    header,
    w.summary,
    ...(w.highlights ?? []),
  ]);
}

function educationToSentence(e: Education): string {
  const what = [e.studyType, e.area].filter(Boolean).join(" in ");
  const where = [what, e.institution].filter(Boolean).join(" from ");
  const range = [e.startDate, e.endDate].filter(Boolean).join(" to ");
  return joinSentences([
    [where, range && `(${range})`].filter(Boolean).join(" "),
  ]);
}

function projectToSentence(p: Project): string {
  return joinSentences([
    p.name,
    p.description,
    ...(p.highlights ?? []),
  ]);
}

function skillToPhrase(s: Skill): string {
  if (!s.name) return "";
  if (s.level) return `${s.name} (${s.level})`;
  return s.name;
}

function basicsToHeader(b: Basics | undefined): string {
  if (!b) return "";
  const intro = [b.name, b.label].filter(Boolean).join(", ");
  return joinSentences([intro, b.summary]);
}

/** Assemble a resume into a narratable summary. Keeps the top-line
 *  sections (basics summary, work history, education, projects, skills)
 *  and skips machine-only fields (interactive canvas blobs, dates as
 *  raw ISO strings, etc.). */
export function textFromResume(
  resume: Pick<Resume, "content"> | null | undefined,
): string {
  const c: ResumeContent | undefined = resume?.content;
  if (!c) return "";

  const sections: string[] = [];
  const header = basicsToHeader(c.basics);
  if (header) sections.push(header);

  if (c.work?.length) {
    sections.push("Experience.");
    sections.push(c.work.map(workToSentence).filter(Boolean).join(" "));
  }
  if (c.education?.length) {
    sections.push("Education.");
    sections.push(
      c.education.map(educationToSentence).filter(Boolean).join(" "),
    );
  }
  if (c.projects?.length) {
    sections.push("Projects.");
    sections.push(c.projects.map(projectToSentence).filter(Boolean).join(" "));
  }
  if (c.skills?.length) {
    sections.push("Skills.");
    sections.push(c.skills.map(skillToPhrase).filter(Boolean).join(", ") + ".");
  }
  return sections.filter(Boolean).join(" ");
}

/** Company About blob — descriptor + mission + vision. The page
 *  composes these into three Cards visually; for narration we want one
 *  continuous read. */
export function textFromCompanyAbout(input: {
  name?: string | null;
  description?: string | null;
  mission?: string | null;
  vision?: string | null;
}): string {
  const intro = input.name ? `About ${input.name}.` : "";
  const mission = input.mission ? `Our mission. ${input.mission}` : "";
  const vision = input.vision ? `Our vision. ${input.vision}` : "";
  return joinSentences([intro, input.description, mission, vision]);
}

/** Job posting body — title + company + summary/description + the
 *  optional bullet lists. */
export function textFromJobDescription(input: {
  title?: string | null;
  company?: string | null;
  description?: string | null;
  responsibilities?: string[] | null;
  requirements?: string[] | null;
  qualifications?: string[] | null;
  benefits?: string[] | null;
}): string {
  const header =
    input.title && input.company
      ? `${input.title} at ${input.company}.`
      : input.title ?? "";

  const bulletGroup = (label: string, items?: string[] | null) =>
    items?.length ? `${label}. ${items.join(". ")}.` : "";

  return joinSentences([
    header,
    input.description,
    bulletGroup("Responsibilities", input.responsibilities),
    bulletGroup("Requirements", input.requirements),
    bulletGroup("Qualifications", input.qualifications),
    bulletGroup("Benefits", input.benefits),
  ]);
}
