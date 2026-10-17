// shares.ts — /api/recruit/shares/* (tokenized branded + redacted
// candidate-résumé share links) and the unauthenticated reviewer view
// mounted at /api/public/candidate-resume/:token. Thin HTTP adapters over
// services/recruit/candidateResumeSharesService.ts.

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import {
  createCandidateResumeShare,
  listCandidateResumeShares,
  revokeCandidateResumeShare,
  updateCandidateResumeShare,
  viewSharedCandidateResume,
} from "../../services/recruit/candidateResumeSharesService.js";
import { CreateShareSchema, UpdateShareSchema } from "../../services/recruit/schemas.js";
import { parseJsonBody, respond } from "./http.js";

export const candidateShareRoutes = new Hono<AppEnv>();

candidateShareRoutes.get("/shares", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(
    c,
    listCandidateResumeShares(auth.userId, {
      companyId: c.req.query("companyId"),
      candidateResumeId: c.req.query("candidateResumeId"),
    }),
  );
});

candidateShareRoutes.post("/shares", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseJsonBody(c, CreateShareSchema);
  if ("response" in body) return body.response;
  return respond(c, createCandidateResumeShare(auth.userId, body.data), 201);
});

candidateShareRoutes.patch("/shares/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseJsonBody(c, UpdateShareSchema);
  if ("response" in body) return body.response;
  return respond(c, updateCandidateResumeShare(auth.userId, c.req.param("id"), body.data));
});

candidateShareRoutes.delete("/shares/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, revokeCandidateResumeShare(auth.userId, c.req.param("id")));
});

/** Public (no auth) — mounted at /api/public/candidate-resume. Redacted
 *  résumé + brand overlay; every failure is the same 404. */
export const candidateResumePublicShareRoutes = new Hono<AppEnv>();

candidateResumePublicShareRoutes.get("/:token", async (c) => {
  return respond(c, viewSharedCandidateResume(c.req.param("token")));
});
