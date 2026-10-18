/**
 * /api/take-home-invites — Candidate magic-link delivery for take-home
 * assignments (#1386). Mirrors the live-screening invite pattern: a
 * recruiter-side issuer + a public landing page that consumes the
 * token + accepts the submission.
 *
 *   POST /                        recruiter creates an invite (stageId + candidate)
 *   GET  /by-token/:token         public: fetch the invite preview
 *   POST /by-token/:token/start   public: stamp `started_at`
 *   POST /by-token/:token/submit  public: attach a submission id + flip to 'submitted'
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  createTakeHomeInvite,
  getTakeHomeInviteByToken,
  startTakeHomeInvite,
  submitTakeHomeInvite,
} from "../services/hiring/take-home-invites.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const takeHomeInvitesRoutes = new Hono<AppEnv>();

const NewInviteSchema = z.object({
  stageId: z.string().uuid(),
  candidateEmail: z.string().email(),
  candidateName: z.string().max(255).optional(),
  expiresInDays: z.number().int().min(1).max(60).default(14),
});

takeHomeInvitesRoutes.post("/", validateJson(NewInviteSchema, (e) => error("VALIDATION_ERROR", "Invalid invite payload", e.flatten())), async (c) => {
  requireUser(c);
  return c.json(success(await createTakeHomeInvite(c.req.valid("json"))), 201);
});

takeHomeInvitesRoutes.get("/by-token/:token", async (c) =>
  c.json(success(await getTakeHomeInviteByToken(c.req.param("token"))), 200),
);

takeHomeInvitesRoutes.post("/by-token/:token/start", async (c) =>
  c.json(success(await startTakeHomeInvite(c.req.param("token"))), 200),
);

const SubmitSchema = z.object({
  submissionId: z.string().uuid().optional(),
  /** Free-form body for assignment text submissions. The recruiter
   *  side optionally promotes this into a `take_home_submissions` row
   *  via the existing service layer; here we just stamp the invite. */
  body: z.string().max(50_000).optional(),
});

takeHomeInvitesRoutes.post("/by-token/:token/submit", validateJson(SubmitSchema, () => error("VALIDATION_ERROR", "Invalid submission")), async (c) => {
  const body = c.req.valid("json");
  return c.json(success(await submitTakeHomeInvite(c.req.param("token"), body.submissionId)), 200);
});
