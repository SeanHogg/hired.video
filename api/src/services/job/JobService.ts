/**
 * JobService — thin facade over the cohesive job modules. Route files
 * (`import * as jobService`) consume this surface; everything else imports
 * the owning module directly:
 *
 *   job-service-deps.ts         JobServiceDeps + resolveDeps
 *   job-entity.ts               JobEntity + rowToJob serializer
 *   job-seed-company.ts         HIRED_VIDEO_SEED_COMPANY + community company id
 *   job-dedup.ts                content hash, fuzzy candidates, AI duplicate check
 *   job-queries.ts              public / per-user / by-id job reads
 *   job-write.ts                create / tracked create / update / delete
 *   job-page-parse.ts           heuristic HTML → ParsedJob
 *   job-classify.ts             LLM classification + enrichment
 *   job-description-sections.ts description section splitter
 *   job-apply-url.ts            apply-URL derivation
 *   job-refresh-backfill.ts     /refresh backfill merge policy
 *   job-saved.ts                saved jobs + tracker pipeline status
 *   job-applications.ts         applications
 *   job-alerts.ts               job alerts CRUD
 */

// Shared scraping primitives under their historical names.
export { htmlToMarkdown, findApplyLinkInHtml, normalizeJobUrl } from "../../../../shared/scraping/index.js";

export type { JobServiceDeps } from "./job-service-deps.js";
export type { JobEntity } from "./job-entity.js";
export { HIRED_VIDEO_SEED_COMPANY, getHiredVideoCommunityCompanyId } from "./job-seed-company.js";
export {
  computeContentHash,
  findFuzzyCandidates,
  aiDuplicateCheck,
  deduplicateJob,
  type DuplicateCheckResult,
  type DedupResult,
} from "./job-dedup.js";
export { getPublicJobs, getUserJobs, getJobById, getJobBySlug, type JobQuery } from "./job-queries.js";
export {
  extractDetailsPatch,
  buildJobColumnPatch,
  createJob,
  createTrackedJob,
  updateJob,
  deleteJob,
} from "./job-write.js";
export { parseJobFromPage, type ParsedJob } from "./job-page-parse.js";
export {
  enrichParsedWithLLM,
  extractAndClassifyJob,
  type JobClassification,
  type JobExtractionResult,
} from "./job-classify.js";
export { splitDescriptionSections } from "./job-description-sections.js";
export { deriveApplyUrl } from "./job-apply-url.js";
export { computeRefreshBackfill } from "./job-refresh-backfill.js";
export { saveJob, unsaveJob, getSavedJobs, updateSavedJobStatus } from "./job-saved.js";
export { applyToJob, getApplications } from "./job-applications.js";
export { getJobAlerts, createJobAlert, updateJobAlert, toggleJobAlert, deleteJobAlert } from "./job-alerts.js";
