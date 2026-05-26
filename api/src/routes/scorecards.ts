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

export default scorecardRoutes;
