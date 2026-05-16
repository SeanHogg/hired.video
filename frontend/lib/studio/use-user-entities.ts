/**
 * useUserEntities — single source of truth for "what entities does the
 * current user own?" used by every studio surface that needs to browse
 * the caller's resumes / jobs / companies / profile. Both
 * `SubjectPickerDialog` (link a subject to a project) and
 * `ContentLinkPicker` (fill a URL field with an entity link) consume
 * this hook so their availability + filtering logic can't drift.
 *
 * Mirrors v1's lazy fetch behaviour — entries arrive as `null` until
 * the first fetch resolves, then become arrays (possibly empty). The
 * `enabled` flag exists so consumers can defer the fetch until their
 * dialog actually opens (no point spinning up four requests on mount
 * just to feed a hidden button).
 *
 * The URL helper `entityUrl(kind, id)` lives here too so every consumer
 * — current and future — encodes the public-page route in ONE place.
 * Routes are owned by [App.tsx](frontend/App.tsx)'s router config; if
 * they move, fix them here and every link surface follows automatically.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { resumeService } from "@/lib/services/resume-service";
import { companyService } from "@/lib/services/company-service";
import { jobService } from "@/lib/services/job-service";
import type { StudioSubjectKind } from "@shared/studio-subject";

export interface EntityRow {
  id: string;
  label: string;
  hint?: string;
}

export interface UserEntities {
  resumes: EntityRow[] | null;
  companies: EntityRow[] | null;
  jobs: EntityRow[] | null;
  /** The caller's own profile — synthesised from `useAuth()`, no
   *  network fetch. `null` only when unauthenticated. */
  profile: EntityRow | null;
}

const EMPTY: UserEntities = {
  resumes: null,
  companies: null,
  jobs: null,
  profile: null,
};

export function useUserEntities(enabled: boolean): UserEntities {
  const { user } = useAuth();
  const [entities, setEntities] = useState<UserEntities>(EMPTY);

  const profile = useMemo<EntityRow | null>(
    () =>
      user
        ? {
            id: user.id,
            label: user.name || user.email || "Your profile",
            hint: "Public-facing profile page",
          }
        : null,
    [user],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void Promise.all([
      resumeService.getUserResumes().catch(() => []),
      companyService.getMyCompanies().catch(() => []),
      jobService.getMyPostedJobs().catch(() => []),
    ]).then(([resumeRows, companyRows, jobRows]) => {
      if (cancelled) return;
      setEntities({
        profile,
        resumes: resumeRows
          .map<EntityRow>((r) => ({
            id: r.id ?? "",
            label: r.title?.trim() || "Untitled resume",
            hint: r.headline ?? undefined,
          }))
          .filter((r) => r.id !== ""),
        companies: companyRows.map<EntityRow>((c) => ({
          id: c.id,
          label: c.name,
          hint: c.industry ?? undefined,
        })),
        jobs: jobRows
          .map<EntityRow>((j) => ({
            id: j.id ?? "",
            label: j.title?.trim() || "Untitled job",
            hint: j.companyName ?? j.location ?? undefined,
          }))
          .filter((j) => j.id !== ""),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, profile]);

  // Keep `profile` in sync even when the network fetch hasn't run yet
  // — the caller may render the Profile tab before opening the dialog.
  return useMemo<UserEntities>(
    () => ({
      ...entities,
      profile,
    }),
    [entities, profile],
  );
}

/** Public-page URL for a (kind, id) pair. Single seam — every URL-
 *  emitting surface in the studio routes through here so route changes
 *  in [App.tsx](frontend/App.tsx) propagate without grep-and-replace. */
export function entityUrl(kind: StudioSubjectKind, id: string): string {
  switch (kind) {
    case "resume":
      return `/resume/${id}`;
    case "job":
      return `/jobs/${id}`;
    case "company":
      return `/companies/${id}`;
    case "profile":
      return `/people/${id}`;
    case "skills_demo":
    case "creator_credit":
      // No standalone public page yet — surfaces that try to deep-link
      // to these kinds get the studio project URL as the best fallback.
      return `/studio/${id}`;
  }
}
