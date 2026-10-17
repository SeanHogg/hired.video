/**
 * /api/recruiter/lists — recruiter lists / call queues (gap #1360) of
 * talent-pool candidates. NOT the polymorphic /api/lists feature
 * (different tables: recruiter_lists / recruiter_list_members); merging
 * the tables is a Wave 3 item.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import {
  addRecruiterListMember,
  createRecruiterList,
  getRecruiterListMembers,
  getRecruiterLists,
  removeRecruiterList,
  removeRecruiterListMember,
} from "../../services/recruiter/lists.js";
import { handle } from "./http.js";

export const recruiterListRoutes = new Hono<AppEnv>();

recruiterListRoutes.post("/lists", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  return handle(c, "envelope", async () => c.json(success(await createRecruiterList(user.sub, body)), 201));
});

recruiterListRoutes.get("/lists", async (c) => {
  return c.json(success(await getRecruiterLists(c.get("user").sub)));
});

recruiterListRoutes.delete("/lists/:id", async (c) => {
  const user = c.get("user");
  return handle(c, "envelope", async () => c.json(success(await removeRecruiterList(user.sub, c.req.param("id")))));
});

// Idempotent: a duplicate (list, candidate) answers 200 { duplicate: true }.
recruiterListRoutes.post("/lists/:id/members", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  return handle(c, "envelope", async () => {
    const result = await addRecruiterListMember(user.sub, c.req.param("id"), body);
    if ("row" in result) return c.json(success(result.row), 201);
    return c.json(success({ duplicate: true }), 200);
  });
});

recruiterListRoutes.get("/lists/:id/members", async (c) => {
  const user = c.get("user");
  return handle(c, "envelope", async () => c.json(success(await getRecruiterListMembers(user.sub, c.req.param("id")))));
});

recruiterListRoutes.delete("/lists/:id/members/:memberId", async (c) => {
  const user = c.get("user");
  return handle(c, "envelope", async () =>
    c.json(success(await removeRecruiterListMember(user.sub, c.req.param("id"), c.req.param("memberId")))),
  );
});
