/**
 * HM scorecard-visibility config use cases (#241) — read/write the per-job
 * override and the company-wide default. Access checks stay in the route
 * (requireJobOwner / userCanAccessCompany); read gating lives in
 * ScorecardsService.
 */
import { getDb } from "../../db/index.js";
import {
  findJobHmVisibility,
  findCompanyHmVisibilityDefault,
  setJobHmVisibility,
  setCompanyHmVisibilityDefault,
} from "../../repositories/scorecardHmVisibilityRepository.js";
import {
  resolveHmVisibility,
  parseHmVisibility,
  type ScorecardHmVisibility,
} from "../../domains/scorecards/hmVisibility.js";

/** The job's override + the inherited company default + the effective mode. */
export async function getJobHmVisibilityConfig(jobId: string) {
  const db = getDb();
  const job = await findJobHmVisibility(db, jobId);
  const companyDefault = job?.companyId ? await findCompanyHmVisibilityDefault(db, job.companyId) : null;
  const override = job?.override ?? null;
  return {
    override,
    companyDefault: parseHmVisibility(companyDefault),
    effective: resolveHmVisibility(override, companyDefault),
  };
}

/** Set (or clear with null) the per-job override. */
export function setJobHmVisibilityOverride(jobId: string, mode: ScorecardHmVisibility | null): Promise<void> {
  return setJobHmVisibility(getDb(), jobId, mode, new Date());
}

/** The company-wide default, parsed. */
export async function getCompanyHmVisibilityDefault(companyId: string): Promise<ScorecardHmVisibility> {
  return parseHmVisibility(await findCompanyHmVisibilityDefault(getDb(), companyId));
}

export function setCompanyHmVisibility(companyId: string, mode: ScorecardHmVisibility): Promise<void> {
  return setCompanyHmVisibilityDefault(getDb(), companyId, mode);
}
