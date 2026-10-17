/**
 * Creator Program enrollment:
 *   POST   /opt-in                — start a new enrollment row (programs[], terms, profile)
 *   POST   /me/programs/:program  — enable a program (requires its current terms)
 *   DELETE /me/programs/:program  — disable a program (row stays open)
 *   POST   /me/cancel             — leave the program (sets ended_at; new row on re-enroll)
 *
 * `categories` is derived server-side from the program flags and never read
 * from the body. A paid subscription is NOT required to enroll — public
 * visibility is gated downstream by `isCreatorVisible(userId)`.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { error } from "../../types/index.js";
import { isCreatorProgram } from "../../../../shared/creator-programs.js";
import { requireUser } from "../helpers/routerHelpers.js";
import {
  optInCreator,
  enableCreatorProgram,
  disableCreatorProgram,
  cancelCreatorEnrollment,
} from "../../services/creators/enrollment.js";
import { sendResult } from "./shared.js";

export const creatorEnrollmentRoutes = new Hono<AppEnv>();

creatorEnrollmentRoutes.post("/opt-in", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await c.req.json().catch(() => ({})) as {
    programs?: unknown;
    displayName?: string;
    tagline?: string;
    bio?: string;
    languages?: string[];
  };
  const programs = Array.isArray(body.programs) ? body.programs.filter(isCreatorProgram) : [];
  return sendResult(c, await optInCreator(auth.userId, {
    programs,
    displayName: body.displayName,
    tagline: body.tagline,
    bio: body.bio,
    languages: body.languages,
  }));
});

creatorEnrollmentRoutes.post("/me/programs/:program", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const program = c.req.param("program");
  if (!isCreatorProgram(program)) {
    return c.json(error("VALIDATION_ERROR", "Unknown program"), 400);
  }
  return sendResult(c, await enableCreatorProgram(auth.userId, program));
});

creatorEnrollmentRoutes.delete("/me/programs/:program", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const program = c.req.param("program");
  if (!isCreatorProgram(program)) {
    return c.json(error("VALIDATION_ERROR", "Unknown program"), 400);
  }
  return sendResult(c, await disableCreatorProgram(auth.userId, program));
});

creatorEnrollmentRoutes.post("/me/cancel", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return sendResult(c, await cancelCreatorEnrollment(auth.userId));
});
