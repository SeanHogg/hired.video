/** Career 360 seeker snapshot — profile + master-resume signals fed to every LLM prompt. */

import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { ResumeContentSchema } from "../../../../shared/resume.js";

const { users, userProfiles, resumeInformation } = schema;

export interface SeekerSnapshot {
  fullName: string;
  headline: string | null;
  summary: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  yearsOfExperience: number | null;
  skills: string[];
  industries: string[];
  preferredRoles: string[];
  /** Pulled from the user's master resume content (`certificates[]`).
   *  Without this the LLM hallucinates "you should get certified in X"
   *  when the seeker already holds X — the original 2026-05-10 bug
   *  report on Career 360 was a PSPO-certified user being told to earn
   *  PSPO. Format: "Name (Issuer, YYYY)". */
  certifications: string[];
  /** Awards from the master resume — used the same way as certifications
   *  to prevent hallucinated "this isn't recognised" gap rows. */
  awards: string[];
  /** Highest education entries from the master resume — degree + field
   *  + institution. Truncated to the most recent 4 to keep the prompt
   *  bounded for free-tier models. */
  education: string[];
  /** Concatenated work history headline (Title @ Company, YYYY–YYYY).
   *  The full bullet text would blow the prompt budget; the title +
   *  company line is enough for the LLM to ground "have you done X?"
   *  reasoning. Truncated to the most recent 6 roles. */
  workHistory: string[];
}

export async function loadSeekerSnapshot(userId: string): Promise<SeekerSnapshot> {
  const db = getDb();

  const [account] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account) throw new Error("USER_NOT_FOUND");

  const [profile] = await db
    .select({
      headline: userProfiles.headline,
      summary: userProfiles.summary,
      currentRole: userProfiles.currentRole,
      currentCompany: userProfiles.currentCompany,
      yearsOfExperience: userProfiles.yearsOfExperience,
      skills: userProfiles.skills,
      industries: userProfiles.industries,
      preferredRoles: userProfiles.preferredRoles,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  // Master resume → certifications/awards/education/work, the signals
  // the prompt was previously blind to. Without these the LLM can't
  // cross-check "do they already hold this cert?" and fabricates a
  // gap (production bug report 2026-05-10: PSPO-certified user told
  // to earn PSPO). Falls back to a fresh resume if no master flag is
  // set, since legacy accounts pre-date the master flag.
  const [resumeRow] = await db
    .select({ content: resumeInformation.content })
    .from(resumeInformation)
    .where(
      and(
        eq(resumeInformation.userId, userId),
        eq(resumeInformation.isMaster, true),
      ),
    )
    .orderBy(desc(resumeInformation.updatedAt))
    .limit(1);

  const fallbackResume = resumeRow
    ? null
    : (await db
        .select({ content: resumeInformation.content })
        .from(resumeInformation)
        .where(eq(resumeInformation.userId, userId))
        .orderBy(desc(resumeInformation.updatedAt))
        .limit(1))[0] ?? null;

  const resumeContent = parseResumeContent(resumeRow?.content ?? fallbackResume?.content);

  return {
    fullName: account.name ?? "",
    headline: profile?.headline ?? null,
    summary: profile?.summary ?? null,
    currentRole: profile?.currentRole ?? null,
    currentCompany: profile?.currentCompany ?? null,
    yearsOfExperience: profile?.yearsOfExperience ?? null,
    skills: Array.isArray(profile?.skills) ? (profile!.skills as string[]) : [],
    industries: Array.isArray(profile?.industries) ? (profile!.industries as string[]) : [],
    preferredRoles: Array.isArray(profile?.preferredRoles)
      ? (profile!.preferredRoles as string[])
      : [],
    certifications: resumeContent.certifications,
    awards: resumeContent.awards,
    education: resumeContent.education,
    workHistory: resumeContent.workHistory,
  };
}

/** Extract the four resume-derived fields the snapshot needs. The
 *  resume row's `content` is jsonb; if it doesn't parse against the
 *  shared `ResumeContentSchema` (legacy, partial, or corrupted) we
 *  treat each field as empty rather than crashing the whole flow. */
function parseResumeContent(raw: unknown): {
  certifications: string[];
  awards: string[];
  education: string[];
  workHistory: string[];
} {
  if (!raw || typeof raw !== "object") {
    return { certifications: [], awards: [], education: [], workHistory: [] };
  }
  const parsed = ResumeContentSchema.safeParse(raw);
  if (!parsed.success) {
    return { certifications: [], awards: [], education: [], workHistory: [] };
  }
  const c = parsed.data;
  return {
    certifications: c.certificates
      .filter((cert) => cert.name?.trim())
      .map((cert) => {
        const parts = [cert.name];
        if (cert.issuer) parts.push(`(${cert.issuer}${cert.date ? `, ${cert.date}` : ""})`);
        else if (cert.date) parts.push(`(${cert.date})`);
        return parts.join(" ");
      }),
    awards: c.awards
      .filter((a) => a.title?.trim())
      .map((a) => {
        const parts = [a.title];
        if (a.awarder) parts.push(`— ${a.awarder}`);
        if (a.date) parts.push(`(${a.date})`);
        return parts.join(" ");
      }),
    // Most-recent 4 entries — by `endDate` desc with a fallback to
    // `startDate`. Resumes typically list newest-first already, so a
    // simple slice catches the common case without parsing dates.
    education: c.education
      .slice(0, 4)
      .filter((e) => e.studyType || e.area || e.institution)
      .map((e) => {
        const study = [e.studyType, e.area].filter(Boolean).join(" in ");
        const inst = e.institution ? ` — ${e.institution}` : "";
        return `${study || "Studied"}${inst}`;
      }),
    workHistory: c.work
      .slice(0, 6)
      .filter((w) => w.position || w.name)
      .map((w) => {
        const role = w.position || "Role";
        const company = w.name ? ` @ ${w.name}` : "";
        const start = w.startDate || "";
        const end = w.endDate || "Present";
        const dates = start || end ? ` (${start || "?"}–${end})` : "";
        return `${role}${company}${dates}`;
      }),
  };
}

export function snapshotForPrompt(s: SeekerSnapshot): string {
  const lines = [
    `Name: ${s.fullName || "(unknown)"}`,
    `Current role: ${s.currentRole ?? "(not set)"}${s.currentCompany ? ` at ${s.currentCompany}` : ""}`,
    `Headline: ${s.headline ?? "(not set)"}`,
    `Summary: ${s.summary ?? "(not set)"}`,
    `Years of experience: ${s.yearsOfExperience ?? "(not set)"}`,
    `Skills: ${s.skills.length ? s.skills.join(", ") : "(none listed)"}`,
    `Industries: ${s.industries.length ? s.industries.join(", ") : "(none listed)"}`,
    `Preferred roles: ${s.preferredRoles.length ? s.preferredRoles.join(", ") : "(none listed)"}`,
    `Certifications held: ${s.certifications.length ? s.certifications.join("; ") : "(none on file)"}`,
    `Awards: ${s.awards.length ? s.awards.join("; ") : "(none on file)"}`,
    `Education: ${s.education.length ? s.education.join("; ") : "(none on file)"}`,
    `Work history (most recent first): ${s.workHistory.length ? s.workHistory.join(" | ") : "(none on file)"}`,
  ];
  return lines.join("\n");
}
