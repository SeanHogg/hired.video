// shares.ts — pitch-deck share links: /api/recruit/pitch-decks/:id/shares
// (list/create), /api/recruit/pitch-decks/shares/:shareId (update/revoke —
// a revoke only needs the share id), and the unauthenticated reviewer view
// mounted at /api/public/pitch-deck/:token. Thin HTTP adapters over
// services/recruit/pitchDeckSharesService.ts.

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import {
  createPitchDeckShare,
  listPitchDeckShares,
  revokePitchDeckShare,
  updatePitchDeckShare,
  viewSharedPitchDeck,
} from "../../services/recruit/pitchDeckSharesService.js";
import { CreateDeckShareSchema, UpdateDeckShareSchema } from "../../services/recruit/schemas.js";
import { parseJsonBody, respond } from "../candidates/http.js";

export const pitchDeckShareRoutes = new Hono<AppEnv>();

pitchDeckShareRoutes.get("/:id/shares", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, listPitchDeckShares(auth.userId, c.req.param("id")));
});

pitchDeckShareRoutes.post("/:id/shares", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseJsonBody(c, CreateDeckShareSchema);
  if ("response" in body) return body.response;
  return respond(c, createPitchDeckShare(auth.userId, c.req.param("id"), body.data), 201);
});

pitchDeckShareRoutes.patch("/shares/:shareId", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseJsonBody(c, UpdateDeckShareSchema);
  if ("response" in body) return body.response;
  return respond(c, updatePitchDeckShare(auth.userId, c.req.param("shareId"), body.data));
});

pitchDeckShareRoutes.delete("/shares/:shareId", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, revokePitchDeckShare(auth.userId, c.req.param("shareId")));
});

/** Public (no auth) — mounted at /api/public/pitch-deck. */
export const pitchDeckPublicShareRoutes = new Hono<AppEnv>();

pitchDeckPublicShareRoutes.get("/:token", async (c) => {
  return respond(c, viewSharedPitchDeck(c.req.param("token")));
});
