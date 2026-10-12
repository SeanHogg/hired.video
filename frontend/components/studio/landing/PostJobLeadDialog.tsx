/**
 * PostJobLeadDialog — where a SIGNED-OUT "Post a job" lands (#1915). Job
 * postings are for recruiters / employers, so a visitor without an account
 * can't open a job document; instead this keeps what the retired /post-a-job
 * page did: capture the lead (email + role + company, `post_a_job_landing`),
 * record `post_job_intent`, then continue to employer sign-up pre-filled.
 *
 * Self-contained: opens on `/studio?postJob=1` (JOB_POST_LEAD_PATH — the
 * studio's create seam and editor guard send signed-out job starts here) for
 * signed-out visitors only, and clears the param on close.
 */
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { captureLead } from "@/lib/services/marketing-leads-service";
import { JOB_POST_LEAD_PARAM, recordPostJobIntent } from "@/lib/studio/job-post-access";

/** The lead source tag the /outreach inbox already filters on. */
export const POST_JOB_LEAD_SOURCE = "post_a_job_landing";

export function employerSignupHref(lead: { email: string; jobTitle: string; company: string }): string {
  const params = new URLSearchParams({ role: "employer", email: lead.email, jobTitle: lead.jobTitle, company: lead.company });
  return `/signup?${params.toString()}`;
}

export default function PostJobLeadDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const open = params.get(JOB_POST_LEAD_PARAM) === "1" && !user && !isLoading;
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete(JOB_POST_LEAD_PARAM);
    setParams(next, { replace: true });
  };
  const canSubmit = !busy && !!jobTitle.trim() && !!company.trim() && email.includes("@");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    const lead = { email: email.trim(), jobTitle: jobTitle.trim(), company: company.trim() };
    try {
      await captureLead({
        email: lead.email,
        source: POST_JOB_LEAD_SOURCE,
        notes: `Job title: ${lead.jobTitle}, Company: ${lead.company}`,
      });
    } catch {
      // A failed capture never blocks the visitor — they still continue.
    }
    recordPostJobIntent("lead_capture", { job_title: lead.jobTitle, company: lead.company });
    setBusy(false);
    navigate(employerSignupHref(lead));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md p-4 sm:p-6">
        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("studio.jobPost.lead.title")}</DialogTitle>
            <DialogDescription>{t("studio.jobPost.lead.description")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="post-job-title">{t("studio.jobPost.lead.jobTitle")}</Label>
            <Input id="post-job-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} autoComplete="off" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="post-job-company">{t("studio.jobPost.lead.company")}</Label>
            <Input id="post-job-company" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="post-job-email">{t("studio.jobPost.lead.email")}</Label>
            <Input id="post-job-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={close}>
              {t("actions.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("studio.jobPost.lead.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
