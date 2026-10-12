/**
 * Who may start a job POSTING in the studio (#1915) — the gate the retired
 * JobCreatePage enforced (recruiters / employers only), now applied at the
 * studio's one create seam (`useCreateStudioDraft`), the `/studio/new`
 * editor entry, and the coach's job-draft bridge. The role rule itself is the
 * shared `canPostJobsRole` (via `usePermissions().canPostJobs`), the same rule
 * `POST /api/jobs` enforces — no second role list here.
 *
 *   allowed  → start the job document (and record `post_job_intent`)
 *   sign-in  → a signed-out visitor goes to the lead capture
 *              (`JOB_POST_LEAD_PATH`, PostJobLeadDialog on /studio)
 *   denied   → a signed-in non-poster gets a toast; nothing is created
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { gtmEvent } from "@/lib/gtm";
import { DOCUMENT_AUTHORING } from "@/lib/studio/studio-authoring";

export type JobPostAccess = "allowed" | "sign-in" | "denied";

/** Pure decision. */
export function jobPostAccess(signedIn: boolean, canPostJobs: boolean): JobPostAccess {
  if (!signedIn) return "sign-in";
  return canPostJobs ? "allowed" : "denied";
}

/** The studio landing opens the job-post lead capture on this param. */
export const JOB_POST_LEAD_PARAM = "postJob";
export const JOB_POST_LEAD_PATH = `/studio?${JOB_POST_LEAD_PARAM}=1`;

/** The input template a new job posting starts from. */
export const JOB_POST_TEMPLATE = DOCUMENT_AUTHORING.job.createTemplate;

/** Does this create input start a NEW job posting? (Opening an existing job
 *  is the owner's edit — the API checks ownership.) */
export function startsJobPosting(
  input:
    | { kind: "template"; templateId: string }
    | { kind: "document"; documentState: { entityKind: string; entityId: string | null } }
    | { kind: string },
): boolean {
  if (input.kind === "template") return (input as { templateId: string }).templateId === JOB_POST_TEMPLATE;
  if (input.kind === "document") {
    const s = (input as { documentState: { entityKind: string; entityId: string | null } }).documentState;
    return s.entityKind === "job" && !s.entityId;
  }
  return false;
}

/** The viewer's access, from auth + the role permissions (impersonation and
 *  persona preview respected). */
export function useJobPostAccess(): JobPostAccess {
  const { user } = useAuth();
  const { canPostJobs } = usePermissions();
  return jobPostAccess(!!user, canPostJobs);
}

/** `post_job_intent` — kept from the retired PostAJob page, now fired when a
 *  job posting actually starts in the studio. */
export function recordPostJobIntent(source: string, extra?: Record<string, unknown>): void {
  gtmEvent("post_job_intent", { source, ...extra });
}

/**
 * Editor-side backstop: while an UNSAVED job posting is open (`active`), a
 * viewer who may not post is sent away — the same outcome as the create seam
 * (lead capture when signed out, a toast + /studio otherwise). Covers every
 * way into the editor (`/studio/new?contentTemplate=job_doc`, the anon editor,
 * a forwarded URL), not only the seam. Waits for auth to settle.
 */
export function useJobPostGuard(active: boolean): void {
  const { isLoading } = useAuth();
  const access = useJobPostAccess();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  useEffect(() => {
    if (!active || isLoading || access === "allowed") return;
    if (access === "sign-in") {
      navigate(JOB_POST_LEAD_PATH, { replace: true });
      return;
    }
    toast({ title: t("studio.jobPost.deniedTitle"), description: t("studio.jobPost.deniedBody"), variant: "destructive" });
    navigate("/studio", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isLoading, access]);
}
