/**
 * useSubjectSeed — fetch the flattened text + display name for a Studio
 * subject (resume / profile / job / company / skills_demo / creator_credit)
 * so the `?subject=` deep-link from an entity card can pre-seed the V2
 * canvas with AI-generated content (#650).
 *
 * Self-gating: returns nulls until `subject` is non-null, so the consumer
 * banner can render straight from the hook's return without checking
 * loading flags before fetching.
 *
 * Per-kind text derivation:
 *   - resume   → `resumeService.getResumeSummary`
 *   - profile  → `userService.getUserById` → name + headline + bio
 *   - job      → `jobService.getJobById` → title + description
 *   - company  → `companyService.getCompanyById` → name + tagline + description
 *   - skills_demo / creator_credit → no seed path (returns null)
 */
import { useEffect, useState } from "react";
import {
  STUDIO_SUBJECT_LABEL,
  type StudioSubject,
} from "@shared/studio-subject";
import { resumeService } from "@/lib/services/resume-service";
import { userService } from "@/lib/services/user-service";
import { jobService } from "@/lib/services/job-service";
import { companyService } from "@/lib/services/company-service";

interface Result {
  displayName: string | null;
  summary: string | null;
  loading: boolean;
  /** False when this subject kind has no AI-seed path (skills_demo /
   *  creator_credit). The banner uses it to hide the "Generate" CTA. */
  canSeed: boolean;
}

export function useSubjectSeed(subject: StudioSubject | null): Result {
  const [summary, setSummary] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!subject) {
      setSummary(null);
      setDisplayName(null);
      return;
    }
    let cancelled = false;
    const kindLabel = STUDIO_SUBJECT_LABEL[subject.kind];
    setLoading(true);
    (async () => {
      try {
        const text = await fetchSubjectSummary(subject);
        if (cancelled) return;
        setSummary(text);
        setDisplayName(kindLabel);
      } catch {
        if (cancelled) return;
        setSummary(null);
        setDisplayName(kindLabel);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subject?.kind, subject?.id]);

  const canSeed = !!subject && !!summary && SEEDABLE_KINDS.has(subject.kind);

  return { displayName, summary, loading, canSeed };
}

const SEEDABLE_KINDS = new Set<StudioSubject["kind"]>([
  "resume",
  "profile",
  "job",
  "company",
]);

async function fetchSubjectSummary(subject: StudioSubject): Promise<string | null> {
  switch (subject.kind) {
    case "resume":
      return resumeService.getResumeSummary(subject.id);
    case "profile": {
      const user = await userService.getUserById(subject.id);
      const role = user.currentRole && user.currentCompany
        ? `${user.currentRole} at ${user.currentCompany}`
        : user.currentRole ?? null;
      const parts = [
        joinName(user.firstName, user.lastName),
        role,
        user.bio ?? null,
      ].filter((p): p is string => typeof p === "string" && p.trim().length > 0);
      return parts.length > 0 ? parts.join(". ") : null;
    }
    case "job": {
      const job = await jobService.getJobById(subject.id);
      if (!job || typeof job !== "object") return null;
      const j = job as { title?: string; description?: string };
      const parts = [j.title, j.description].filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0,
      );
      return parts.length > 0 ? parts.join(". ") : null;
    }
    case "company": {
      const company = await companyService.getCompanyById(subject.id);
      const parts = [company.name, company.tagline ?? null, company.description ?? null].filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0,
      );
      return parts.length > 0 ? parts.join(". ") : null;
    }
    default:
      // skills_demo / creator_credit — no seed path.
      return null;
  }
}

function joinName(first: string | null | undefined, last: string | null | undefined): string | null {
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined.length > 0 ? joined : null;
}
