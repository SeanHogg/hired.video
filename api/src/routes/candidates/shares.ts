// shares.ts — /api/recruit/shares/* (tokenized branded + redacted
// candidate-résumé share links) and the unauthenticated reviewer view
// mounted at /api/public/candidate-resume/:token. Thin HTTP adapters over
// services/recruit/candidateResumeSharesService.ts.

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";
import {
  createCandidateResumeShare,
  listCandidateResumeShares,
  revokeCandidateResumeShare,
  updateCandidateResumeShare,
  viewSharedCandidateResume,
} from "../../services/recruit/candidateResumeSharesService.js";
import { CreateShareSchema, UpdateShareSchema } from "../../services/recruit/schemas.js";
import { invalidPayload, respond } from "./http.js";

export const candidateShareRoutes = new Hono<AppEnv>();

candidateShareRoutes.get("/shares", async (c) => {
  const userId = requireUser(c);
  return respond(
    c,
    listCandidateResumeShares(userId, {
      companyId: c.req.query("companyId"),
      candidateResumeId: c.req.query("candidateResumeId"),
    }),
  );
});

candidateShareRoutes.post("/shares", validateJson(CreateShareSchema, invalidPayload(), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, createCandidateResumeShare(userId, body), 201);
});

candidateShareRoutes.patch("/shares/:id", validateJson(UpdateShareSchema, invalidPayload(), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, updateCandidateResumeShare(userId, c.req.param("id"), body));
});

candidateShareRoutes.delete("/shares/:id", async (c) => {
  const userId = requireUser(c);
  return respond(c, revokeCandidateResumeShare(userId, c.req.param("id")));
});

/** Public (no auth) — mounted at /api/public/candidate-resume. Redacted
 *  résumé + brand overlay; every failure is the same 404. */
export const candidateResumePublicShareRoutes = new Hono<AppEnv>();

candidateResumePublicShareRoutes.get("/:token", async (c) => {
  return respond(c, viewSharedCandidateResume(c.req.param("token")));
});
