/**
 * requireJobPoster — POST /api/jobs is for recruiters, employers and internal
 * roles only (#1915); the same `canPostJobsRole` rule the studio gates on.
 *
 * Run: node --import tsx --test src/middleware/__tests__/job-poster-gate.test.ts
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requireJobPoster } from "../job-poster-gate.js";
import { canPostJobsRole } from "../../../../shared/user-roles.js";

function appFor(user: Record<string, unknown> | null) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    if (user) c.set("user", user as any);
    await next();
  });
  app.post("/jobs", requireJobPoster, (c) => c.json({ success: true }, 201));
  return app;
}

const post = (user: Record<string, unknown> | null) => appFor(user).request("/jobs", { method: "POST" });

describe("requireJobPoster", () => {
  it("lets a recruiter and an employer post", async () => {
    assert.equal((await post({ sub: "u1", roles: ["recruiter"] })).status, 201);
    assert.equal((await post({ sub: "u2", roles: ["employer"] })).status, 201);
  });

  it("lets internal roles through, by roles claim or single role", async () => {
    assert.equal((await post({ sub: "a", roles: ["admin"] })).status, 201);
    assert.equal((await post({ sub: "sa", roles: [], role: "super_admin" })).status, 201);
  });

  it("refuses a job seeker (403) and a signed-out caller (401)", async () => {
    const seeker = await post({ sub: "u3", roles: ["job_seeker"] });
    assert.equal(seeker.status, 403);
    assert.equal(((await seeker.json()) as any).error.code, "FORBIDDEN");
    assert.equal((await post(null)).status, 401);
  });

  it("canPostJobsRole: empty / unknown claims never post (boundary)", () => {
    assert.equal(canPostJobsRole(undefined), false);
    assert.equal(canPostJobsRole([]), false);
    assert.equal(canPostJobsRole(["creator", null]), false);
    assert.equal(canPostJobsRole("employer"), true);
  });
});
