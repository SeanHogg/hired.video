/**
 * LMS Connector adapters — gap #200.
 *
 * Each provider implements a single contract so the connector picker UI
 * + the publish job stay generic. Adding a new provider = one new file
 * + the export below; the existing courses publish flow picks it up.
 *
 * SCORM export (also #200) is the universal v1 path — every provider in
 * the list below accepts a SCORM 1.2 or 2004 package, so the publish flow
 * builds an export package once and pushes it through the chosen
 * connector's upload endpoint. Deeper per-provider integrations (native
 * course objects, social learning, manager assignment) layer on top of
 * this baseline.
 *
 * Why a registry, not a switch: the courses route already imports a
 * `connectorFor(provider)` factory; adding the next provider means a new
 * file and one entry here. The publish job, OAuth callback, and revoke
 * paths stay untouched.
 */

import type { LmsProvider } from "../../db/schema/courses.js";
import { CornerstoneAdapter } from "./cornerstone.js";
import { WorkdayLearningAdapter } from "./workday-learning.js";
import { DoceboAdapter } from "./docebo.js";
import { TalentLmsAdapter } from "./talentlms.js";
import { SuccessFactorsAdapter } from "./successfactors.js";

export interface LmsPublishInput {
  /** Course title — required by every LMS. */
  title: string;
  /** Optional summary / description. */
  description?: string;
  /** Public URL to the SCORM 1.2 / 2004 zip in our R2 bucket. The LMS
   *  pulls this URL with the OAuth bearer it was given at connect time
   *  (most LMSes support presigned URLs; the courses publish flow signs
   *  one valid for 15 minutes). */
  scormPackageUrl: string;
  /** Course slug — used by the LMS as a stable external id for the
   *  `lms_course_publishes.external_id` round-trip. */
  externalId: string;
  /** Optional tags / category for catalog filtering inside the LMS. */
  tags?: string[];
  category?: string;
}

export interface LmsPublishResult {
  /** The id the LMS assigned. Stored on lms_course_publishes.external_id
   *  so a follow-up republish hits update, not create. */
  remoteId: string;
  /** URL inside the LMS that learners launch the course from. Surfaced
   *  to the course owner as a verification link. */
  launchUrl?: string;
}

export interface LmsConnectorAdapter {
  provider: LmsProvider;
  /** Publish (or republish) a course into the LMS. Resolves with the
   *  remote id; throws on any error so the publish row records
   *  `last_error`. The adapter is responsible for distinguishing
   *  create-vs-update internally — the publish flow only needs to know
   *  it succeeded. */
  publishCourse(
    args: LmsPublishInput,
    auth: LmsAuth,
  ): Promise<LmsPublishResult>;
  /** Refresh status — some LMSes accept the package async and finalise
   *  on a poll cycle. Resolves with the latest status string and an
   *  optional learner-facing launch URL. */
  checkStatus(remoteId: string, auth: LmsAuth): Promise<{ status: string; launchUrl?: string }>;
  /** Pull the course back from the LMS catalog. Called when the course
   *  is unpublished or the connector is revoked. */
  revokeCourse(remoteId: string, auth: LmsAuth): Promise<void>;
}

export interface LmsAuth {
  accessToken: string;
  /** Most enterprise LMSes are per-tenant — the baseUrl is the tenant's
   *  API root (e.g. `https://acme.cornerstoneondemand.com/`). */
  baseUrl: string;
  /** Pass-through bag for adapter-specific fields the connector row
   *  stashed in `metadata` (Cornerstone needs a corpName, Workday needs
   *  a tenant alias, etc.). */
  metadata: Record<string, unknown>;
}

const REGISTRY: Record<LmsProvider, LmsConnectorAdapter> = {
  cornerstone: new CornerstoneAdapter(),
  workday_learning: new WorkdayLearningAdapter(),
  docebo: new DoceboAdapter(),
  talentlms: new TalentLmsAdapter(),
  successfactors: new SuccessFactorsAdapter(),
};

export function connectorFor(provider: LmsProvider): LmsConnectorAdapter {
  const adapter = REGISTRY[provider];
  if (!adapter) throw new Error(`No adapter for provider: ${provider}`);
  return adapter;
}
