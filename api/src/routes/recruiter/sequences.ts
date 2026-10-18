/**
 * /api/recruiter/sequences — recruiter outreach sequences (gap #1357) and
 * candidate enrollments.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import {
  createOutreachSequence,
  enrollInOutreachSequence,
  getOutreachEnrollments,
  getOutreachSequences,
  removeOutreachSequence,
} from "../../services/recruiter/outreach-sequences.js";
import { handle } from "./http.js";

export const sequenceRoutes = new Hono<AppEnv>();

sequenceRoutes.post("/sequences", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  return handle(c, "envelope", async () => c.json(success(await createOutreachSequence(user.sub, body)), 201));
});

sequenceRoutes.get("/sequences", async (c) => {
  return c.json(success(await getOutreachSequences(c.var.userId)));
});

sequenceRoutes.delete("/sequences/:id", async (c) => {
  const user = c.get("user");
  return handle(c, "envelope", async () => c.json(success(await removeOutreachSequence(user.sub, c.req.param("id")))));
});

// Enroll a candidate; step 0's `nextSendAt` = now + its delayDays, later
// steps are advanced by the sequence engine. A duplicate
// enrollment answers 200 { duplicate: true }.
sequenceRoutes.post("/sequences/:id/enroll", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  return handle(c, "envelope", async () => {
    const result = await enrollInOutreachSequence(user.sub, c.req.param("id"), body);
    if ("row" in result) return c.json(success(result.row), 201);
    return c.json(success({ duplicate: true }), 200);
  });
});

sequenceRoutes.get("/sequences/:id/enrollments", async (c) => {
  const user = c.get("user");
  return handle(c, "envelope", async () => c.json(success(await getOutreachEnrollments(user.sub, c.req.param("id")))));
});
