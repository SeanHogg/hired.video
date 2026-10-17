// candidate-resumes.ts — /api/recruit/my-scope + /api/recruit/candidates/*:
// the caller's recruiting scope bootstrap and candidate résumé CRUD
// (variant tree, bulk CSV import, activate). Thin HTTP adapters over
// services/recruit/candidateResumesService.ts.

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { getRecruitScope } from "../../services/recruit/access.js";
import {
  activateCandidateResume,
  bulkImportCandidateResumes,
  createCandidateResume,
  deleteCandidateResume,
  getCandidateResume,
  listCandidateResumes,
  updateCandidateResume,
} from "../../services/recruit/candidateResumesService.js";
import {
  BulkCsvSchema,
  CreateCandidateResumeSchema,
  UpdateCandidateResumeSchema,
} from "../../services/recruit/schemas.js";
import { parseJsonBody, respond } from "./http.js";

export const candidateResumeRoutes = new Hono<AppEnv>();

/** GET /api/recruit/my-scope — companies the caller recruits for + brand kits
 *  + redaction profiles; the recruiter UI picks its default company from it. */
candidateResumeRoutes.get("/my-scope", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, getRecruitScope(auth.userId));
});

/** GET /api/recruit/candidates — candidate résumés in the caller's scope. */
candidateResumeRoutes.get("/candidates", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(
    c,
    listCandidateResumes(auth.userId, {
      companyId: c.req.query("companyId"),
      talentPoolCandidateId: c.req.query("talentPoolCandidateId"),
      activeOnly: c.req.query("activeOnly") === "true",
    }),
  );
});

candidateResumeRoutes.get("/candidates/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, getCandidateResume(auth.userId, c.req.param("id")));
});

/** POST /api/recruit/candidates — create a root résumé or a variant (`parentId`). */
candidateResumeRoutes.post("/candidates", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseJsonBody(c, CreateCandidateResumeSchema);
  if ("response" in body) return body.response;
  return respond(c, createCandidateResume(auth.userId, body.data), 201);
});

/** POST /api/recruit/candidates/bulk-csv — bulk-create from a parsed CSV upload. */
candidateResumeRoutes.post("/candidates/bulk-csv", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseJsonBody(c, BulkCsvSchema, "Invalid CSV payload");
  if ("response" in body) return body.response;
  return respond(c, bulkImportCandidateResumes(auth.userId, body.data), 201);
});

candidateResumeRoutes.patch("/candidates/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseJsonBody(c, UpdateCandidateResumeSchema);
  if ("response" in body) return body.response;
  return respond(c, updateCandidateResume(auth.userId, c.req.param("id"), body.data));
});

candidateResumeRoutes.delete("/candidates/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, deleteCandidateResume(auth.userId, c.req.param("id")));
});

/** POST /api/recruit/candidates/:id/activate — make this variant the active one. */
candidateResumeRoutes.post("/candidates/:id/activate", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, activateCandidateResume(auth.userId, c.req.param("id")));
});
