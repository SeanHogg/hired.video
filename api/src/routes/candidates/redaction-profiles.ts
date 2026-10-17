// redaction-profiles.ts — /api/recruit/redaction-profiles/*: reusable
// per-company PII-stripping rule sets. Thin HTTP adapters over
// services/recruit/redactionProfilesService.ts.

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import {
  createRedactionProfile,
  deleteRedactionProfile,
  getRedactionProfile,
  listRedactionProfiles,
  updateRedactionProfile,
} from "../../services/recruit/redactionProfilesService.js";
import { CreateRedactionProfileSchema, UpdateRedactionProfileSchema } from "../../services/recruit/schemas.js";
import { parseJsonBody, respond } from "./http.js";

export const redactionProfileRoutes = new Hono<AppEnv>();

redactionProfileRoutes.get("/redaction-profiles", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, listRedactionProfiles(auth.userId, c.req.query("companyId")));
});

redactionProfileRoutes.get("/redaction-profiles/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, getRedactionProfile(auth.userId, c.req.param("id")));
});

redactionProfileRoutes.post("/redaction-profiles", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseJsonBody(c, CreateRedactionProfileSchema);
  if ("response" in body) return body.response;
  return respond(c, createRedactionProfile(auth.userId, body.data), 201);
});

redactionProfileRoutes.patch("/redaction-profiles/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseJsonBody(c, UpdateRedactionProfileSchema);
  if ("response" in body) return body.response;
  return respond(c, updateRedactionProfile(auth.userId, c.req.param("id"), body.data));
});

redactionProfileRoutes.delete("/redaction-profiles/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, deleteRedactionProfile(auth.userId, c.req.param("id")));
});
