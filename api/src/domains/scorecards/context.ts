/**
 * Execution context handed to every scorecards use-case function. `R` is
 * the narrow repository role(s) the use case needs; the `ScorecardsService`
 * facade passes its full `IScorecardsRepository`, which satisfies all roles.
 */

import type { ScorecardHmVisibility } from "./hmVisibility.js";

/** Company-scope checks (owner or active member). */
export interface CompanyAccessCtx {
  canAccessCompany: (userId: string, companyId: string) => Promise<boolean>;
  getCompanyIdsForUser: (userId: string) => Promise<string[]>;
}

export interface ScorecardsCtx<R> extends CompanyAccessCtx {
  repo: R;
  /** #241 — effective HM scorecard-visibility for a (company, job). */
  resolveJobHmVisibility?: (companyId: string, jobId: string | null) => Promise<ScorecardHmVisibility>;
  now: () => Date;
}
