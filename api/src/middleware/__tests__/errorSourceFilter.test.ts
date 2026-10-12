/**
 * errorSourceFilter publishes the error envelope ({ code, file:line }) for
 * the request logger, then strips `_source` for non-SuperAdmin viewers.
 *
 * Run: node --import tsx --test src/middleware/__tests__/errorSourceFilter.test.ts
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { errorSourceFilterMiddleware } from "../errorSourceFilter.js";

function appFor(user: Record<string, unknown> | null, seen: Array<unknown>) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    if (user) c.set("user", user as any);
    await next();
    seen.push(c.var.errorEnvelope);
  });
  app.use("*", errorSourceFilterMiddleware);
  app.get("/fail", (c) =>
    c.json({ success: false, error: { code: "RESUME_NOT_FOUND", _source: { file: "routes/resumes.ts", line: 42 } } }, 404),
  );
  app.get("/ok", (c) => c.json({ success: true }));
  return app;
}

describe("errorSourceFilterMiddleware", () => {
  it("records code + file:line and strips _source for a regular viewer", async () => {
    const seen: unknown[] = [];
    const res = await appFor({ sub: "u1", roles: ["job_seeker"] }, seen).request("/fail");
    const body = (await res.json()) as any;
    assert.equal(body.error._source, undefined);
    assert.deepEqual(seen, [{ code: "RESUME_NOT_FOUND", source: "routes/resumes.ts:42" }]);
  });

  it("records the envelope and keeps _source for a SuperAdmin", async () => {
    const seen: unknown[] = [];
    const res = await appFor({ sub: "sa", roles: [], isSuperAdmin: true }, seen).request("/fail");
    const body = (await res.json()) as any;
    assert.deepEqual(body.error._source, { file: "routes/resumes.ts", line: 42 });
    assert.deepEqual(seen, [{ code: "RESUME_NOT_FOUND", source: "routes/resumes.ts:42" }]);
  });

  it("leaves successful responses alone", async () => {
    const seen: unknown[] = [];
    await appFor(null, seen).request("/ok");
    assert.deepEqual(seen, [undefined]);
  });
});
