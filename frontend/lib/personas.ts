/**
 * #104 — Persona label set. Lets the same backend serve recruiting
 * vs B2B-sales label flavours: "Talent Pool" becomes "Prospect
 * Pipeline", "Submission Status" becomes "Deal Stages", "Job
 * Postings" becomes "Target Accounts". Feature-flagged via the
 * `persona` column on `users`.
 *
 * Consumers read the active persona via `useActivePersona()` (returns
 * "recruiting" by default) + `personaLabel(key)`. Adding a new label
 * is a one-row addition in `LABEL_MAP` — no UI churn elsewhere.
 */

import { useAuth } from "@/lib/auth";

export type PersonaId = "recruiting" | "sales";

export type PersonaLabelKey =
  | "talentPool"
  | "submissionStatus"
  | "jobPostings"
  | "candidates"
  | "applications"
  | "pipeline"
  | "interviews"
  | "placements";

const LABEL_MAP: Record<PersonaLabelKey, Record<PersonaId, string>> = {
  talentPool: { recruiting: "Talent Pool", sales: "Prospect Pipeline" },
  submissionStatus: { recruiting: "Submission Status", sales: "Deal Stages" },
  jobPostings: { recruiting: "Job Postings", sales: "Target Accounts" },
  candidates: { recruiting: "Candidates", sales: "Prospects" },
  applications: { recruiting: "Applications", sales: "Engagements" },
  pipeline: { recruiting: "Candidate Pipeline", sales: "Sales Pipeline" },
  interviews: { recruiting: "Interviews", sales: "Discovery Calls" },
  placements: { recruiting: "Placements", sales: "Closed Deals" },
};

export function personaLabel(key: PersonaLabelKey, persona: PersonaId): string {
  return LABEL_MAP[key][persona];
}

export function useActivePersona(): PersonaId {
  const auth = useAuth() as unknown as { user?: { persona?: PersonaId } };
  return auth.user?.persona === "sales" ? "sales" : "recruiting";
}

/** Resolve a label string by key against the active persona. Use this
 *  in JSX (`<h2>{useLabel("talentPool")}</h2>`) so the consumer doesn't
 *  have to thread the persona id through every call site. */
export function useLabel(key: PersonaLabelKey): string {
  return personaLabel(key, useActivePersona());
}
