/**
 * /api/recruiter profile extraction (recruiter extension): page HTML →
 * extracted_profiles row (deduped) + linked talent-pool candidate.
 * Single profile and bulk list-view capture (#1358).
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { recruiterLlmFactory } from "../../services/recruiter/llm.js";
import {
  ExtractProfileSchema,
  ExtractProfilesBatchSchema,
  extractProfile,
  extractProfilesBatch,
} from "../../services/recruiter/profile-extraction.js";
import { handle } from "./http.js";
import { validateJson } from "../helpers/validate.js";

export const profileExtractionRoutes = new Hono<AppEnv>();

// POST /extract-profile — 201 on create, 200 on a dedup hit. LLM dispatch
// failures keep their AI envelope status/code/payload (upgrade banner).
profileExtractionRoutes.post("/extract-profile", validateJson(ExtractProfileSchema, undefined, { emptyBody: null }), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  return handle(c, "envelope", async () => {
    const result = await extractProfile(recruiterLlmFactory(c.env, c.var.user), {
      html: body.html,
      sourceUrl: body.sourceUrl,
      force: body.force,
      recruiterId: user.sub,
    });
    return c.json(success(result), result.duplicate ? 200 : 201);
  });
});

// POST /extract-profiles/batch — up to 25 profile cards from one list page;
// per-card failures don't abort the batch.
profileExtractionRoutes.post("/extract-profiles/batch", validateJson(ExtractProfilesBatchSchema, undefined, { emptyBody: null }), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const result = await extractProfilesBatch(recruiterLlmFactory(c.env, c.var.user), {
    sourceUrl: body.sourceUrl,
    cards: body.cards,
    force: body.force,
    recruiterId: user.sub,
  });
  return c.json(success(result), 201);
});
