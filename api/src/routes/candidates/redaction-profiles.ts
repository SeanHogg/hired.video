// redaction-profiles.ts — /api/recruit/redaction-profiles/*: reusable
// per-company PII-stripping rule sets. Thin HTTP adapters over
// services/recruit/redactionProfilesService.ts.

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";
import {
  createRedactionProfile,
  deleteRedactionProfile,
  getRedactionProfile,
  listRedactionProfiles,
  updateRedactionProfile,
} from "../../services/recruit/redactionProfilesService.js";
import { CreateRedactionProfileSchema, UpdateRedactionProfileSchema } from "../../services/recruit/schemas.js";
import { invalidPayload, respond } from "./http.js";

export const redactionProfileRoutes = new Hono<AppEnv>();

redactionProfileRoutes.get("/redaction-profiles", async (c) => {
  const userId = requireUser(c);
  return respond(c, listRedactionProfiles(userId, c.req.query("companyId")));
});

redactionProfileRoutes.get("/redaction-profiles/:id", async (c) => {
  const userId = requireUser(c);
  return respond(c, getRedactionProfile(userId, c.req.param("id")));
});

redactionProfileRoutes.post("/redaction-profiles", validateJson(CreateRedactionProfileSchema, invalidPayload(), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, createRedactionProfile(userId, body), 201);
});

redactionProfileRoutes.patch("/redaction-profiles/:id", validateJson(UpdateRedactionProfileSchema, invalidPayload(), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, updateRedactionProfile(userId, c.req.param("id"), body));
});

redactionProfileRoutes.delete("/redaction-profiles/:id", async (c) => {
  const userId = requireUser(c);
  return respond(c, deleteRedactionProfile(userId, c.req.param("id")));
});
