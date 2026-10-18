/**
 * /api/calibration/* — calibration sessions (#1381).
 */

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { requireUser } from "./helpers/routerHelpers.js";
import {
  CalibrationService,
  defaultCalibrationServiceDeps,
} from "../domains/calibration/calibrationService.js";
import { validateJson } from "./helpers/validate.js";

const CreateSessionSchema = z.object({
  companyId: UuidLikeSchema,
  templateId: UuidLikeSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  candidateApplicationIds: z.array(z.string().min(1)).min(1).max(20),
});

const SubmitCalibrationSchema = z.object({
  applicationId: z.string().min(1),
  ratings: z.record(UuidLikeSchema, z.number().int().min(0).max(10).nullable()),
  overallRecommendation: z
    .enum(["strong_yes", "yes", "no", "strong_no"])
    .optional(),
  overallScore: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().max(5000).optional(),
});

const buildService = () => new CalibrationService(defaultCalibrationServiceDeps());

export const calibrationRoutes = new Hono<AppEnv>();

calibrationRoutes.get("/sessions", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await buildService().listSessions(userId)));
});

calibrationRoutes.get("/sessions/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(
    success(await buildService().getSessionView(userId, c.req.param("id"))),
  );
});

calibrationRoutes.post("/sessions", validateJson(CreateSessionSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return c.json(
    success(await buildService().createSession(userId, body)),
    201,
  );
});

calibrationRoutes.post("/sessions/:id/submissions", validateJson(SubmitCalibrationSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return c.json(
    success(
      await buildService().submitCalibration(
        userId,
        c.req.param("id"),
        body,
      ),
    ),
    201,
  );
});

calibrationRoutes.post("/sessions/:id/close", async (c) => {
  const userId = requireUser(c);
  return c.json(
    success(await buildService().closeSession(userId, c.req.param("id"))),
  );
});

export default calibrationRoutes;
