/**
 * resume-shape.ts — Shared converters between the lowercase JSON Resume
 * shape used by the API/metaResume envelope and the PascalCase ResumeData
 * shape the frontend UI components (ResumeViewer, ResumeBuilder) expect.
 *
 * Extracted so Upload, Merge, Consolidator, and any future ingress point
 * share one canonical mapper — avoids silent drift between call sites.
 */

import type { ResumeData } from "@/types/resume";

/** Empty PascalCase ResumeData — safe default when no data is available. */
export function getEmptyResumeData(): ResumeData {
  return {
    Basics: {
      Name: "",
      Label: "",
      Image: "",
      Email: "",
      Phone: "",
      Url: "",
      Summary: "",
      Location: null,
    },
    Work: [],
    Volunteer: [],
    Education: [],
    Awards: [],
    Certificates: [],
    Publications: [],
    Skills: [],
    Languages: [],
    Interests: [],
    References: [],
    Projects: [],
  };
}

/**
 * Convert a lowercase JSON Resume blob (either the `metaResume` envelope
 * returned by the API or raw merged content from /merge/preview) into
 * the PascalCase `ResumeData` shape `ResumeViewer` and `ResumeBuilder`
 * expect.
 *
 * Accepts plain content (`{basics, work, ...}`) or the
 * metaResume-wrapped equivalent. Passes through empty/missing sections
 * as empty arrays.
 */
export function mapContentToResumeData(content: unknown): ResumeData {
  if (!content || typeof content !== "object") return getEmptyResumeData();
  const c = content as Record<string, any>;

  const basics = (c.basics ?? c.Basics ?? {}) as Record<string, any>;
  const location = basics.location ?? basics.Location;

  return {
    Basics: {
      Name: str(basics.name ?? basics.Name),
      Label: str(basics.label ?? basics.Label),
      Image: str(basics.image ?? basics.Image),
      Email: str(basics.email ?? basics.Email),
      Phone: str(basics.phone ?? basics.Phone),
      Url: str(basics.url ?? basics.Url),
      Summary: str(basics.summary ?? basics.Summary),
      Location: location
        ? {
            Address: str(location.address ?? location.Address),
            PostalCode: str(location.postalCode ?? location.PostalCode),
            City: str(location.city ?? location.City),
            CountryCode: str(location.countryCode ?? location.CountryCode),
            Region: str(location.region ?? location.Region),
          }
        : null,
    },
    Work: arr(c.work ?? c.Work).map((w: any) => ({
      Name: str(w.name ?? w.Name),
      Position: str(w.position ?? w.Position),
      Summary: str(w.summary ?? w.Summary),
      StartDate: str(w.startDate ?? w.StartDate),
      EndDate: str(w.endDate ?? w.EndDate),
      Highlights: strArr(w.highlights ?? w.Highlights),
      Url: str(w.url ?? w.Url),
    })),
    Volunteer: arr(c.volunteer ?? c.Volunteer).map((v: any) => ({
      Organization: str(v.organization ?? v.Organization),
      Position: str(v.position ?? v.Position),
      Summary: str(v.summary ?? v.Summary),
      StartDate: str(v.startDate ?? v.StartDate),
      EndDate: str(v.endDate ?? v.EndDate),
      Highlights: strArr(v.highlights ?? v.Highlights),
      Url: str(v.url ?? v.Url),
    })),
    Education: arr(c.education ?? c.Education).map((e: any) => ({
      Institution: str(e.institution ?? e.Institution),
      Area: str(e.area ?? e.Area),
      StudyType: str(e.studyType ?? e.StudyType),
      StartDate: str(e.startDate ?? e.StartDate),
      EndDate: str(e.endDate ?? e.EndDate),
      Score: str(e.score ?? e.Score),
      Courses: strArr(e.courses ?? e.Courses),
      Url: str(e.url ?? e.Url),
    })),
    Awards: arr(c.awards ?? c.Awards).map((a: any) => ({
      Title: str(a.title ?? a.Title),
      Date: str(a.date ?? a.Date),
      Awarder: str(a.awarder ?? a.Awarder),
      Summary: str(a.summary ?? a.Summary),
    })),
    Certificates: arr(c.certificates ?? c.Certificates).map((cert: any) => ({
      Name: str(cert.name ?? cert.Name),
      Date: str(cert.date ?? cert.Date),
      Issuer: str(cert.issuer ?? cert.Issuer),
      Url: str(cert.url ?? cert.Url),
    })),
    Publications: arr(c.publications ?? c.Publications).map((p: any) => ({
      Name: str(p.name ?? p.Name),
      Publisher: str(p.publisher ?? p.Publisher),
      ReleaseDate: str(p.releaseDate ?? p.ReleaseDate),
      Url: str(p.url ?? p.Url),
      Summary: str(p.summary ?? p.Summary),
    })),
    Skills: arr(c.skills ?? c.Skills).map((s: any) => ({
      Name: str(s.name ?? s.Name),
      Level: str(s.level ?? s.Level),
      Keywords: strArr(s.keywords ?? s.Keywords),
    })),
    Languages: arr(c.languages ?? c.Languages).map((l: any) => ({
      Language: str(l.language ?? l.Language),
      Fluency: str(l.fluency ?? l.Fluency),
    })),
    Interests: arr(c.interests ?? c.Interests).map((i: any) => ({
      Name: str(i.name ?? i.Name),
      Keywords: strArr(i.keywords ?? i.Keywords),
    })),
    References: arr(c.references ?? c.References).map((r: any) => ({
      Name: str(r.name ?? r.Name),
      Reference: str(r.reference ?? r.Reference),
    })),
    Projects: arr(c.projects ?? c.Projects).map((p: any) => ({
      Name: str(p.name ?? p.Name),
      Description: str(p.description ?? p.Description),
      Highlights: strArr(p.highlights ?? p.Highlights),
      Keywords: strArr(p.keywords ?? p.Keywords),
      StartDate: str(p.startDate ?? p.StartDate),
      EndDate: str(p.endDate ?? p.EndDate),
      Url: str(p.url ?? p.Url),
      Roles: strArr(p.roles ?? p.Roles),
      Entity: str(p.entity ?? p.Entity),
      Type: str(p.type ?? p.Type),
    })),
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function arr(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}
