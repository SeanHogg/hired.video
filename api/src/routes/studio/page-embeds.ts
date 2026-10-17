/**
 * Page → video embed registry (#1860). SuperAdmin publishes a Studio video
 * onto a marketing-page route; the shared <MarketingPageVideo> component
 * resolves + renders it. `/paths` and `/resolve` are PUBLIC (anonymous
 * marketing-page visitors); the management surface is SuperAdmin-gated.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { isSuperAdmin } from "../../middleware/superAdmin.js";
import { normalisePathname, pageEmbedService } from "../../services/studio/page-embed-service.js";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { fail, ok } from "./http.js";

export const studioPageEmbedRoutes = new Hono<AppEnv>();

const PublishEmbedSchema = z.object({
  pathname: z.string().min(1).max(512),
  projectId: UuidLikeSchema,
  placement: z.enum(["hero", "inline"]).default("hero"),
});

/** 401 / 403 for the SuperAdmin management surface, or null when allowed. */
function superAdminGate(c: Context<AppEnv>): Response | null {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  if (!isSuperAdmin(user)) return c.json(fail("FORBIDDEN", "SuperAdmin access required"), 403);
  return null;
}

// Public membership set — the client fetches this once (cached) and only
// runs the full resolve below when the current route is in the set (#1863).
studioPageEmbedRoutes.get("/page-embeds/paths", async (c) => {
  return c.json(ok({ paths: await pageEmbedService().listActivePathsCached() }));
});

// Public resolver — 200 with `{ embed: null }` (not 404) so the client can
// cache "no embed here" cheaply without treating it as an error.
studioPageEmbedRoutes.get("/page-embeds/resolve", async (c) => {
  const path = normalisePathname(c.req.query("path") ?? "");
  return c.json(ok({ embed: await pageEmbedService().resolveForPathCached(path) }));
});

// SuperAdmin: list all active mappings (management surface).
studioPageEmbedRoutes.get("/page-embeds", async (c) => {
  const denied = superAdminGate(c);
  if (denied) return denied;
  return c.json(ok({ embeds: await pageEmbedService().listActive() }));
});

// SuperAdmin: publish a project to a path (upsert).
studioPageEmbedRoutes.post("/page-embeds", async (c) => {
  const denied = superAdminGate(c);
  if (denied) return denied;
  const body = await c.req.json().catch(() => null);
  const parsed = PublishEmbedSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  const pathname = normalisePathname(parsed.data.pathname);
  try {
    await pageEmbedService().publish({
      pathname,
      projectId: parsed.data.projectId,
      placement: parsed.data.placement,
      userId: c.var.user!.sub,
    });
  } catch (err) {
    return c.json(fail("PUBLISH_FAILED", err instanceof Error ? err.message : "Publish failed"), 400);
  }
  return c.json(ok({ pathname, placement: parsed.data.placement }), 201);
});

// SuperAdmin: unpublish a path.
studioPageEmbedRoutes.delete("/page-embeds", async (c) => {
  const denied = superAdminGate(c);
  if (denied) return denied;
  const pathname = normalisePathname(c.req.query("path") ?? "");
  const removed = await pageEmbedService().unpublish(pathname);
  return c.json(ok({ pathname, removed }));
});
