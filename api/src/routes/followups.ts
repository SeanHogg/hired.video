/**
 * /api/followups — nurture follow-up sequences (Pro). Thin HTTP layer over
 * services/outreach/follow-up-sequences.ts (the ONE sequence engine,
 * follow_up_* kind = 'nurture').
 */
import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { isDomainError } from "../domains/errors.js";
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

export const followUpRoutes = new Hono<AppEnv>();

const followUpsPro = requirePro("Automated Follow-ups");

/** Authenticated caller → use case; a DomainError renders as the error envelope. */
async function run(
  c: Context<AppEnv>,
  fn: (userId: string) => Promise<Response>,
): Promise<Response> {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    return await fn(userId);
  } catch (err) {
    if (isDomainError(err)) return c.json(error(err.code, err.message, err.details), err.status as ContentfulStatusCode);
    throw err;
  }
}

const readJson = (c: Context<AppEnv>) => c.req.json().catch(() => null);

followUpRoutes.get("/sequences", followUpsPro, (c) =>
  run(c, async (userId) => c.json(success(await listSequences(userId)), 200)),
);

// Create sequence + steps
followUpRoutes.post("/sequences", followUpsPro, (c) =>
  run(c, async (userId) => c.json(success(await createSequence(userId, await readJson(c))), 201)),
);

// Sequence + steps + enrollments
followUpRoutes.get("/sequences/:id", followUpsPro, (c) =>
  run(c, async (userId) => c.json(success(await getSequenceDetail(userId, c.req.param("id"))), 200)),
);

followUpRoutes.delete("/sequences/:id", followUpsPro, (c) =>
  run(c, async (userId) => c.json(success(await removeSequence(userId, c.req.param("id"))), 200)),
);

// Enroll a recipient in a sequence
followUpRoutes.post("/enroll", followUpsPro, (c) =>
  run(c, async (userId) => c.json(success(await enroll(userId, await readJson(c))), 201)),
);

// This user's enrollments
followUpRoutes.get("/enrollments", followUpsPro, (c) =>
  run(c, async (userId) => c.json(success(await listEnrollments(userId)), 200)),
);

// PATCH /enrollments/:id/pause | resume | cancel
followUpRoutes.patch("/enrollments/:id/:action", followUpsPro, (c) =>
  run(c, async (userId) =>
    c.json(success(await changeEnrollmentStatus(userId, c.req.param("id"), c.req.param("action"))), 200),
  ),
);

// Behaviour-triggered sequence enrollment (#29).
// Body: { trigger, sequenceName?, sequenceId?, recipientEmail, recipientName?, recipientUserId?, context? }
followUpRoutes.post("/trigger", requirePro("Smart Outreach"), (c) =>
  run(c, async (userId) => {
    const result = await triggerEnrollment(userId, await readJson(c));
    return c.json(success(result.body), result.created ? 201 : 200);
  }),
);

followUpRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Follow-up route not found" } }, 404),
);
