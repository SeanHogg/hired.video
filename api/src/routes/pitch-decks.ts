// pitch-decks.ts — composition root for recruiter-authored pitch decks of
// redacted/branded candidates (gap #99), mounted at
// /api/recruit/pitch-decks; plus the public deck view mounted at
// /api/public/pitch-deck (no auth middleware). Sibling of candidates.ts.
//
// Sub-routers (routes/pitch-decks/*, full paths, order preserved):
//   • decks.ts  — / (list/create), /:id (get/patch/delete), /:id/slides[/:slideId]
//   • shares.ts — /:id/shares (list/create), /shares/:shareId (patch/revoke),
//                 and the public /:token reviewer view
// Use cases: services/recruit/pitchDecksService + pitchDeckSharesService;
// data: repositories/pitchDecksRepository.

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { pitchDeckCrudRoutes } from "./pitch-decks/decks.js";
import { pitchDeckShareRoutes, pitchDeckPublicShareRoutes } from "./pitch-decks/shares.js";

export const pitchDeckRoutes = new Hono<AppEnv>();
pitchDeckRoutes.route("/", pitchDeckCrudRoutes);
pitchDeckRoutes.route("/", pitchDeckShareRoutes);

/** GET /api/public/pitch-deck/:token — unauthenticated reviewer view. */
export const pitchDeckPublicRoutes = new Hono<AppEnv>();
pitchDeckPublicRoutes.route("/", pitchDeckPublicShareRoutes);
