// shares.ts — pitch-deck share links: /api/recruit/pitch-decks/:id/shares
// (list/create), /api/recruit/pitch-decks/shares/:shareId (update/revoke —
// a revoke only needs the share id), and the unauthenticated reviewer view
// mounted at /api/public/pitch-deck/:token. Thin HTTP adapters over
// services/recruit/pitchDeckSharesService.ts.

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";
import {
  createPitchDeckShare,
  listPitchDeckShares,
  revokePitchDeckShare,
  updatePitchDeckShare,
  viewSharedPitchDeck,
} from "../../services/recruit/pitchDeckSharesService.js";
import { CreateDeckShareSchema, UpdateDeckShareSchema } from "../../services/recruit/schemas.js";
import { invalidPayload, respond } from "../candidates/http.js";

export const pitchDeckShareRoutes = new Hono<AppEnv>();

pitchDeckShareRoutes.get("/:id/shares", async (c) => {
  const userId = requireUser(c);
  return respond(c, listPitchDeckShares(userId, c.req.param("id")));
});

pitchDeckShareRoutes.post("/:id/shares", validateJson(CreateDeckShareSchema, invalidPayload(), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, createPitchDeckShare(userId, c.req.param("id"), body), 201);
});

pitchDeckShareRoutes.patch("/shares/:shareId", validateJson(UpdateDeckShareSchema, invalidPayload(), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, updatePitchDeckShare(userId, c.req.param("shareId"), body));
});

pitchDeckShareRoutes.delete("/shares/:shareId", async (c) => {
  const userId = requireUser(c);
  return respond(c, revokePitchDeckShare(userId, c.req.param("shareId")));
});

/** Public (no auth) — mounted at /api/public/pitch-deck. */
export const pitchDeckPublicShareRoutes = new Hono<AppEnv>();

pitchDeckPublicShareRoutes.get("/:token", async (c) => {
  return respond(c, viewSharedPitchDeck(c.req.param("token")));
});
