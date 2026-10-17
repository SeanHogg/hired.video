/**
 * Composition root of the candidate-consent domain: binds its ports to the
 * Drizzle repository, the studio write rule, the email adapter and the one
 * project-visibility writer. Routes and services take the wired functions
 * from here; domains/candidate-consent/* never imports a service or a DB
 * handle (tests hand the use cases fakes instead).
 */
import { getDb } from "../../db/index.js";
import {
  CandidateVideoConsentRepository,
  type ICandidateVideoConsentRepository,
} from "../../repositories/candidateVideoConsentRepository.js";
import { canActFor } from "../studio/workspace.js";
import { forceProjectUnlisted } from "../studio/project-visibility.js";
import { sendCandidateVideoConsentEmail } from "../adapters/email/senders/recruiting.js";
import type { CandidateConsentDeps } from "../../domains/candidate-consent/ports.js";
import { assertCandidateConsent, enforceCandidateConsent } from "../../domains/candidate-consent/consent-gate.js";

let cachedRepo: ICandidateVideoConsentRepository | null = null;

/** One repository per isolate (buildRepos rebuilds every repo per call). */
export function defaultConsentRepo(): ICandidateVideoConsentRepository {
  cachedRepo ??= new CandidateVideoConsentRepository(getDb());
  return cachedRepo;
}

const forceUnlisted = (projectId: string): Promise<void> => forceProjectUnlisted(projectId);

export function buildCandidateConsentDeps(): CandidateConsentDeps {
  return {
    repo: defaultConsentRepo(),
    canWrite: (actor, ownerUserId, ownerCompanyId) => canActFor(actor, ownerUserId, ownerCompanyId),
    sendEmail: sendCandidateVideoConsentEmail,
    forceUnlisted,
    now: () => new Date(),
  };
}

/** The publish gate bound to the live repository. */
export function assertCandidateVideoConsent(projectId: string): Promise<void> {
  return assertCandidateConsent(projectId, defaultConsentRepo());
}

/** Force the project unlisted when the gate no longer passes (subject just
 *  linked, re-rendered, edited while public). True when it forced. */
export function enforceCandidateVideoConsent(projectId: string): Promise<boolean> {
  return enforceCandidateConsent(projectId, { repo: defaultConsentRepo(), forceUnlisted });
}
