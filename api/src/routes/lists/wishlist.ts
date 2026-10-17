// /api/lists/wishlist/* — the one canonical per-user heart list (thin HTTP
// adapters over services/lists/wishlistService.ts).
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { isListItemEntityType } from "../../services/lists/listAccess.js";
import {
  getEnrichedWishlist,
  getWishlistIds,
  isWishlistEnrichableType,
  toggleWishlist,
} from "../../services/lists/wishlistService.js";
import { parseBody, respond, WishlistToggleSchema } from "./http.js";

export const wishlistRoutes = new Hono<AppEnv>();

// POST /api/lists/wishlist/toggle — add/remove an entity from the caller's
// wishlist. Returns the resulting state so the heart can render optimistically.
wishlistRoutes.post("/wishlist/toggle", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseBody(c, WishlistToggleSchema);
  if ("response" in body) return body.response;
  return respond(c, toggleWishlist(auth.userId, body.data.entityType, body.data.entityId));
});

// GET /api/lists/wishlist/ids?entityType=course — the set of wishlisted entity
// ids for one type. Drives heart-state hydration across a whole grid in one
// round-trip. Cached read-through per (user, type); invalidated on toggle.
wishlistRoutes.get("/wishlist/ids", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const entityType = c.req.query("entityType");
  if (!isListItemEntityType(entityType)) {
    return c.json(error("VALIDATION_ERROR", "Valid entityType is required"), 400);
  }
  return respond(
    c,
    getWishlistIds(auth.userId, entityType).then((ids) => ({ ids })),
  );
});

// GET /api/lists/wishlist/enriched?entityType=course — wishlisted items of one
// type, enriched into the same marketplace-card shape the feed uses, so the
// /wishlist page reuses the exact card component.
wishlistRoutes.get("/wishlist/enriched", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const entityType = c.req.query("entityType");
  if (!isWishlistEnrichableType(entityType)) {
    return c.json(error("VALIDATION_ERROR", "Valid enrichable entityType is required"), 400);
  }
  return respond(c, getEnrichedWishlist(auth.userId, entityType));
});

// GET /api/lists/wishlist/courses — back-compat alias for clients precached by
// the service worker BEFORE the endpoint was generalised to `/wishlist/enriched`
// (the SW aggressively precaches JS, so old bundles linger after a rename).
// Safe to remove once no cached client references it.
wishlistRoutes.get("/wishlist/courses", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, getEnrichedWishlist(auth.userId, "course"));
});
