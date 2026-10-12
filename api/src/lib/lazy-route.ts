/**
 * Lazy route mounting — keeps Worker startup under Cloudflare's CPU cap.
 *
 * `app.route(prefix, sub)` needs the sub-app at registration time, so every
 * route module (and the zod schemas / drizzle tables it builds at module top
 * level) was evaluated when the isolate started. That pushed startup past the
 * limit and deploys failed with code 10021 (gap #2339).
 *
 * `lazyRoute(app, prefix, load)` registers a catch-all at the same position in
 * the middleware chain and defers `load()` (a dynamic `import()`, which esbuild
 * turns into a lazy module init inside the single bundle) to the first request
 * under the prefix. The loaded sub-app runs inside a small wrapper app so that:
 *
 *  - paths, params and sub-app middleware behave exactly as with `app.route`
 *    (the wrapper mounts the sub-app at the same full prefix);
 *  - context variables set by the parent's middleware (auth user, emulation,
 *    the MCP `app`, …) are visible to the sub-app, and anything the sub-app
 *    sets flows back to the parent for its post-`next()` middleware;
 *  - errors propagate to the parent's `onError` (global handler + CORS);
 *  - a path the sub-app doesn't match falls through to the next registered
 *    route via `next()`, as merged `app.route` routers did — several prefixes
 *    are mounted more than once (e.g. `/api/resume`, `/api/admin/*`).
 */
import { Hono } from "hono";
import type { Context, Env, Next } from "hono";
import { routePath } from "hono/route";

/** Context var carrying the sub-app's matched route pattern to the parent. */
const ROUTE_PATTERN_VAR = "routePattern";

// Route modules export Hono apps with their own Bindings/Variables generics;
// the wrapper only forwards requests, so it accepts any of them.
type SubApp = Hono<any, any, any>;

/** Loads a route module's Hono sub-app, e.g. `() => import("./x.js").then((m) => m.xRoutes)`. */
export type RouteLoader = () => Promise<SubApp>;

/** Per-request handoff between the parent handler and the wrapper app. */
interface DispatchScope {
  vars: Record<string, unknown>;
  matched: boolean;
}

const scopes = new WeakMap<Request, DispatchScope>();
/** Mounts already tried for a request, so `/prefix` and `/prefix/*` never both dispatch. */
const tried = new WeakMap<Request, Set<symbol>>();

function setVar(c: Context, key: string, value: unknown): void {
  (c.set as (key: string, value: unknown) => void)(key, value);
}

function executionCtxOf(c: Context): ExecutionContext | undefined {
  try {
    return c.executionCtx;
  } catch {
    // `app.request()` in tests and MCP re-entry run without an ExecutionContext.
    return undefined;
  }
}

/** Every Set-Cookie value — `getSetCookie()` is in the runtime but not in the pinned workers types. */
function setCookiesOf(headers: Headers): string[] {
  return (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
}

/**
 * Fold the sub-app response's headers into the parent context before it is
 * returned. When a handler returns a Response, Hono's `c.res` setter copies the
 * parent's headers over it and REPLACES its Set-Cookie list with the parent's
 * (CORS touches `c.res` on every request, so this always applies). With
 * `app.route` the sub-app wrote into the same context, so its cookies and
 * headers were already there; recreate that: append sub-app cookies, let other
 * sub-app headers win, and keep parent headers set before dispatch
 * (`c.header()` before `next()`), which otherwise only reach `c.json`/`c.text`.
 */
function mergeIntoParent(c: Context, res: Response): void {
  const parent = c.res.headers;
  for (const cookie of setCookiesOf(res.headers)) parent.append("set-cookie", cookie);
  for (const [key, value] of res.headers) {
    if (key !== "set-cookie" && key !== "content-type") parent.set(key, value);
  }
}

function buildWrapper(prefix: string, sub: SubApp): Hono {
  const wrapper = new Hono();
  wrapper.use("*", async (c, next) => {
    const scope = scopes.get(c.req.raw);
    if (scope) for (const [key, value] of Object.entries(scope.vars)) setVar(c, key, value);
    try {
      await next();
    } finally {
      // After dispatch, routeIndex points at the handler that responded, so
      // this is the full pattern (e.g. /api/resumes/:id). Recorded on the
      // throw path too — a 500 is when the route matters most.
      if (scope) scope.vars = { ...c.var, [ROUTE_PATTERN_VAR]: routePath(c) };
    }
  });
  wrapper.route(prefix, sub);
  wrapper.notFound((c) => {
    const scope = scopes.get(c.req.raw);
    if (scope) scope.matched = false;
    return c.body(null, 404);
  });
  // Re-throw so the error reaches the parent app's onError, not a bare 500.
  wrapper.onError((err) => {
    throw err;
  });
  return wrapper;
}

export function lazyRoute<E extends Env>(app: Hono<E>, prefix: string, load: RouteLoader): void {
  const id = Symbol(prefix);
  let wrapper: Promise<Hono> | undefined;
  const getWrapper = (): Promise<Hono> =>
    (wrapper ??= load().then(
      (sub) => buildWrapper(prefix, sub),
      (err: unknown) => {
        wrapper = undefined; // let the next request retry a failed load
        throw err;
      },
    ));

  const handler = async (c: Context<E>, next: Next) => {
    const req = c.req.raw;
    let seen = tried.get(req);
    if (!seen) tried.set(req, (seen = new Set()));
    if (seen.has(id)) return next();
    seen.add(id);

    const scope: DispatchScope = { vars: { ...c.var }, matched: true };
    let res: Response;
    try {
      scopes.set(req, scope);
      res = await (await getWrapper()).fetch(req, c.env, executionCtxOf(c));
    } finally {
      scopes.delete(req);
      // Only the pattern crosses back on a throw; other vars stay as before.
      const pattern = scope.vars[ROUTE_PATTERN_VAR];
      if (scope.matched && typeof pattern === "string") setVar(c, ROUTE_PATTERN_VAR, pattern);
    }
    if (!scope.matched) return next();
    for (const [key, value] of Object.entries(scope.vars)) setVar(c, key, value);
    mergeIntoParent(c, res);
    return res;
  };

  app.all(prefix, handler);
  app.all(`${prefix}/*`, handler);
}
