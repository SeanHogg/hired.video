/**
 * lazyRoute must behave like `app.route` (gap #2339): same paths + params,
 * parent context visible to the sub-app, fall-through on a miss, errors to the
 * parent's onError — while deferring the module load to the first request.
 *
 * Run: node --import tsx --test src/lib/__tests__/lazy-route.test.ts
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { Hono } from "hono";
import { lazyRoute } from "../lazy-route.js";

type Vars = { Variables: { user?: string; seen?: string; routePattern?: string } };

function counted(sub: Hono<Vars>) {
  let loads = 0;
  return {
    load: async () => {
      loads++;
      return sub;
    },
    loads: () => loads,
  };
}

describe("lazyRoute", () => {
  it("defers the load to the first matching request and loads once", async () => {
    const sub = new Hono<Vars>().get("/ping", (c) => c.text("pong"));
    const loader = counted(sub);
    const app = new Hono<Vars>();
    lazyRoute(app, "/api/x", loader.load);
    assert.equal(loader.loads(), 0);

    assert.equal(await (await app.request("/api/x/ping")).text(), "pong");
    assert.equal(await (await app.request("/api/x/ping")).text(), "pong");
    assert.equal(loader.loads(), 1);
  });

  it("serves the sub-app root and prefix params like app.route", async () => {
    const sub = new Hono<Vars>()
      .get("/", (c) => c.text("root"))
      .get("/items/:id", (c) => c.text(`${c.req.param("jobId")}:${c.req.param("id")}`));
    const app = new Hono<Vars>();
    lazyRoute(app, "/api/jobs/:jobId/pipeline", async () => sub);

    assert.equal(await (await app.request("/api/jobs/j1/pipeline")).text(), "root");
    assert.equal(await (await app.request("/api/jobs/j1/pipeline/items/7")).text(), "j1:7");
  });

  it("passes parent context vars down and sub-app vars back up", async () => {
    const sub = new Hono<Vars>().get("/me", (c) => {
      c.set("seen", "by-sub");
      return c.text(c.get("user") ?? "none");
    });
    const app = new Hono<Vars>();
    let seenAfter: string | undefined;
    app.use("*", async (c, next) => {
      c.set("user", "u1");
      await next();
      seenAfter = c.get("seen");
    });
    lazyRoute(app, "/api/x", async () => sub);

    assert.equal(await (await app.request("/api/x/me")).text(), "u1");
    assert.equal(seenAfter, "by-sub");
  });

  it("falls through to the next registration when the sub-app has no match", async () => {
    const first = new Hono<Vars>().get("/roast", (c) => c.text("roast"));
    const second = new Hono<Vars>().get("/list", (c) => c.text("list"));
    const app = new Hono<Vars>();
    lazyRoute(app, "/api/resume", async () => first);
    lazyRoute(app, "/api/resume", async () => second);

    assert.equal(await (await app.request("/api/resume/roast")).text(), "roast");
    assert.equal(await (await app.request("/api/resume/list")).text(), "list");
    assert.equal((await app.request("/api/resume/missing")).status, 404);
  });

  it("keeps parent response headers set before dispatch", async () => {
    const sub = new Hono<Vars>().get("/h", (c) => c.text("ok"));
    const app = new Hono<Vars>();
    app.use("*", async (c, next) => {
      c.header("X-Parent", "1");
      await next();
    });
    lazyRoute(app, "/api/x", async () => sub);

    const res = await app.request("/api/x/h");
    assert.equal(res.headers.get("X-Parent"), "1");
  });

  it("keeps sub-app and parent cookies when the parent touched c.res (as CORS does)", async () => {
    const sub = new Hono<Vars>().post("/login", (c) => {
      c.header("Set-Cookie", "session=abc; Path=/", { append: true });
      c.header("Vary", "Cookie");
      return c.json({ ok: true });
    });
    const app = new Hono<Vars>();
    app.use("*", async (c, next) => {
      c.res.headers.set("Access-Control-Allow-Origin", "https://hired.video");
      c.res.headers.set("Vary", "Origin");
      c.header("Set-Cookie", "clickid=1; Path=/", { append: true });
      await next();
    });
    lazyRoute(app, "/api/auth", async () => sub);

    const res = await app.request("/api/auth/login", { method: "POST" });
    const cookies = res.headers.get("set-cookie") ?? "";
    assert.ok(cookies.includes("clickid=1; Path=/"), cookies);
    assert.ok(cookies.includes("session=abc; Path=/"), cookies);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://hired.video");
    assert.equal(res.headers.get("Vary"), "Cookie"); // sub-app header wins, as with app.route
    assert.equal(res.headers.get("Content-Type"), "application/json");
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("routes sub-app errors to the parent onError", async () => {
    const sub = new Hono<Vars>().get("/boom", () => {
      throw new Error("kaboom");
    });
    const app = new Hono<Vars>();
    app.onError((err, c) => c.text(`handled:${err.message}`, 500));
    lazyRoute(app, "/api/x", async () => sub);

    const res = await app.request("/api/x/boom");
    assert.equal(res.status, 500);
    assert.equal(await res.text(), "handled:kaboom");
  });

  it("retries a failed module load on the next request", async () => {
    const sub = new Hono<Vars>().get("/ok", (c) => c.text("ok"));
    let attempts = 0;
    const app = new Hono<Vars>();
    app.onError((_err, c) => c.text("load failed", 500));
    lazyRoute(app, "/api/x", async () => {
      attempts++;
      if (attempts === 1) throw new Error("transient");
      return sub;
    });

    assert.equal((await app.request("/api/x/ok")).status, 500);
    assert.equal(await (await app.request("/api/x/ok")).text(), "ok");
  });
  it("reports the sub-app's matched route pattern to the parent, even on a throw", async () => {
    const sub = new Hono<Vars>()
      .get("/items/:id", (c) => c.text("ok"))
      .get("/boom/:id", () => {
        throw new Error("kaboom");
      });
    const app = new Hono<Vars>();
    const patterns: Array<string | undefined> = [];
    app.use("*", async (c, next) => {
      await next();
      patterns.push(c.get("routePattern"));
    });
    app.onError((_err, c) => c.text("handled", 500));
    lazyRoute(app, "/api/x", async () => sub);

    await app.request("/api/x/items/42");
    await app.request("/api/x/boom/7");
    assert.deepEqual(patterns, ["/api/x/items/:id", "/api/x/boom/:id"]);
  });
});
