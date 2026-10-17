/**
 * /api/recruiter — recruiter CRM composition root. Each sub-router owns a
 * cohesive slice and registers its full paths, so every URL is unchanged:
 *
 *   recruiter/talent-pool.ts            talent pool (+export, check), interactions, bulk tags/status/delete
 *   recruiter/placements.ts             placements (+bulk, splits, commission, guarantee, summary/commission)
 *   recruiter/placement-notifications.ts placement stage-event subscriptions (#230)
 *   recruiter/submissions.ts            submissions (+packet, status, withdraw)
 *   recruiter/agent.ts                  AI agent: source, runs, intake, follow-ups
 *   recruiter/profile-extraction.ts     extract-profile, extract-profiles/batch (LLM)
 *   recruiter/match.ts                  match score-candidates, score-jobs, scores
 *   recruiter/lists.ts                  recruiter lists / call queues (+members)
 *   recruiter/sequences.ts              outreach sequences (+enroll, enrollments)
 *
 * Handlers are thin adapters over services/recruiter/* use cases backed by
 * repositories/{talentPool,placements,recruiterSubmissions,recruiterAgent,
 * extractedProfiles,recruiterMatchScores,recruiterLists,outreachSequences}Repository.
 * The submissions pipeline board lives at GET /api/pipeline/submissions.
 *
 * NOTE: /api/recruit (routes/candidates.ts — agency candidate résumé
 * variants, redaction, shares) is a distinct feature from this CRM.
 *
 * Mount order mirrors the original single-file registration order; static
 * segments that must beat a param (e.g. /talent-pool/export, /placements/
 * summary/commission, /submissions/packet) sit before it in the same file.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { talentPoolRoutes } from "./recruiter/talent-pool.js";
import { placementRoutes } from "./recruiter/placements.js";
import { placementNotificationRoutes } from "./recruiter/placement-notifications.js";
import { submissionRoutes } from "./recruiter/submissions.js";
import { agentRoutes } from "./recruiter/agent.js";
import { profileExtractionRoutes } from "./recruiter/profile-extraction.js";
import { matchRoutes } from "./recruiter/match.js";
import { recruiterListRoutes } from "./recruiter/lists.js";
import { sequenceRoutes } from "./recruiter/sequences.js";

export const recruiterRoutes = new Hono<AppEnv>();

recruiterRoutes.route("/", talentPoolRoutes);
recruiterRoutes.route("/", placementRoutes);
recruiterRoutes.route("/", placementNotificationRoutes);
recruiterRoutes.route("/", submissionRoutes);
recruiterRoutes.route("/", agentRoutes);
recruiterRoutes.route("/", profileExtractionRoutes);
recruiterRoutes.route("/", matchRoutes);
recruiterRoutes.route("/", recruiterListRoutes);
recruiterRoutes.route("/", sequenceRoutes);
