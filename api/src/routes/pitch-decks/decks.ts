// decks.ts — /api/recruit/pitch-decks deck CRUD + /:id/slides management.
// Thin HTTP adapters over services/recruit/pitchDecksService.ts.

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import {
  addPitchDeckSlide,
  createPitchDeck,
  deletePitchDeck,
  deletePitchDeckSlide,
  getPitchDeck,
  listPitchDecks,
  updatePitchDeck,
  updatePitchDeckSlide,
} from "../../services/recruit/pitchDecksService.js";
import {
  AddSlideSchema,
  CreateDeckSchema,
  UpdateDeckSchema,
  UpdateSlideSchema,
} from "../../services/recruit/schemas.js";
import { parseJsonBody, respond } from "../candidates/http.js";

export const pitchDeckCrudRoutes = new Hono<AppEnv>();

// ─── pitch_decks CRUD ────────────────────────────────────────────────────────

pitchDeckCrudRoutes.get("/", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, listPitchDecks(auth.userId, c.req.query("companyId")));
});

/** GET /:id — the deck with its slides in display order. */
pitchDeckCrudRoutes.get("/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, getPitchDeck(auth.userId, c.req.param("id")));
});

pitchDeckCrudRoutes.post("/", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseJsonBody(c, CreateDeckSchema);
  if ("response" in body) return body.response;
  return respond(c, createPitchDeck(auth.userId, body.data), 201);
});

pitchDeckCrudRoutes.patch("/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseJsonBody(c, UpdateDeckSchema);
  if ("response" in body) return body.response;
  return respond(c, updatePitchDeck(auth.userId, c.req.param("id"), body.data));
});

pitchDeckCrudRoutes.delete("/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, deletePitchDeck(auth.userId, c.req.param("id")));
});

// ─── pitch_deck_candidates (slides) ──────────────────────────────────────────

pitchDeckCrudRoutes.post("/:id/slides", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseJsonBody(c, AddSlideSchema);
  if ("response" in body) return body.response;
  return respond(c, addPitchDeckSlide(auth.userId, c.req.param("id"), body.data), 201);
});

pitchDeckCrudRoutes.patch("/:id/slides/:slideId", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseJsonBody(c, UpdateSlideSchema);
  if ("response" in body) return body.response;
  return respond(
    c,
    updatePitchDeckSlide(auth.userId, c.req.param("id"), c.req.param("slideId"), body.data),
  );
});

pitchDeckCrudRoutes.delete("/:id/slides/:slideId", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, deletePitchDeckSlide(auth.userId, c.req.param("id"), c.req.param("slideId")));
});
