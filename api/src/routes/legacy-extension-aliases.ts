/**
 * DEPRECATED path aliases for the Chrome extension build that is live on the
 * Chrome Web Store. The extension source has moved to the consolidated
 * endpoints, but installed copies keep calling the old paths until the next
 * CWS release reaches them. Each alias re-dispatches the request through the
 * root app to the canonical handler (same auth, gates and use cases), and
 * reshapes the response only where the old client expected another shape.
 *
 * Registered in app.ts BEFORE the resource mounts, because e.g.
 * GET /api/resumes/mastergroups would otherwise match GET /api/resumes/:id.
 */
import type { Context, Hono } from "hono";
import { success } from "../types/index.js";

/** The root app — aliases register on it and re-dispatch through its fetch. */
type RootApp = Hono<any, any, any>;

interface Rewrite {
  /** Canonical path (may carry a query string, which replaces the caller's). */
  path: string;
  method?: string;
  /** Build the canonical JSON body from the legacy one. Omit to forward the raw body. */
  json?: (legacy: Record<string, unknown>) => Record<string, unknown>;
}

function executionCtxOf(c: Context): ExecutionContext | undefined {
  try {
    return c.executionCtx;
  } catch {
    return undefined; // app.request() in tests runs without one.
  }
}

async function forward(app: RootApp, c: Context, rewrite: Rewrite): Promise<Response> {
  const url = new URL(c.req.url);
  const [pathname, query] = rewrite.path.split("?");
  url.pathname = pathname;
  if (query !== undefined) url.search = `?${query}`;
  const method = rewrite.method ?? c.req.method;
  const headers = new Headers(c.req.raw.headers);
  let body: BodyInit | undefined;
  if (rewrite.json) {
    const legacy = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    body = JSON.stringify(rewrite.json(legacy ?? {}));
    headers.set("content-type", "application/json");
    headers.delete("content-length");
  } else if (method !== "GET" && method !== "HEAD") {
    body = await c.req.arrayBuffer();
  }
  return app.fetch(new Request(url, { method, headers, body }), c.env, executionCtxOf(c));
}

/** Re-wrap a successful canonical envelope's `data` in the legacy shape. */
async function reshape(
  c: Context,
  res: Response,
  toLegacy: (data: Record<string, unknown>) => unknown,
): Promise<Response> {
  if (!res.ok) return res;
  const envelope = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
  return c.json(success(toLegacy(envelope?.data ?? {})), 200);
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const enc = (v: string | undefined): string => encodeURIComponent(v ?? "");

export function registerLegacyExtensionAliases(app: RootApp): void {
  // DEPRECATED alias for extension <= current version — remove after next CWS release
  app.get("/api/resumes/mastergroups", (c) =>
    forward(app, c, { path: "/api/resumes?owner=me&view=groups" }),
  );

  // DEPRECATED alias for extension <= current version — remove after next CWS release
  app.post("/api/resumes/createfromfile", (c) => forward(app, c, { path: "/api/resumes" }));

  // DEPRECATED alias for extension <= current version — remove after next CWS release
  app.post("/api/resumes/:id/setactive", (c) =>
    forward(app, c, { path: `/api/resumes/${enc(c.req.param("id"))}`, method: "PATCH", json: () => ({ isActive: true }) }),
  );

  // DEPRECATED alias for extension <= current version — remove after next CWS release
  app.post("/api/resume-versions/:id/versions", async (c) => {
    const masterId = c.req.param("id") ?? "";
    const res = await forward(app, c, {
      path: "/api/resumes",
      json: (legacy) => ({ ...legacy, source: "variation", sourceId: masterId }),
    });
    return reshape(c, res, (created) => ({
      resumeId: str(created.id),
      title: str(created.title),
      masterId: str(created.masterId) || masterId,
    }));
  });

  // DEPRECATED alias for extension <= current version — remove after next CWS release
  app.post("/api/resumescorer/score", (c) => forward(app, c, { path: "/api/ai/tools/resume-score" }));

  // DEPRECATED alias for extension <= current version — remove after next CWS release
  app.get("/api/studio/status/:id", async (c) => {
    const res = await forward(app, c, { path: `/api/studio/projects/${enc(c.req.param("id"))}` });
    return reshape(c, res, (p) => ({
      id: p.id,
      status: p.status,
      videoUrl: p.videoUrl ?? null,
      renderUrl: p.renderUrl ?? null,
    }));
  });
}
