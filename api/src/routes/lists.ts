// /api/lists — composition root for generic, polymorphic Lists (People / Jobs /
// Résumés / Companies / pipeline entries / courses / voice clones). Lightweight
// bookmarks distinct from the recruiter CRM lists.
//
// Sub-routers (routes/lists/):
//   • lists.ts    — list CRUD (GET/POST /, PATCH/DELETE /:id) + items
//                   (GET/POST/DELETE /:id/items, DELETE /:id/items/:itemId)
//   • wishlist.ts — /wishlist/toggle, /wishlist/ids, /wishlist/enriched,
//                   /wishlist/courses (back-compat alias)
//   • http.ts     — zod schemas + respond/parseBody adapters
//
// Visibility/mutation rules: services/lists/listAccess.ts. Use cases:
// services/lists/listsService.ts + wishlistService.ts. Data access:
// repositories/listsRepository.ts + listEntitiesRepository.ts.

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { listsCrudRoutes } from "./lists/lists.js";
import { wishlistRoutes } from "./lists/wishlist.js";

export const listsRoutes = new Hono<AppEnv>();

listsRoutes.route("/", listsCrudRoutes);
listsRoutes.route("/", wishlistRoutes);

listsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Lists route not found" } }, 404),
);
