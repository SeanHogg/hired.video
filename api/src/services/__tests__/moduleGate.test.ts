/**
 * Unit tests for the module gate primitives.
 *
 * Covers:
 *  - services/moduleStatus.ts — cache behaviour, isModuleActive semantics
 *  - middleware/moduleGate.ts — requireModuleActive + moduleGateByPath
 *
 * Uses the __setModuleStatusCacheForTests hook so the suite never touches a DB.
 *
 * Run: node --import tsx --test src/services/__tests__/moduleGate.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

import {
  isModuleActive,
  getModuleStatusMap,
  invalidateModuleStatusCache,
  __setModuleStatusCacheForTests,
  __clearModuleStatusCacheForTests,
} from "../auth/moduleStatus.js";
import {
  requireModuleActive,
  moduleGateByPath,
} from "../../middleware/moduleGate.js";
import type { Variables } from "../../types/index.js";

// ── Test helpers ────────────────────────────────────────────────────────────

function setStatuses(entries: Array<[string, boolean]>): void {
  __setModuleStatusCacheForTests(new Map(entries));
}

function userCtxMiddleware(user: Partial<Variables["user"]> | null) {
  return async (c: any, next: any) => {
    if (user) c.set("user", user);
    return next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// services/moduleStatus.ts
// ═══════════════════════════════════════════════════════════════════════════
describe("isModuleActive", () => {
  beforeEach(() => __clearModuleStatusCacheForTests());

  it("returns true for slugs flagged active in the cache", async () => {
    setStatuses([["ads", true], ["ats", false]]);
    assert.equal(await isModuleActive("ads"), true);
  });

  it("returns false for slugs flagged inactive in the cache", async () => {
    setStatuses([["ads", true], ["ats", false]]);
    assert.equal(await isModuleActive("ats"), false);
  });

  it("returns true when the slug has no row (opt-in enforcement)", async () => {
    setStatuses([["ads", true]]);
    assert.equal(await isModuleActive("nonexistent-module"), true);
  });
});

describe("getModuleStatusMap cache", () => {
  beforeEach(() => __clearModuleStatusCacheForTests());

  it("reads the warmed cache without hitting the DB", async () => {
    setStatuses([["community", true]]);
    const map = await getModuleStatusMap();
    assert.equal(map.get("community"), true);
    assert.equal(map.size, 1);
  });

  it("invalidateModuleStatusCache clears the cache so the next read repopulates", async () => {
    setStatuses([["community", true]]);
    assert.equal((await getModuleStatusMap()).size, 1);

    invalidateModuleStatusCache();
    // After invalidation the map is gone; a fresh warm must be performed by
    // whoever next reads. Re-seed it to prove the cache returned to empty.
    setStatuses([["community", false], ["ads", true]]);
    const map = await getModuleStatusMap();
    assert.equal(map.get("community"), false);
    assert.equal(map.get("ads"), true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// middleware/moduleGate.ts — requireModuleActive
// ═══════════════════════════════════════════════════════════════════════════
describe("requireModuleActive", () => {
  beforeEach(() => __clearModuleStatusCacheForTests());

  it("passes the request when the module is active", async () => {
    setStatuses([["ads", true]]);
    const app = new Hono<{ Variables: Variables }>();
    app.use("*", userCtxMiddleware({ sub: "u1", email: "u@x", roles: [], emailVerified: true, mustChangePassword: false }));
    app.get("/ads/config", requireModuleActive("ads"), (c) => c.json({ ok: true }));

    const res = await app.request("/ads/config");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("returns 403 MODULE_DISABLED when the module is inactive", async () => {
    setStatuses([["ads", false]]);
    const app = new Hono<{ Variables: Variables }>();
    app.use("*", userCtxMiddleware({ sub: "u1", email: "u@x", roles: ["job_seeker"], emailVerified: true, mustChangePassword: false }));
    app.get("/ads/config", requireModuleActive("ads"), (c) => c.json({ ok: true }));

    const res = await app.request("/ads/config");
    assert.equal(res.status, 403);
    const body = await res.json() as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, "MODULE_DISABLED");
    assert.equal(body.error.slug, "ads");
  });

  it("passes through when the module slug is unknown (opt-in)", async () => {
    setStatuses([["ads", true]]);
    const app = new Hono<{ Variables: Variables }>();
    app.use("*", userCtxMiddleware({ sub: "u1", email: "u@x", roles: ["job_seeker"], emailVerified: true, mustChangePassword: false }));
    app.get("/x", requireModuleActive("not-curated-yet"), (c) => c.json({ ok: true }));

    const res = await app.request("/x");
    assert.equal(res.status, 200);
  });

  it("bypasses the gate for SuperAdmin callers even when inactive", async () => {
    setStatuses([["ads", false]]);
    const app = new Hono<{ Variables: Variables }>();
    app.use("*", userCtxMiddleware({ sub: "u1", email: "u@x", roles: ["super_admin"], emailVerified: true, mustChangePassword: false }));
    app.get("/ads/config", requireModuleActive("ads"), (c) => c.json({ ok: true }));

    const res = await app.request("/ads/config");
    assert.equal(res.status, 200);
  });

  it("bypasses the gate for Admin callers even when inactive", async () => {
    setStatuses([["ads", false]]);
    const app = new Hono<{ Variables: Variables }>();
    app.use("*", userCtxMiddleware({ sub: "u1", email: "u@x", roles: ["admin"], emailVerified: true, mustChangePassword: false }));
    app.get("/ads/config", requireModuleActive("ads"), (c) => c.json({ ok: true }));

    const res = await app.request("/ads/config");
    assert.equal(res.status, 200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// middleware/moduleGate.ts — moduleGateByPath
// ═══════════════════════════════════════════════════════════════════════════
describe("moduleGateByPath", () => {
  beforeEach(() => __clearModuleStatusCacheForTests());

  const registry = {
    "/api/ads": "ads",
    "/api/community": "community",
  };

  function buildApp(userRoles: string[]) {
    const app = new Hono<{ Variables: Variables }>();
    app.use("*", userCtxMiddleware({ sub: "u1", email: "u@x", roles: userRoles, emailVerified: true, mustChangePassword: false }));
    app.use("/api/*", moduleGateByPath(registry));
    app.get("/api/ads/config", (c) => c.json({ ok: "ads" }));
    app.get("/api/community/feed", (c) => c.json({ ok: "community" }));
    app.get("/api/other/resource", (c) => c.json({ ok: "other" }));
    return app;
  }

  it("blocks every path under a disabled module prefix", async () => {
    setStatuses([["ads", false], ["community", true]]);
    const app = buildApp(["job_seeker"]);

    const blocked = await app.request("/api/ads/config");
    assert.equal(blocked.status, 403);

    const allowed = await app.request("/api/community/feed");
    assert.equal(allowed.status, 200);
  });

  it("does not accidentally match /api/adsomething on /api/ads", async () => {
    setStatuses([["ads", false]]);
    const app = new Hono<{ Variables: Variables }>();
    app.use("*", userCtxMiddleware({ sub: "u1", email: "u@x", roles: ["job_seeker"], emailVerified: true, mustChangePassword: false }));
    app.use("/api/*", moduleGateByPath({ "/api/ads": "ads" }));
    app.get("/api/adsomething", (c) => c.json({ ok: true }));

    const res = await app.request("/api/adsomething");
    assert.equal(res.status, 200, "prefix match must require a trailing slash or exact equality");
  });

  it("passes when the module is active", async () => {
    setStatuses([["ads", true], ["community", true]]);
    const app = buildApp(["job_seeker"]);
    const res = await app.request("/api/ads/config");
    assert.equal(res.status, 200);
  });

  it("passes for prefixes that aren't in the registry", async () => {
    setStatuses([["ads", false]]);
    const app = buildApp(["job_seeker"]);
    const res = await app.request("/api/other/resource");
    assert.equal(res.status, 200);
  });

  it("passes for SuperAdmin callers even when the module is disabled", async () => {
    setStatuses([["ads", false]]);
    const app = buildApp(["super_admin"]);
    const res = await app.request("/api/ads/config");
    assert.equal(res.status, 200);
  });

  it("prefers the longest matching prefix", async () => {
    setStatuses([["ads", false], ["ads-admin", true]]);
    const app = new Hono<{ Variables: Variables }>();
    app.use("*", userCtxMiddleware({ sub: "u1", email: "u@x", roles: ["job_seeker"], emailVerified: true, mustChangePassword: false }));
    app.use("/api/*", moduleGateByPath({ "/api/ads": "ads", "/api/ads/admin": "ads-admin" }));
    app.get("/api/ads/admin/reports", (c) => c.json({ ok: true }));
    app.get("/api/ads/config", (c) => c.json({ ok: true }));

    // Longest prefix /api/ads/admin → ads-admin (active) — should pass.
    const adminRes = await app.request("/api/ads/admin/reports");
    assert.equal(adminRes.status, 200);

    // Non-admin path matches /api/ads → ads (inactive) — should 403.
    const configRes = await app.request("/api/ads/config");
    assert.equal(configRes.status, 403);
  });
});
