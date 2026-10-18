/**
 * /api/followups — nurture follow-up sequences (Pro). Thin HTTP layer over
 * services/outreach/follow-up-sequences.ts (the ONE sequence engine,
 * follow_up_* kind = 'nurture').
 */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import {
  changeEnrollmentStatus,
  createSequence,
  enroll,
  getSequenceDetail,
  listEnrollments,
  listSequences,
  removeSequence,
  triggerEnrollment,
} from "../services/outreach/follow-up-sequences.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const followUpRoutes = new Hono<AppEnv>();

const followUpsPro = requirePro("Automated Follow-ups");

const readJson = (c: Context<AppEnv>) => c.req.json().catch(() => null);

followUpRoutes.get("/sequences", followUpsPro, async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listSequences(userId)), 200);
});

// Create sequence + steps
followUpRoutes.post("/sequences", followUpsPro, async (c) => {
  const userId = requireUser(c);
  return c.json(success(await createSequence(userId, await readJson(c))), 201);
});

// Sequence + steps + enrollments
followUpRoutes.get("/sequences/:id", followUpsPro, async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getSequenceDetail(userId, c.req.param("id"))), 200);
});

followUpRoutes.delete("/sequences/:id", followUpsPro, async (c) => {
  const userId = requireUser(c);
  return c.json(success(await removeSequence(userId, c.req.param("id"))), 200);
});

// Enroll a recipient in a sequence
followUpRoutes.post("/enroll", followUpsPro, async (c) => {
  const userId = requireUser(c);
  return c.json(success(await enroll(userId, await readJson(c))), 201);
});

// This user's enrollments
followUpRoutes.get("/enrollments", followUpsPro, async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listEnrollments(userId)), 200);
});

// PATCH /enrollments/:id/pause | resume | cancel
followUpRoutes.patch("/enrollments/:id/:action", followUpsPro, async (c) => {
  const userId = requireUser(c);
  return c.json(success(await changeEnrollmentStatus(userId, c.req.param("id"), c.req.param("action"))), 200);
});

// Behaviour-triggered sequence enrollment (#29).
// Body: { trigger, sequenceName?, sequenceId?, recipientEmail, recipientName?, recipientUserId?, context? }
followUpRoutes.post("/trigger", requirePro("Smart Outreach"), async (c) => {
  const userId = requireUser(c);
  const result = await triggerEnrollment(userId, await readJson(c));
  return c.json(success(result.body), result.created ? 201 : 200);
});
