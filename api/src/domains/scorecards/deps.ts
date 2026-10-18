/**
 * ScorecardsService dependency surface + production wiring (real DB repo,
 * company-scope helpers, HM-visibility config reader).
 */

import { getDb } from "../../db/index.js";
import {
  findCompanyHmVisibilityDefault,
  findJobHmVisibility,
} from "../../repositories/scorecardHmVisibilityRepository.js";
import {
  ScorecardsRepository,
  type IScorecardsRepository,
} from "../../repositories/scorecardsRepository.js";
import {
  resolveCompanyScope,
  userCanAccessCompany,
} from "../../services/company/scope.js";
import {
  resolveHmVisibility,
  type ScorecardHmVisibility,
} from "./hmVisibility.js";

/** Lightweight DI surface — keeps tests off real DB / scope helpers. */
export interface ScorecardsServiceDeps {
  repo: IScorecardsRepository;
  canAccessCompany: (userId: string, companyId: string) => Promise<boolean>;
  getCompanyIdsForUser: (userId: string) => Promise<string[]>;
  /** #241 — effective HM scorecard-visibility for a (company, job). Injected
   *  so tests stay off the DB; the default impl reads the config (uncached, below). */
  resolveJobHmVisibility?: (companyId: string, jobId: string | null) => Promise<ScorecardHmVisibility>;
  now?: () => Date;
}

// NOT cached: the config is two PK-indexed lookups read at most once per
// panel view (listSubmissions), and a read-through cache here would need
// cross-job invalidation whenever a company changes its default — not worth
// it for a rarely-read, tiny value. Direct reads keep correctness simple.
async function defaultResolveJobHmVisibility(
  companyId: string,
  jobId: string | null,
): Promise<ScorecardHmVisibility> {
  const db = getDb();
  const [companyDefault, job] = await Promise.all([
    findCompanyHmVisibilityDefault(db, companyId),
    jobId ? findJobHmVisibility(db, jobId) : Promise.resolve(null),
  ]);
  return resolveHmVisibility(job?.override ?? null, companyDefault);
}

export function defaultScorecardsServiceDeps(): ScorecardsServiceDeps {
  return {
    repo: new ScorecardsRepository(getDb()),
    canAccessCompany: userCanAccessCompany,
    getCompanyIdsForUser: async (userId: string) =>
      (await resolveCompanyScope(userId)).companyIds,
    resolveJobHmVisibility: defaultResolveJobHmVisibility,
    now: () => new Date(),
  };
}
