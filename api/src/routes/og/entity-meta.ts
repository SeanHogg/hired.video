/**
 * Crawler meta JSON — ONE generic handler registered for every path of every
 * kind in OG_META_ENTITIES (`/v/:videoId/meta`, `/voice/:slug/meta`,
 * `/article/:userRef/:slug/meta`, …). Returned to the Cloudflare Pages
 * Function so it can rewrite per-content og:title / og:description (+ inject
 * JSON-LD) on the SPA HTML for social and search crawlers.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { OG_META_ENTITIES } from "../../services/og/og-entity-registry.js";

export const ogEntityMetaRoutes = new Hono<AppEnv>();

for (const entity of OG_META_ENTITIES) {
  for (const path of entity.paths) {
    ogEntityMetaRoutes.get(path, async (c) => {
      const origin = new URL(c.req.url).origin;
      if (entity.cacheControl) c.header("Cache-Control", entity.cacheControl);
      return c.json(await entity.build(c.req.param(), origin));
    });
  }
}
