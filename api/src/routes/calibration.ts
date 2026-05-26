/**
 * /api/calibration/* — calibration sessions (#1381).
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { mapServiceError, requireUser } from "./helpers/routerHelpers.js";
import {
  CalibrationService,
  CalibrationServiceError,
  defaultCalibrationServiceDeps,
} from "../domains/calibration/calibrationService.js";
import type { Context } from "hono";

const CreateSessionSchema = z.object({
  companyId: z.string().uuid(),
  templateId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  candidateApplicationIds: z.array(z.string().min(1)).min(1).max(20),
});

const SubmitCalibrationSchema = z.object({
  applicationId: z.string().min(1),
  ratings: z.record(z.string().uuid(), z.number().int().min(0).max(10).nullable()),
  overallRecommendation: z
    .enum(["strong_yes", "yes", "no", "strong_no"])
    .optional(),
  overallScore: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().max(5000).optional(),
});

function mapCalibrationError(c: Context, e: unknown) {
  if (e instanceof CalibrationServiceError) {
    const status =
      e.code === "NOT_FOUND"
        ? 404
        : e.code === "FORBIDDEN"
          ? 403
          : e.code === "CONFLICT"
            ? 409
            : 400;
    return c.json(error(e.code, e.message), status as any);
  }
  return mapServiceError(c, e);
}

const buildService = () => new CalibrationService(defaultCalibrationServiceDeps());

export const calibrationRoutes = new Hono<AppEnv>();

calibrationRoutes.get("/sessions", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  try {
    return c.json(success(await buildService().listSessions(auth.userId)));
  } catch (e) {
    return mapCalibrationError(c, e);
  }
});

calibrationRoutes.get("/sessions/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  try {
    return c.json(
      success(await buildService().getSessionView(auth.userId, c.req.param("id"))),
    );
  } catch (e) {
    return mapCalibrationError(c, e);
  }
});

calibrationRoutes.post("/sessions", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const parsed = CreateSessionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }
  try {
    return c.json(
      success(await buildService().createSession(auth.userId, parsed.data)),
      201,
    );
  } catch (e) {
    return mapCalibrationError(c, e);
  }
});

calibrationRoutes.post("/sessions/:id/submissions", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const parsed = SubmitCalibrationSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }
  try {
    return c.json(
      success(
        await buildService().submitCalibration(
          auth.userId,
          c.req.param("id"),
          parsed.data,
        ),
      ),
      201,
    );
  } catch (e) {
    return mapCalibrationError(c, e);
  }
});

calibrationRoutes.post("/sessions/:id/close", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  try {
    return c.json(
      success(await buildService().closeSession(auth.userId, c.req.param("id"))),
    );
  } catch (e) {
    return mapCalibrationError(c, e);
  }
});

export default calibrationRoutes;
