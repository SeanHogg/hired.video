/**
 * Entity social-card images — ONE generic handler registered for every path
 * of every kind in OG_IMAGE_ENTITIES (`/companies/:id`, `/v/:videoId`,
 * `/m/:videoId`, `/r/:id`, `/voice/:slug`, `/creator/:userId`).
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { OG_IMAGE_ENTITIES } from "../../services/og/og-entity-registry.js";
import { svgResponse } from "./svg-response.js";

export const ogEntityImageRoutes = new Hono<AppEnv>();

for (const entity of OG_IMAGE_ENTITIES) {
  for (const path of entity.paths) {
    ogEntityImageRoutes.get(path, async (c) => {
      const result = await entity.render(c.req.param());
      if (result.type === "redirect") return c.redirect(result.url, 302);
      return svgResponse(result.svg, result.longCache);
    });
  }
}
