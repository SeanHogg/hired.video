// candidate-resumes.ts — /api/recruit/my-scope + /api/recruit/candidates/*:
// the caller's recruiting scope bootstrap and candidate résumé CRUD
// (variant tree, bulk CSV import, activate). Thin HTTP adapters over
// services/recruit/candidateResumesService.ts.

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";
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
import { invalidPayload, respond } from "./http.js";

export const candidateResumeRoutes = new Hono<AppEnv>();

/** GET /api/recruit/my-scope — companies the caller recruits for + brand kits
 *  + redaction profiles; the recruiter UI picks its default company from it. */
candidateResumeRoutes.get("/my-scope", async (c) => {
  const userId = requireUser(c);
  return respond(c, getRecruitScope(userId));
});

/** GET /api/recruit/candidates — candidate résumés in the caller's scope. */
candidateResumeRoutes.get("/candidates", async (c) => {
  const userId = requireUser(c);
  return respond(
    c,
    listCandidateResumes(userId, {
      companyId: c.req.query("companyId"),
      talentPoolCandidateId: c.req.query("talentPoolCandidateId"),
      activeOnly: c.req.query("activeOnly") === "true",
    }),
  );
});

candidateResumeRoutes.get("/candidates/:id", async (c) => {
  const userId = requireUser(c);
  return respond(c, getCandidateResume(userId, c.req.param("id")));
});

/** POST /api/recruit/candidates — create a root résumé or a variant (`parentId`). */
candidateResumeRoutes.post("/candidates", validateJson(CreateCandidateResumeSchema, invalidPayload(), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, createCandidateResume(userId, body), 201);
});

/** POST /api/recruit/candidates/bulk-csv — bulk-create from a parsed CSV upload. */
candidateResumeRoutes.post("/candidates/bulk-csv", validateJson(BulkCsvSchema, invalidPayload("Invalid CSV payload"), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, bulkImportCandidateResumes(userId, body), 201);
});

candidateResumeRoutes.patch("/candidates/:id", validateJson(UpdateCandidateResumeSchema, invalidPayload(), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, updateCandidateResume(userId, c.req.param("id"), body));
});

candidateResumeRoutes.delete("/candidates/:id", async (c) => {
  const userId = requireUser(c);
  return respond(c, deleteCandidateResume(userId, c.req.param("id")));
});

/** POST /api/recruit/candidates/:id/activate — make this variant the active one. */
candidateResumeRoutes.post("/candidates/:id/activate", async (c) => {
  const userId = requireUser(c);
  return respond(c, activateCandidateResume(userId, c.req.param("id")));
});
