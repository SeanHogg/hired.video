/**
 * "Apply with hired.video" embeddable button (routes/apply-button.ts):
 * click tracking with optional lead capture, and the job label lookup.
 * SQL lives in MarketingRepository / JobsRepository.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { MarketingRepository } from "../../repositories/marketingRepository.js";
import { JobsRepository } from "../../repositories/jobsRepository.js";

export interface ApplyButtonClick {
  email?: string;
  jobId?: string;
  jobTitle?: string;
  companyName?: string;
  source: string;
  referrerUrl?: string;
}

/** Capture the clicker as a marketing lead (when an email is given) and
 *  return the pre-filled signup URL. */
export async function trackApplyButtonClick(click: ApplyButtonClick) {
  const { email, jobId, jobTitle, companyName, source, referrerUrl } = click;
  if (email) {
    await new MarketingRepository(getDb()).captureMarketingLead({
      email,
      source,
      metadata: { jobId, jobTitle, companyName, referrerUrl },
    } as never);
  }
  const params = new URLSearchParams({ source: "apply-button" });
  if (jobId) params.set("jobId", jobId);
  if (email) params.set("email", email);
  return { signupUrl: `/signup?${params.toString()}`, jobId };
}

/** Minimal job metadata for the button label. */
export async function getApplyButtonJobMeta(jobId: string) {
  const [job] = await new JobsRepository(getDb()).findJobBriefsByIds([jobId]);
  if (!job) throw new DomainError(404, "NOT_FOUND", "Job not found");
  return { id: job.id, title: job.title, company: job.company };
}
