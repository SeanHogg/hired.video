// decks.ts — /api/recruit/pitch-decks deck CRUD + /:id/slides management.
// Thin HTTP adapters over services/recruit/pitchDecksService.ts.

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";
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
import { invalidPayload, respond } from "../candidates/http.js";

export const pitchDeckCrudRoutes = new Hono<AppEnv>();

// ─── pitch_decks CRUD ────────────────────────────────────────────────────────

pitchDeckCrudRoutes.get("/", async (c) => {
  const userId = requireUser(c);
  return respond(c, listPitchDecks(userId, c.req.query("companyId")));
});

/** GET /:id — the deck with its slides in display order. */
pitchDeckCrudRoutes.get("/:id", async (c) => {
  const userId = requireUser(c);
  return respond(c, getPitchDeck(userId, c.req.param("id")));
});

pitchDeckCrudRoutes.post("/", validateJson(CreateDeckSchema, invalidPayload(), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, createPitchDeck(userId, body), 201);
});

pitchDeckCrudRoutes.patch("/:id", validateJson(UpdateDeckSchema, invalidPayload(), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, updatePitchDeck(userId, c.req.param("id"), body));
});

pitchDeckCrudRoutes.delete("/:id", async (c) => {
  const userId = requireUser(c);
  return respond(c, deletePitchDeck(userId, c.req.param("id")));
});

// ─── pitch_deck_candidates (slides) ──────────────────────────────────────────

pitchDeckCrudRoutes.post("/:id/slides", validateJson(AddSlideSchema, invalidPayload(), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, addPitchDeckSlide(userId, c.req.param("id"), body), 201);
});

pitchDeckCrudRoutes.patch("/:id/slides/:slideId", validateJson(UpdateSlideSchema, invalidPayload(), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(
    c,
    updatePitchDeckSlide(userId, c.req.param("id"), c.req.param("slideId"), body),
  );
});

pitchDeckCrudRoutes.delete("/:id/slides/:slideId", async (c) => {
  const userId = requireUser(c);
  return respond(c, deletePitchDeckSlide(userId, c.req.param("id"), c.req.param("slideId")));
});
