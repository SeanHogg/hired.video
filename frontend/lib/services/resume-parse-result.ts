/**
 * Parsed JSON Resume (as `/api/resumes/parse` returns it) → the client's
 * `ResumeData`. Tolerates the legacy PascalCase MetaResume keys.
 *
 * Item `id`s and `skillEvidence` pass through: the server mints a stable id
 * per section item precisely so skill evidence stays bound to it.
 */
import type { ResumeData } from "@/types/resume";

const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const withId = (item: any) => (typeof item?.id === "string" && item.id ? { id: item.id as string } : {});

export function toParsedResumeData(parsed: Record<string, unknown>): ResumeData {
  const basics = (parsed.basics ?? {}) as any;
  const location = basics.location ?? basics.Location ?? null;
  const skillEvidence = Array.isArray(parsed.skillEvidence)
    ? (parsed.skillEvidence as NonNullable<ResumeData["skillEvidence"]>)
    : undefined;

  const data: ResumeData = {
    basics: {
      name: basics.name ?? "",
      label: basics.label ?? "",
      image: basics.image ?? "",
      email: basics.email ?? "",
      phone: basics.phone ?? "",
      url: basics.url ?? "",
      summary: basics.summary ?? "",
      location: location
        ? {
          address: location.address ?? "",
          postalCode: location.postalCode ?? "",
          city: location.city ?? "",
          countryCode: location.countryCode ?? "",
          region: location.region ?? "",
        }
        : null,
    },
    work: list(parsed.work).map((w) => ({
      ...withId(w),
      name: w?.name ?? w?.Name ?? w?.company ?? w?.Company ?? "",
      position: w?.position ?? w?.Position ?? "",
      summary: w?.summary ?? w?.Summary ?? "",
      startDate: w?.startDate ?? w?.StartDate ?? "",
      endDate: w?.endDate ?? w?.EndDate ?? "",
      highlights: Array.isArray(w?.highlights ?? w?.Highlights) ? (w?.highlights ?? w?.Highlights) : [],
      url: w?.url ?? w?.Url ?? "",
    })),
    education: list(parsed.education).map((e) => ({
      ...withId(e),
      institution: e?.institution ?? e?.Institution ?? "",
      area: e?.area ?? e?.Area ?? "",
      studyType: e?.studyType ?? e?.StudyType ?? "",
      startDate: e?.startDate ?? e?.StartDate ?? "",
      endDate: e?.endDate ?? e?.EndDate ?? "",
      score: e?.score ?? e?.Score ?? "",
      courses: Array.isArray(e?.courses ?? e?.Courses) ? (e?.courses ?? e?.Courses) : null,
      url: e?.url ?? e?.Url ?? "",
    })),
    skills: list(parsed.skills).map((s) => ({
      ...withId(s),
      name: s?.name ?? s?.Name ?? "",
      level: s?.level ?? s?.Level ?? "",
      keywords: Array.isArray(s?.keywords ?? s?.Keywords) ? (s?.keywords ?? s?.Keywords) : [],
    })),
    volunteer: list(parsed.volunteer).map((v) => ({
      ...withId(v),
      organization: v?.organization ?? v?.Organization ?? "",
      position: v?.position ?? v?.Position ?? "",
      summary: v?.summary ?? v?.Summary ?? "",
      startDate: v?.startDate ?? v?.StartDate ?? "",
      endDate: v?.endDate ?? v?.EndDate ?? "",
      highlights: Array.isArray(v?.highlights ?? v?.Highlights) ? (v?.highlights ?? v?.Highlights) : null,
      url: v?.url ?? v?.Url ?? "",
    })),
    awards: list(parsed.awards).map((a) => ({
      ...withId(a),
      title: a?.title ?? a?.Title ?? "",
      date: a?.date ?? a?.Date ?? "",
      awarder: a?.awarder ?? a?.Awarder ?? "",
      summary: a?.summary ?? a?.Summary ?? "",
    })),
    certificates: list(parsed.certificates).map((cert) => ({
      ...withId(cert),
      name: cert?.name ?? cert?.Name ?? "",
      date: cert?.date ?? cert?.Date ?? "",
      issuer: cert?.issuer ?? cert?.Issuer ?? "",
      url: cert?.url ?? cert?.Url ?? "",
    })),
    publications: list(parsed.publications).map((p) => ({
      ...withId(p),
      name: p?.name ?? p?.Name ?? "",
      publisher: p?.publisher ?? p?.Publisher ?? "",
      releaseDate: p?.releaseDate ?? p?.ReleaseDate ?? "",
      url: p?.url ?? p?.Url ?? "",
      summary: p?.summary ?? p?.Summary ?? "",
    })),
    languages: list(parsed.languages),
    interests: list(parsed.interests),
    references: list(parsed.references),
    projects: list(parsed.projects),
    ...(skillEvidence ? { skillEvidence } : {}),
    meta: undefined,
  };
  return data;
}
