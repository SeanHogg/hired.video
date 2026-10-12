/**
 * /api/scorecards/* — thin composition root.
 *
 * Mounts the per-resource sub-routers (templates, attributes, kits,
 * stages, submissions, debrief, decisions). Each sub-router is a thin
 * HTTP adapter that parses input via Zod and delegates to
 * ScorecardsService.
 *
 * Service is constructed per-request via `defaultScorecardsServiceDeps`
 * so the DB handle is fresh and tests can swap deps.
 */

import { Hono } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import {
  ScorecardsService,
  defaultScorecardsServiceDeps,
} from "../domains/scorecards/scorecardsService.js";
import { templateRoutes, attributeRoutes } from "./scorecards/templates.js";
import { kitRoutes, stageRoutes } from "./scorecards/kits.js";
import { submissionRoutes, debriefRoutes } from "./scorecards/submissions.js";
import { decisionRoutes } from "./scorecards/decisions.js";
import { competencyRoutes } from "./scorecards/competencies.js";
import { reliabilityRoutes, assignmentRoutes } from "./scorecards/sla.js";
import { biasRoutes } from "./scorecards/bias.js";
import { visibilityRoutes } from "./scorecards/visibility.js";
import {
  stageQuestionRoutes,
  takeHomeRoutes,
  takeHomePublicRoutes as buildTakeHomePublicRoutes,
  coverageRoutes,
} from "./scorecards/takehome.js";

const buildService = () => new ScorecardsService(defaultScorecardsServiceDeps());

export const scorecardRoutes = new Hono<AppEnv>();

scorecardRoutes.route("/templates", templateRoutes(buildService));
scorecardRoutes.route("/attributes", attributeRoutes(buildService));
scorecardRoutes.route("/kits", kitRoutes(buildService));
scorecardRoutes.route("/stages", stageRoutes(buildService));
scorecardRoutes.route("/submissions", submissionRoutes(buildService));
scorecardRoutes.route("/debrief", debriefRoutes(buildService));
scorecardRoutes.route("/decisions", decisionRoutes(buildService));
scorecardRoutes.route("/competencies", competencyRoutes(buildService));
scorecardRoutes.route("/reliability", reliabilityRoutes(buildService));
scorecardRoutes.route("/assignments", assignmentRoutes(buildService));
scorecardRoutes.route("/bias-check", biasRoutes);
scorecardRoutes.route("/visibility", visibilityRoutes);
scorecardRoutes.route("/stage-questions", stageQuestionRoutes(buildService));
scorecardRoutes.route("/take-home", takeHomeRoutes(buildService));
scorecardRoutes.route("/coverage", coverageRoutes(buildService));

// Public-by-token candidate-facing take-home routes (#1438). Exported
// separately so the app composition root can mount them outside the
// auth-gated /api/scorecards prefix (mirrors the pipeline-public + ats
// public pattern).
export const takeHomePublicRoutes = buildTakeHomePublicRoutes(buildService);

export default scorecardRoutes;
