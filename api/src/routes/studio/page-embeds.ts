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
import { success, error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

export const studioPageEmbedRoutes = new Hono<AppEnv>();

const PublishEmbedSchema = z.object({
  pathname: z.string().min(1).max(512),
  projectId: UuidLikeSchema,
  placement: z.enum(["hero", "inline"]).default("hero"),
});

/** 401 / 403 for the SuperAdmin management surface, or null when allowed. */
function superAdminGate(c: Context<AppEnv>): Response | null {
  const user = c.var.user;
  requireUser(c);
  if (!isSuperAdmin(user)) return c.json(error("FORBIDDEN", "SuperAdmin access required"), 403);
  return null;
}

// Public membership set — the client fetches this once (cached) and only
// runs the full resolve below when the current route is in the set (#1863).
studioPageEmbedRoutes.get("/page-embeds/paths", async (c) => {
  return c.json(success({ paths: await pageEmbedService().listActivePathsCached() }));
});

// Public resolver — 200 with `{ embed: null }` (not 404) so the client can
// cache "no embed here" cheaply without treating it as an error.
studioPageEmbedRoutes.get("/page-embeds/resolve", async (c) => {
  const path = normalisePathname(c.req.query("path") ?? "");
  return c.json(success({ embed: await pageEmbedService().resolveForPathCached(path) }));
});

// SuperAdmin: list all active mappings (management surface).
studioPageEmbedRoutes.get("/page-embeds", async (c) => {
  const denied = superAdminGate(c);
  if (denied) return denied;
  return c.json(success({ embeds: await pageEmbedService().listActive() }));
});

// SuperAdmin: publish a project to a path (upsert).
studioPageEmbedRoutes.post("/page-embeds", validateJson(PublishEmbedSchema, undefined, { emptyBody: null }), async (c) => {
  const denied = superAdminGate(c);
  if (denied) return denied;
  const body = c.req.valid("json");
  const pathname = normalisePathname(body.pathname);
  try {
    await pageEmbedService().publish({
      pathname,
      projectId: body.projectId,
      placement: body.placement,
      userId: c.var.userId,
    });
  } catch (err) {
    return c.json(error("PUBLISH_FAILED", err instanceof Error ? err.message : "Publish failed"), 400);
  }
  return c.json(success({ pathname, placement: body.placement }), 201);
});

// SuperAdmin: unpublish a path.
studioPageEmbedRoutes.delete("/page-embeds", async (c) => {
  const denied = superAdminGate(c);
  if (denied) return denied;
  const pathname = normalisePathname(c.req.query("path") ?? "");
  const removed = await pageEmbedService().unpublish(pathname);
  return c.json(success({ pathname, removed }));
});
